import { describe, expect, it } from 'vitest';

import type { AuthorizationContext, AuthorizationGrant, Capability } from '@ethio-tour/authz';
import type { EditorialContent, RegistryResourceKind } from '@ethio-tour/contracts';

import { RegistryService } from './registry-service';
import type { RegistryError } from './registry-service';
import type {
  AuditRecord,
  OutboxRecord,
  PublicResourceRecord,
  RegistryActor,
  RegistryResourceRecord,
  RegistryStore,
  RegistryTransaction,
  ResourceRevisionRecord,
  ReviewDecisionRecord,
  SubmissionRecord,
  UnitScope,
} from './registry-store';

const issuer = 'https://identity.example.test/realms/demo';
const gondar = { id: 'unit-gondar', isSynthetic: true, ancestorIds: ['unit-gondar', 'unit-root'] };
const lalibela = {
  id: 'unit-lalibela',
  isSynthetic: true,
  ancestorIds: ['unit-lalibela', 'unit-region-b', 'unit-root'],
};

function actor(subjectId: string): RegistryActor {
  return { issuer, subjectId };
}

function grantsFor(
  actorId: string,
  membershipId: string,
  organizationId: string,
  capabilities: readonly Capability[],
  unitId: string,
): AuthorizationGrant[] {
  return capabilities.map((capability) => ({
    id: `${actorId}-${capability}`,
    membershipId,
    capability,
    organizationId,
    scopes: [{ administrativeUnitId: unitId, includeDescendants: false }],
    active: true,
    demoOnly: true,
    productionDecisionEnabled: false,
  }));
}

function assign(
  store: MemoryRegistryStore,
  actorValue: RegistryActor,
  organizationId: string,
  unitId: string,
  capabilities: readonly Capability[],
): void {
  const membershipId = `membership-${actorValue.subjectId}`;
  const context: AuthorizationContext = {
    authenticated: true,
    subjectId: actorValue.subjectId,
    memberships: [{ id: membershipId, organizationId, active: true }],
    grants: grantsFor(actorValue.subjectId, membershipId, organizationId, capabilities, unitId),
  };
  store.contexts.set(actorKey(actorValue), context);
}

const editorCapabilities: Capability[] = [
  'registry:resource:read',
  'registry:resource:create',
  'registry:resource:edit',
  'registry:submission:submit',
];
const gondarEditor = actor('gondar-editor');
const lalibelaEditor = actor('lalibela-editor');
const gondarReviewer = actor('gondar-reviewer');
const gondarPublisher = actor('gondar-publisher');

function setup() {
  const store = new MemoryRegistryStore();
  assign(store, gondarEditor, 'org-gondar', gondar.id, editorCapabilities);
  assign(store, lalibelaEditor, 'org-lalibela', lalibela.id, editorCapabilities);
  assign(store, gondarReviewer, 'org-gondar', gondar.id, [
    'registry:resource:read',
    'registry:submission:review',
    'registry:publication:publish',
  ]);
  assign(store, gondarPublisher, 'org-gondar', gondar.id, [
    'registry:resource:read',
    'registry:publication:publish',
    'registry:publication:withdraw',
  ]);
  return { store, service: new RegistryService(store) };
}

const content = (title: string): EditorialContent => ({ title, summary: `${title} summary` });

async function createAndSubmit(service: RegistryService, author = gondarEditor) {
  const resource = await service.createDestination(author, {
    organizationId: 'org-gondar',
    administrativeUnitId: gondar.id,
    content: content('Draft destination'),
  });
  const submitted = await service.submitRevision(
    author,
    resource.id,
    resource.revisionId,
    resource.version,
  );
  return { resource, submitted };
}

async function expectCode(promise: Promise<unknown>, code: RegistryError['code']): Promise<void> {
  await expect(promise).rejects.toMatchObject({ code });
}

describe('registry vertical slice', () => {
  it('returns no private record to an authenticated actor without an assignment and audits denial', async () => {
    const { store, service } = setup();
    const resource = await service.createDestination(gondarEditor, {
      organizationId: 'org-gondar',
      administrativeUnitId: gondar.id,
      content: content('Private draft'),
    });

    await expectCode(service.getPrivateResource(actor('unassigned'), resource.id), 'not_found');
    expect(store.audits.at(-1)).toMatchObject({ outcome: 'denied', reasonCode: 'no-membership' });
  });

  it('hides Gondar records from Lalibela officers', async () => {
    const { service } = setup();
    const resource = await service.createDestination(gondarEditor, {
      organizationId: 'org-gondar',
      administrativeUnitId: gondar.id,
      content: content('Gondar private draft'),
    });

    await expectCode(service.getPrivateResource(lalibelaEditor, resource.id), 'not_found');
  });

  it('rejects a caller-supplied geographic scope outside the caller grant', async () => {
    const { service } = setup();

    await expectCode(
      service.createDestination(gondarEditor, {
        organizationId: 'org-gondar',
        administrativeUnitId: lalibela.id,
        content: content('Forged scope'),
      }),
      'forbidden',
    );
    await expectCode(
      service.createDestination(gondarEditor, {
        organizationId: 'org-lalibela',
        administrativeUnitId: gondar.id,
        content: content('Forged organization'),
      }),
      'forbidden',
    );
  });

  it('does not combine review capability and geographic scope from separate grants', async () => {
    const { store, service } = setup();
    const { resource, submitted } = await createAndSubmit(service);
    const mixedActor = actor('mixed-grant-reviewer');
    const membershipId = 'membership-mixed';
    store.contexts.set(actorKey(mixedActor), {
      authenticated: true,
      subjectId: mixedActor.subjectId,
      memberships: [{ id: membershipId, organizationId: 'org-gondar', active: true }],
      grants: [
        ...grantsFor(
          mixedActor.subjectId,
          membershipId,
          'org-gondar',
          ['registry:submission:review'],
          lalibela.id,
        ),
        ...grantsFor(
          mixedActor.subjectId,
          membershipId,
          'org-gondar',
          ['registry:resource:read'],
          gondar.id,
        ),
      ],
    });

    await expectCode(
      service.reviewRevision(
        mixedActor,
        resource.id,
        submitted.revisionId,
        submitted.version,
        'approve',
        'Demo review',
      ),
      'not_found',
    );
  });

  it('prevents the author from reviewing their submitted revision', async () => {
    const { store, service } = setup();
    assign(store, gondarEditor, 'org-gondar', gondar.id, [
      ...editorCapabilities,
      'registry:submission:review',
    ]);
    const { resource, submitted } = await createAndSubmit(service);

    await expectCode(
      service.reviewRevision(
        gondarEditor,
        resource.id,
        submitted.revisionId,
        submitted.version,
        'approve',
        'Self-review attempt',
      ),
      'forbidden',
    );
  });

  it('rejects stale versions and stale revision IDs', async () => {
    const { service } = setup();
    const original = await service.createDestination(gondarEditor, {
      organizationId: 'org-gondar',
      administrativeUnitId: gondar.id,
      content: content('Original'),
    });
    const edited = await service.createRevision(
      gondarEditor,
      original.id,
      original.version,
      content('Edited'),
    );

    await expectCode(
      service.submitRevision(gondarEditor, original.id, original.revisionId, edited.version),
      'conflict',
    );
    await expectCode(
      service.createRevision(gondarEditor, original.id, original.version, content('Stale update')),
      'conflict',
    );
  });

  it('keeps drafts and submitted revisions out of public discovery', async () => {
    const { service } = setup();
    const { resource } = await createAndSubmit(service);

    expect(await service.listPublicDestinations()).toEqual([]);
    expect(await service.getPublicDestination(resource.id)).toBeNull();
  });

  it('requires an owned destination and releases attractions only with a public destination', async () => {
    const { service } = setup();
    const destination = await service.createDestination(gondarEditor, {
      organizationId: 'org-gondar',
      administrativeUnitId: gondar.id,
      content: content('Synthetic Gondar destination'),
    });
    const attraction = await service.createAttraction(gondarEditor, {
      organizationId: 'org-gondar',
      administrativeUnitId: gondar.id,
      destinationId: destination.id,
      content: content('Synthetic attraction'),
    });
    const attractionSubmission = await service.submitRevision(
      gondarEditor,
      attraction.id,
      attraction.revisionId,
      attraction.version,
    );
    const attractionReview = await service.reviewRevision(
      gondarReviewer,
      attraction.id,
      attractionSubmission.revisionId,
      attractionSubmission.version,
      'approve',
      'Synthetic attraction approval',
    );
    await service.publishRevision(
      gondarPublisher,
      attraction.id,
      attractionReview.revisionId,
      attractionReview.version,
    );
    expect(await service.listPublicAttractions()).toEqual([]);

    const destinationSubmission = await service.submitRevision(
      gondarEditor,
      destination.id,
      destination.revisionId,
      destination.version,
    );
    const destinationReview = await service.reviewRevision(
      gondarReviewer,
      destination.id,
      destinationSubmission.revisionId,
      destinationSubmission.version,
      'approve',
      'Synthetic destination approval',
    );
    await service.publishRevision(
      gondarPublisher,
      destination.id,
      destinationReview.revisionId,
      destinationReview.version,
    );

    expect(await service.listPublicAttractions()).toEqual([
      expect.objectContaining({
        id: attraction.id,
        destinationId: destination.id,
        title: 'Synthetic attraction',
      }),
    ]);

    const currentDestination = await service.getPrivateResource(gondarPublisher, destination.id);
    await service.withdrawPublication(
      gondarPublisher,
      destination.id,
      currentDestination.version,
      'Synthetic destination withdrawal',
    );
    expect(await service.listPublicAttractions()).toEqual([]);
  });

  it('publishes approved revisions, keeps later edits private, replaces a release only after approval, and withdraws publicly', async () => {
    const { store, service } = setup();
    const { resource, submitted } = await createAndSubmit(service);
    await expectCode(
      service.publishRevision(
        gondarPublisher,
        resource.id,
        submitted.revisionId,
        submitted.version,
      ),
      'conflict',
    );

    const reviewed = await service.reviewRevision(
      gondarReviewer,
      resource.id,
      submitted.revisionId,
      submitted.version,
      'approve',
      'Synthetic approval for the demo slice',
    );
    await expectCode(
      service.publishRevision(gondarReviewer, resource.id, submitted.revisionId, reviewed.version),
      'forbidden',
    );
    const published = await service.publishRevision(
      gondarPublisher,
      resource.id,
      submitted.revisionId,
      reviewed.version,
    );
    const firstPublic = await service.getPublicDestination(resource.id);
    expect(firstPublic?.revisionId).toBe(resource.revisionId);
    expect(Object.keys(firstPublic ?? {}).sort()).toEqual(['id', 'revisionId', 'summary', 'title']);

    const edited = await service.createRevision(
      gondarEditor,
      resource.id,
      published.version,
      content('Private newer revision'),
    );
    expect(edited.publishedRevisionId).toBe(resource.revisionId);
    expect((await service.getPublicDestination(resource.id))?.title).toBe('Draft destination');

    const resubmitted = await service.submitRevision(
      gondarEditor,
      resource.id,
      edited.revisionId,
      edited.version,
    );
    const reapproved = await service.reviewRevision(
      gondarReviewer,
      resource.id,
      resubmitted.revisionId,
      resubmitted.version,
      'approve',
      'Synthetic follow-up approval',
    );
    await service.publishRevision(
      gondarPublisher,
      resource.id,
      reapproved.revisionId,
      reapproved.version,
    );
    expect((await service.getPublicDestination(resource.id))?.title).toBe('Private newer revision');

    const current = await service.getPrivateResource(gondarPublisher, resource.id);
    await service.withdrawPublication(
      gondarPublisher,
      resource.id,
      current.version,
      'Synthetic withdrawal for test',
    );
    expect(await service.getPublicDestination(resource.id)).toBeNull();
    expect(
      store.audits.some(
        (entry) => entry.action === 'registry.publication.withdraw' && entry.outcome === 'allowed',
      ),
    ).toBe(true);
    expect(store.outbox.some((entry) => entry.eventType === 'registry.publication.withdrawn')).toBe(
      true,
    );
  });

  it('records protected successes and denials in the audit log', async () => {
    const { store, service } = setup();
    const resource = await service.createDestination(gondarEditor, {
      organizationId: 'org-gondar',
      administrativeUnitId: gondar.id,
      content: content('Audited'),
    });
    await service.getPrivateResource(gondarEditor, resource.id);
    await expectCode(service.getPrivateResource(actor('no-assignment'), resource.id), 'not_found');

    expect(store.audits.map((entry) => entry.outcome)).toEqual(['allowed', 'allowed', 'denied']);
  });
});

function actorKey(value: RegistryActor): string {
  return `${value.issuer}|${value.subjectId}`;
}

interface StoredRelease {
  id: string;
  resourceId: string;
  revisionId: string;
  submissionId: string;
  releaseNumber: number;
}

class MemoryRegistryStore implements RegistryStore {
  readonly contexts = new Map<string, AuthorizationContext>();
  readonly resources = new Map<string, RegistryResourceRecord>();
  readonly revisions = new Map<string, ResourceRevisionRecord>();
  readonly submissions = new Map<string, SubmissionRecord>();
  readonly releases = new Map<string, StoredRelease>();
  readonly withdrawn = new Set<string>();
  readonly audits: AuditRecord[] = [];
  readonly outbox: OutboxRecord[] = [];
  readonly units = new Map<string, UnitScope>([
    [gondar.id, gondar],
    [lalibela.id, lalibela],
  ]);

  transaction<T>(work: (transaction: RegistryTransaction) => Promise<T>): Promise<T> {
    return work(new MemoryRegistryTransaction(this));
  }

  async getPublicResources(
    kind: RegistryResourceKind,
    resourceId?: string,
  ): Promise<PublicResourceRecord[]> {
    const results: PublicResourceRecord[] = [];
    for (const resource of this.resources.values()) {
      if (resource.kind !== kind || (resourceId && resource.id !== resourceId)) continue;
      const releaseId = resource.currentPublicationReleaseId;
      const release = releaseId ? this.releases.get(releaseId) : undefined;
      const submission = release ? this.submissions.get(release.revisionId) : undefined;
      const revision = release ? this.revisions.get(release.revisionId) : undefined;
      if (
        !resource.isSynthetic ||
        !release ||
        this.withdrawn.has(release.id) ||
        submission?.reviewDecision?.decision !== 'approve' ||
        !revision
      ) {
        continue;
      }
      if (resource.destinationId && !(await this.isPublic(resource.destinationId))) continue;
      results.push({
        id: resource.id,
        kind,
        destinationId: resource.destinationId,
        revisionId: revision.id,
        content: revision.content,
      });
    }
    return results;
  }

  async dispatchOutbox(): Promise<number> {
    const count = this.outbox.length;
    this.outbox.length = 0;
    return count;
  }

  private async isPublic(resourceId: string): Promise<boolean> {
    return (await this.getPublicResources('destination', resourceId)).length > 0;
  }
}

class MemoryRegistryTransaction implements RegistryTransaction {
  constructor(private readonly store: MemoryRegistryStore) {}

  async getAuthorizationContext(actorValue: RegistryActor): Promise<AuthorizationContext> {
    return (
      this.store.contexts.get(actorKey(actorValue)) ?? {
        authenticated: true,
        subjectId: actorValue.subjectId,
        memberships: [],
        grants: [],
      }
    );
  }

  async getUnitScope(unitId: string): Promise<UnitScope | null> {
    return this.store.units.get(unitId) ?? null;
  }

  async getResource(resourceId: string): Promise<RegistryResourceRecord | null> {
    const resource = this.store.resources.get(resourceId);
    return resource ? { ...resource } : null;
  }

  async getRevision(
    resourceId: string,
    revisionId: string,
  ): Promise<ResourceRevisionRecord | null> {
    const revision = this.store.revisions.get(revisionId);
    return revision?.resourceId === resourceId ? { ...revision } : null;
  }

  async getCurrentRevision(
    resource: RegistryResourceRecord,
  ): Promise<ResourceRevisionRecord | null> {
    return resource.currentRevisionId
      ? this.getRevision(resource.id, resource.currentRevisionId)
      : null;
  }

  async getSubmission(revisionId: string): Promise<SubmissionRecord | null> {
    const submission = this.store.submissions.get(revisionId);
    return submission ? { ...submission } : null;
  }

  async isDestinationPublic(destinationId: string): Promise<boolean> {
    return (await this.store.getPublicResources('destination', destinationId)).length > 0;
  }

  async nextReleaseNumber(resourceId: string): Promise<number> {
    return (
      Math.max(
        0,
        ...[...this.store.releases.values()]
          .filter((release) => release.resourceId === resourceId)
          .map((release) => release.releaseNumber),
      ) + 1
    );
  }

  async findReviewRecipients(): Promise<string[]> {
    return [];
  }

  async createResource(resource: RegistryResourceRecord): Promise<void> {
    this.store.resources.set(resource.id, { ...resource });
  }

  async createRevision(revision: ResourceRevisionRecord): Promise<void> {
    this.store.revisions.set(revision.id, { ...revision });
  }

  async setCurrentRevision(
    resourceId: string,
    revisionId: string,
    revisionNumber: number,
  ): Promise<void> {
    const resource = this.requireResource(resourceId);
    resource.currentRevisionId = revisionId;
    resource.currentRevisionNumber = revisionNumber;
    resource.version += 1;
  }

  async incrementVersion(resourceId: string): Promise<void> {
    this.requireResource(resourceId).version += 1;
  }

  async createSubmission(submission: Omit<SubmissionRecord, 'reviewDecision'>): Promise<void> {
    this.store.submissions.set(submission.revisionId, {
      ...submission,
      reviewDecision: null,
    });
  }

  async createReviewDecision(submissionId: string, decision: ReviewDecisionRecord): Promise<void> {
    const submission = [...this.store.submissions.values()].find(
      (item) => item.id === submissionId,
    );
    if (!submission) throw new Error('Expected test submission.');
    submission.reviewDecision = decision;
  }

  async createRelease(input: {
    id: string;
    resourceId: string;
    revisionId: string;
    submissionId: string;
    releaseNumber: number;
  }): Promise<void> {
    this.store.releases.set(input.id, { ...input });
  }

  async setCurrentPublication(resourceId: string, releaseId: string | null): Promise<void> {
    const resource = this.requireResource(resourceId);
    resource.currentPublicationReleaseId = releaseId;
    resource.currentPublicationRevisionId = releaseId
      ? (this.store.releases.get(releaseId)?.revisionId ?? null)
      : null;
    resource.version += 1;
  }

  async withdrawRelease(input: { releaseId: string }): Promise<void> {
    this.store.withdrawn.add(input.releaseId);
  }

  async appendAudit(record: AuditRecord): Promise<void> {
    this.store.audits.push({ ...record });
  }

  async enqueueOutbox(record: OutboxRecord): Promise<void> {
    this.store.outbox.push({ ...record });
  }

  private requireResource(resourceId: string): RegistryResourceRecord {
    const resource = this.store.resources.get(resourceId);
    if (!resource) throw new Error('Expected test resource.');
    return resource;
  }
}
