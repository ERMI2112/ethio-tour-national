import { createHash, randomUUID } from 'node:crypto';

import { authorize } from '@ethio-tour/authz';
import type { AuthorizationRequirement, Capability, PolicyDecision } from '@ethio-tour/authz';
import type {
  EditorialContent,
  PrivateRegistryResourceResponse,
  PublicAttraction,
  PublicDestination,
  RegistryResourceKind,
  RegistryRevisionState,
  ReviewDecision,
} from '@ethio-tour/contracts';

import type {
  RegistryActor,
  RegistryResourceRecord,
  RegistryStore,
  RegistryTransaction,
  ResourceRevisionRecord,
} from './registry-store';

const POLICY_VERSION = 'synthetic-registry-demo-v1';

export class RegistryError extends Error {
  constructor(
    public readonly code: 'unauthenticated' | 'forbidden' | 'not_found' | 'conflict' | 'invalid',
    public readonly reason: string,
  ) {
    super(reason);
    this.name = 'RegistryError';
  }
}

interface CreateInput {
  organizationId: string;
  administrativeUnitId: string;
  content: EditorialContent;
}

export type PrivateRegistryResource = PrivateRegistryResourceResponse;

interface TransactionOutcome<T> {
  value?: T;
  error?: RegistryError;
}

interface AuthorizedResource {
  resource: RegistryResourceRecord;
  membershipId: string;
}

export class RegistryService {
  constructor(private readonly store: RegistryStore) {}

  createDestination(actor: RegistryActor, input: CreateInput): Promise<PrivateRegistryResource> {
    return this.mutate(actor, 'registry.resource.create.destination', null, async (tx) =>
      this.createResource(tx, actor, 'destination', input, null),
    );
  }

  createAttraction(
    actor: RegistryActor,
    input: CreateInput & { destinationId: string },
  ): Promise<PrivateRegistryResource> {
    return this.mutate(
      actor,
      'registry.resource.create.attraction',
      input.destinationId,
      async (tx) => {
        const { resource: destination } = await this.requireScopedResource(
          tx,
          actor,
          input.destinationId,
          'registry:resource:read',
        );
        if (destination.kind !== 'destination') {
          throw new RegistryError('invalid', 'A valid destination is required.');
        }

        if (destination.administrativeUnitId !== input.administrativeUnitId) {
          throw new RegistryError(
            'invalid',
            'The attraction must use its destination geographic unit.',
          );
        }

        return this.createResource(tx, actor, 'attraction', input, input.destinationId);
      },
    );
  }

  createRevision(
    actor: RegistryActor,
    resourceId: string,
    expectedVersion: number,
    content: EditorialContent,
  ): Promise<PrivateRegistryResource> {
    return this.mutate(actor, 'registry.resource.revise', resourceId, async (tx) => {
      const { resource, membershipId } = await this.requireScopedResource(
        tx,
        actor,
        resourceId,
        'registry:resource:edit',
      );
      this.requireVersion(resource, expectedVersion);
      const normalizedContent = this.validateContent(content);
      const current = await tx.getCurrentRevision(resource);
      if (!current) {
        throw new RegistryError('conflict', 'The current revision is unavailable.');
      }

      const revision: ResourceRevisionRecord = {
        id: randomUUID(),
        resourceId,
        revisionNumber: resource.currentRevisionNumber + 1,
        author: actor,
        authorMembershipId: membershipId,
        content: normalizedContent,
        contentHash: this.contentHash(normalizedContent),
      };

      await tx.createRevision(revision);
      await tx.setCurrentRevision(resource.id, revision.id, revision.revisionNumber);
      const updated = {
        ...resource,
        currentRevisionId: revision.id,
        currentRevisionNumber: revision.revisionNumber,
        version: resource.version + 1,
      };
      await this.recordAllowed(
        tx,
        actor,
        'registry.resource.revise',
        updated,
        revision.id,
        membershipId,
      );
      await tx.enqueueOutbox({
        eventType: 'registry.resource.revised',
        resourceId,
        revisionId: revision.id,
        recipientSubjectIds: [actor.subjectId],
        payload: { resourceId, revisionId: revision.id },
      });
      return this.toPrivateResponse(updated, revision, null);
    });
  }

  submitRevision(
    actor: RegistryActor,
    resourceId: string,
    revisionId: string,
    expectedVersion: number,
  ): Promise<PrivateRegistryResource> {
    return this.mutate(actor, 'registry.submission.submit', resourceId, async (tx) => {
      const { resource, membershipId } = await this.requireScopedResource(
        tx,
        actor,
        resourceId,
        'registry:submission:submit',
      );
      this.requireVersion(resource, expectedVersion);
      const revision = await this.requireCurrentRevision(tx, resource, revisionId);
      const priorSubmission = await tx.getSubmission(revisionId);
      if (priorSubmission) {
        throw new RegistryError('conflict', 'This revision has already been submitted.');
      }

      const submissionId = randomUUID();
      await tx.createSubmission({
        id: submissionId,
        resourceId,
        revisionId,
        submittedBy: actor,
        submittedByMembershipId: membershipId,
      });
      await tx.incrementVersion(resource.id);
      const updated = { ...resource, version: resource.version + 1 };
      await this.recordAllowed(
        tx,
        actor,
        'registry.submission.submit',
        updated,
        revisionId,
        membershipId,
      );
      await tx.enqueueOutbox({
        eventType: 'registry.submission.submitted',
        resourceId,
        revisionId,
        recipientSubjectIds: await tx.findReviewRecipients(resource),
        payload: { resourceId, revisionId, submissionId },
      });
      return this.toPrivateResponse(updated, revision, 'submitted');
    });
  }

  reviewRevision(
    actor: RegistryActor,
    resourceId: string,
    revisionId: string,
    expectedVersion: number,
    decision: ReviewDecision,
    reason: string,
  ): Promise<PrivateRegistryResource> {
    return this.mutate(actor, 'registry.submission.review', resourceId, async (tx) => {
      const { resource, membershipId } = await this.requireScopedResource(
        tx,
        actor,
        resourceId,
        'registry:submission:review',
      );
      this.requireVersion(resource, expectedVersion);
      const revision = await this.requireCurrentRevision(tx, resource, revisionId);
      const submission = await tx.getSubmission(revisionId);
      if (!submission || submission.reviewDecision) {
        throw new RegistryError('conflict', 'The submitted revision is no longer reviewable.');
      }
      if (this.sameActor(actor, revision.author) || this.sameActor(actor, submission.submittedBy)) {
        throw new RegistryError('forbidden', 'An author or submitter cannot review this revision.');
      }
      if (!reason.trim()) {
        throw new RegistryError('invalid', 'A review reason is required.');
      }

      await tx.createReviewDecision(submission.id, {
        decision,
        reviewer: actor,
        reviewerMembershipId: membershipId,
        reason: reason.trim(),
        policyVersion: POLICY_VERSION,
      });
      await tx.incrementVersion(resource.id);
      const updated = { ...resource, version: resource.version + 1 };
      await this.recordAllowed(
        tx,
        actor,
        'registry.submission.review',
        updated,
        revisionId,
        membershipId,
        { decision },
      );
      await tx.enqueueOutbox({
        eventType: 'registry.submission.reviewed',
        resourceId,
        revisionId,
        recipientSubjectIds: [
          ...new Set([revision.author.subjectId, submission.submittedBy.subjectId]),
        ],
        payload: { resourceId, revisionId, decision },
      });
      return this.toPrivateResponse(updated, revision, decisionState(decision));
    });
  }

  publishRevision(
    actor: RegistryActor,
    resourceId: string,
    revisionId: string,
    expectedVersion: number,
  ): Promise<PrivateRegistryResource> {
    return this.mutate(actor, 'registry.publication.publish', resourceId, async (tx) => {
      const { resource, membershipId } = await this.requireScopedResource(
        tx,
        actor,
        resourceId,
        'registry:publication:publish',
      );
      this.requireVersion(resource, expectedVersion);
      const revision = await this.requireCurrentRevision(tx, resource, revisionId);
      const submission = await tx.getSubmission(revisionId);
      if (!submission || submission.reviewDecision?.decision !== 'approve') {
        throw new RegistryError('conflict', 'Only an approved revision can be published.');
      }
      if (
        this.sameActor(actor, revision.author) ||
        this.sameActor(actor, submission.reviewDecision.reviewer)
      ) {
        throw new RegistryError(
          'forbidden',
          'The publisher must be independent of the author and reviewer.',
        );
      }

      const releaseId = randomUUID();
      await tx.createRelease({
        id: releaseId,
        resourceId,
        revisionId,
        submissionId: submission.id,
        releaseNumber: await tx.nextReleaseNumber(resourceId),
        publisher: actor,
        publisherMembershipId: membershipId,
      });
      await tx.setCurrentPublication(resourceId, releaseId);
      const updated = {
        ...resource,
        currentPublicationReleaseId: releaseId,
        currentPublicationRevisionId: revisionId,
        version: resource.version + 1,
      };
      await this.recordAllowed(
        tx,
        actor,
        'registry.publication.publish',
        updated,
        revisionId,
        membershipId,
      );
      await tx.enqueueOutbox({
        eventType: 'registry.publication.released',
        resourceId,
        revisionId,
        recipientSubjectIds: [revision.author.subjectId],
        payload: { resourceId, revisionId, releaseId },
      });
      return this.toPrivateResponse(updated, revision, 'approved');
    });
  }

  withdrawPublication(
    actor: RegistryActor,
    resourceId: string,
    expectedVersion: number,
    reason: string,
  ): Promise<PrivateRegistryResource> {
    return this.mutate(actor, 'registry.publication.withdraw', resourceId, async (tx) => {
      const { resource, membershipId } = await this.requireScopedResource(
        tx,
        actor,
        resourceId,
        'registry:publication:withdraw',
      );
      this.requireVersion(resource, expectedVersion);
      if (!resource.currentPublicationReleaseId) {
        throw new RegistryError('conflict', 'There is no active publication to withdraw.');
      }
      if (!reason.trim()) {
        throw new RegistryError('invalid', 'A withdrawal reason is required.');
      }
      const publishedRevisionId = resource.currentPublicationRevisionId;
      const publishedRevision = publishedRevisionId
        ? await tx.getRevision(resource.id, publishedRevisionId)
        : null;
      const currentRevision = await tx.getCurrentRevision(resource);
      if (!publishedRevision || !currentRevision) {
        throw new RegistryError('conflict', 'The current revision is unavailable.');
      }
      await tx.withdrawRelease({
        releaseId: resource.currentPublicationReleaseId,
        actor,
        membershipId,
        reason: reason.trim(),
      });
      await tx.setCurrentPublication(resourceId, null);
      const updated = {
        ...resource,
        currentPublicationReleaseId: null,
        currentPublicationRevisionId: null,
        version: resource.version + 1,
      };
      await this.recordAllowed(
        tx,
        actor,
        'registry.publication.withdraw',
        updated,
        publishedRevision.id,
        membershipId,
      );
      await tx.enqueueOutbox({
        eventType: 'registry.publication.withdrawn',
        resourceId,
        revisionId: publishedRevision.id,
        recipientSubjectIds: [publishedRevision.author.subjectId],
        payload: { resourceId, reason: reason.trim() },
      });
      return this.toPrivateResponse(
        updated,
        currentRevision,
        await this.currentRevisionState(tx, currentRevision.id),
      );
    });
  }

  getPrivateResource(actor: RegistryActor, resourceId: string): Promise<PrivateRegistryResource> {
    return this.mutate(actor, 'registry.resource.read', resourceId, async (tx) => {
      const { resource, membershipId } = await this.requireScopedResource(
        tx,
        actor,
        resourceId,
        'registry:resource:read',
      );
      const revision = await tx.getCurrentRevision(resource);
      if (!revision) {
        throw new RegistryError('not_found', 'Registry resource was not found.');
      }
      await this.recordAllowed(
        tx,
        actor,
        'registry.resource.read',
        resource,
        revision.id,
        membershipId,
      );
      return this.toPrivateResponse(
        resource,
        revision,
        await this.currentRevisionState(tx, revision.id),
      );
    });
  }

  async listPublicDestinations(): Promise<PublicDestination[]> {
    return (await this.store.getPublicResources('destination')).map((record) => ({
      id: record.id,
      title: record.content.title,
      summary: record.content.summary,
      revisionId: record.revisionId,
    }));
  }

  async listPublicAttractions(): Promise<PublicAttraction[]> {
    return (await this.store.getPublicResources('attraction')).flatMap((record) =>
      record.destinationId
        ? [
            {
              id: record.id,
              destinationId: record.destinationId,
              title: record.content.title,
              summary: record.content.summary,
              revisionId: record.revisionId,
            },
          ]
        : [],
    );
  }

  async getPublicDestination(resourceId: string): Promise<PublicDestination | null> {
    const [record] = await this.store.getPublicResources('destination', resourceId);
    return record
      ? {
          id: record.id,
          title: record.content.title,
          summary: record.content.summary,
          revisionId: record.revisionId,
        }
      : null;
  }

  async getPublicAttraction(resourceId: string): Promise<PublicAttraction | null> {
    const [record] = await this.store.getPublicResources('attraction', resourceId);
    return record?.destinationId
      ? {
          id: record.id,
          destinationId: record.destinationId,
          title: record.content.title,
          summary: record.content.summary,
          revisionId: record.revisionId,
        }
      : null;
  }

  private async createResource(
    tx: RegistryTransaction,
    actor: RegistryActor,
    kind: RegistryResourceKind,
    input: CreateInput,
    destinationId: string | null,
  ): Promise<PrivateRegistryResource> {
    const content = this.validateContent(input.content);
    const scope = await tx.getUnitScope(input.administrativeUnitId);
    if (!scope?.isSynthetic) {
      throw new RegistryError('invalid', 'A synthetic demo administrative unit is required.');
    }
    const authContext = await tx.getAuthorizationContext(actor);
    const decision = this.requireDecision(
      authorize(authContext, {
        capability: 'registry:resource:create',
        organizationId: input.organizationId,
        administrativeUnitId: scope.id,
        administrativeUnitAncestorIds: scope.ancestorIds,
        resourceIsSynthetic: true,
      }),
    );

    if (destinationId) {
      const destination = await tx.getResource(destinationId);
      if (
        !destination ||
        destination.kind !== 'destination' ||
        destination.ownerOrganizationId !== decision.organizationId ||
        destination.administrativeUnitId !== input.administrativeUnitId
      ) {
        throw new RegistryError(
          'invalid',
          'The destination is not available to this organization and scope.',
        );
      }
    }

    const resourceId = randomUUID();
    const revisionId = randomUUID();
    const revision: ResourceRevisionRecord = {
      id: revisionId,
      resourceId,
      revisionNumber: 1,
      author: actor,
      authorMembershipId: decision.membershipId,
      content,
      contentHash: this.contentHash(content),
    };
    const resource: RegistryResourceRecord = {
      id: resourceId,
      kind,
      ownerOrganizationId: decision.organizationId,
      administrativeUnitId: input.administrativeUnitId,
      destinationId,
      createdByMembershipId: decision.membershipId,
      currentRevisionId: null,
      currentRevisionNumber: 0,
      currentPublicationReleaseId: null,
      currentPublicationRevisionId: null,
      version: 0,
      isSynthetic: true,
    };
    await tx.createResource(resource);
    await tx.createRevision(revision);
    await tx.setCurrentRevision(resourceId, revisionId, 1);
    const currentResource = {
      ...resource,
      currentRevisionId: revisionId,
      currentRevisionNumber: 1,
      version: 1,
    };
    await this.recordAllowed(
      tx,
      actor,
      `registry.resource.create.${kind}`,
      currentResource,
      revisionId,
      decision.membershipId,
    );
    await tx.enqueueOutbox({
      eventType: `registry.resource.created.${kind}`,
      resourceId,
      revisionId,
      recipientSubjectIds: [actor.subjectId],
      payload: { resourceId, revisionId, kind },
    });
    return this.toPrivateResponse(currentResource, revision, 'draft');
  }

  private async requireScopedResource(
    tx: RegistryTransaction,
    actor: RegistryActor,
    resourceId: string,
    capability: Capability,
  ): Promise<AuthorizedResource> {
    const resource = await tx.getResource(resourceId, true);
    if (!resource) {
      throw new RegistryError('not_found', 'Registry resource was not found.');
    }
    const scope = await tx.getUnitScope(resource.administrativeUnitId);
    if (!scope) {
      throw new RegistryError('not_found', 'Registry resource was not found.');
    }
    const context = await tx.getAuthorizationContext(actor);
    const decision = this.requireDecision(
      authorize(context, this.requirement(resource, scope, capability)),
      true,
    );
    return { resource, membershipId: decision.membershipId };
  }

  private requirement(
    resource: RegistryResourceRecord,
    scope: NonNullable<Awaited<ReturnType<RegistryTransaction['getUnitScope']>>>,
    capability: Capability,
  ): AuthorizationRequirement {
    return {
      capability,
      organizationId: resource.ownerOrganizationId,
      administrativeUnitId: resource.administrativeUnitId,
      administrativeUnitAncestorIds: scope.ancestorIds,
      resourceIsSynthetic: resource.isSynthetic && scope.isSynthetic,
    };
  }

  private requireDecision(
    decision: PolicyDecision,
    hideResource = false,
  ): Extract<PolicyDecision, { allowed: true }> {
    if (!decision.allowed) {
      if (decision.reason === 'unauthenticated') {
        throw new RegistryError('unauthenticated', decision.reason);
      }
      throw new RegistryError(hideResource ? 'not_found' : 'forbidden', decision.reason);
    }
    return decision;
  }

  private requireVersion(resource: RegistryResourceRecord, expectedVersion: number): void {
    if (resource.version !== expectedVersion) {
      throw new RegistryError('conflict', 'The resource changed; reload it before retrying.');
    }
  }

  private async requireCurrentRevision(
    tx: RegistryTransaction,
    resource: RegistryResourceRecord,
    revisionId: string,
  ): Promise<ResourceRevisionRecord> {
    if (resource.currentRevisionId !== revisionId) {
      throw new RegistryError('conflict', 'The requested revision is stale.');
    }
    const revision = await tx.getRevision(resource.id, revisionId);
    if (!revision || revision.revisionNumber !== resource.currentRevisionNumber) {
      throw new RegistryError('conflict', 'The requested revision is stale.');
    }
    return revision;
  }

  private async currentRevisionState(
    tx: RegistryTransaction,
    revisionId: string,
  ): Promise<RegistryRevisionState> {
    const submission = await tx.getSubmission(revisionId);
    if (!submission) return 'draft';
    if (!submission.reviewDecision) return 'submitted';
    return decisionState(submission.reviewDecision.decision);
  }

  private validateContent(content: EditorialContent): EditorialContent {
    if (
      typeof content.title !== 'string' ||
      content.title.trim().length === 0 ||
      content.title.length > 180 ||
      typeof content.summary !== 'string' ||
      content.summary.trim().length === 0 ||
      content.summary.length > 2000
    ) {
      throw new RegistryError(
        'invalid',
        'A title and summary within the supported limits are required.',
      );
    }
    return { title: content.title.trim(), summary: content.summary.trim() };
  }

  private contentHash(content: EditorialContent): string {
    const canonical = JSON.stringify({
      summary: content.summary.trim(),
      title: content.title.trim(),
    });
    return createHash('sha256').update(canonical).digest('hex');
  }

  private sameActor(first: RegistryActor, second: RegistryActor): boolean {
    return first.issuer === second.issuer && first.subjectId === second.subjectId;
  }

  private toPrivateResponse(
    resource: RegistryResourceRecord,
    revision: ResourceRevisionRecord,
    state: RegistryRevisionState | null,
  ): PrivateRegistryResource {
    return {
      id: resource.id,
      kind: resource.kind,
      ownerOrganizationId: resource.ownerOrganizationId,
      administrativeUnitId: resource.administrativeUnitId,
      destinationId: resource.destinationId,
      revisionId: revision.id,
      revisionNumber: revision.revisionNumber,
      revisionState: state ?? 'draft',
      version: resource.version,
      content: revision.content,
      publishedRevisionId: resource.currentPublicationRevisionId,
    };
  }

  private recordAllowed(
    tx: RegistryTransaction,
    actor: RegistryActor,
    action: string,
    resource: RegistryResourceRecord,
    revisionId: string | null,
    membershipId: string | null,
    details: Record<string, string | number | boolean | null> = {},
  ): Promise<void> {
    return tx.appendAudit({
      actor,
      membershipId,
      action,
      outcome: 'allowed',
      resourceId: resource.id,
      revisionId,
      reasonCode: null,
      policyVersion: POLICY_VERSION,
      details,
    });
  }

  private async mutate<T>(
    actor: RegistryActor,
    action: string,
    resourceId: string | null,
    work: (tx: RegistryTransaction) => Promise<T>,
  ): Promise<T> {
    const outcome = await this.store.transaction<TransactionOutcome<T>>(async (tx) => {
      try {
        return { value: await work(tx) };
      } catch (error) {
        if (!(error instanceof RegistryError)) throw error;
        await tx.appendAudit({
          actor,
          membershipId: null,
          action,
          outcome: 'denied',
          resourceId,
          revisionId: null,
          reasonCode: error.reason,
          policyVersion: POLICY_VERSION,
          details: {},
        });
        return { error };
      }
    });

    if (outcome.error) throw outcome.error;
    if (outcome.value === undefined) {
      throw new RegistryError('conflict', 'The registry operation did not complete.');
    }
    return outcome.value;
  }
}

function decisionState(decision: ReviewDecision): RegistryRevisionState {
  switch (decision) {
    case 'approve':
      return 'approved';
    case 'request_changes':
      return 'changes_requested';
    case 'reject':
      return 'rejected';
  }
}
