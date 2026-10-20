import type {
  AuthorizationContext,
  AuthorizationGrant,
  AuthorizationMembership,
  Capability,
} from '@ethio-tour/authz';
import type { DatabaseClient } from '@ethio-tour/db';
import type postgres from 'postgres';

import { RegistryError } from './registry-service';
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

type Row = Record<string, unknown>;
type DatabaseTransaction = postgres.TransactionSql;

export class PostgresRegistryStore implements RegistryStore {
  constructor(private readonly client: DatabaseClient) {}

  async transaction<T>(work: (transaction: RegistryTransaction) => Promise<T>): Promise<T> {
    const result = await this.client.begin(async (transaction) => ({
      value: await work(new PostgresRegistryTransaction(transaction)),
    }));
    return result.value;
  }

  async getPublicResources(
    kind: PublicResourceRecord['kind'],
    resourceId?: string,
  ): Promise<PublicResourceRecord[]> {
    const params: (string | null)[] = [kind, resourceId ?? null];
    const rows = await this.client.unsafe<Row[]>(
      `
        SELECT r.id, r.kind, r.destination_id, revision.id AS revision_id, revision.content
        FROM registry_resources r
        JOIN publication_releases release
          ON release.id = r.current_publication_release_id
         AND release.resource_id = r.id
        JOIN resource_revisions revision
          ON revision.id = release.revision_id
         AND revision.resource_id = r.id
        JOIN submissions submission
          ON submission.id = release.submission_id
         AND submission.revision_id = revision.id
        JOIN review_decisions decision
          ON decision.submission_id = submission.id
         AND decision.decision = 'approve'
        WHERE r.kind = $1
          AND r.is_synthetic = true
          AND r.current_publication_release_id IS NOT NULL
          AND NOT EXISTS (
            SELECT 1 FROM publication_withdrawals withdrawal
            WHERE withdrawal.release_id = release.id
          )
          AND ($2::uuid IS NULL OR r.id = $2::uuid)
          AND (
            r.kind <> 'attraction'
            OR EXISTS (
              SELECT 1
              FROM registry_resources destination
              JOIN publication_releases destination_release
                ON destination_release.id = destination.current_publication_release_id
               AND destination_release.resource_id = destination.id
              JOIN submissions destination_submission
                ON destination_submission.id = destination_release.submission_id
              JOIN review_decisions destination_decision
                ON destination_decision.submission_id = destination_submission.id
               AND destination_decision.decision = 'approve'
              WHERE destination.id = r.destination_id
                AND destination.kind = 'destination'
                AND destination.is_synthetic = true
                AND destination.current_publication_release_id IS NOT NULL
                AND NOT EXISTS (
                  SELECT 1 FROM publication_withdrawals destination_withdrawal
                  WHERE destination_withdrawal.release_id = destination_release.id
                )
            )
          )
        ORDER BY revision.content->>'title', r.id
      `,
      params,
    );

    return rows.map((row) => ({
      id: stringValue(row.id),
      kind: stringValue(row.kind) as PublicResourceRecord['kind'],
      destinationId: nullableString(row.destination_id),
      revisionId: stringValue(row.revision_id),
      content: jsonValue(row.content) as PublicResourceRecord['content'],
    }));
  }

  dispatchOutbox(limit = 50): Promise<number> {
    return this.client.begin(async (transaction) => {
      const events = await transaction.unsafe<Row[]>(
        `
          SELECT id, event_type, recipient_subject_ids, payload
          FROM outbox_events
          WHERE processed_at IS NULL
          ORDER BY created_at, id
          FOR UPDATE SKIP LOCKED
          LIMIT $1
        `,
        [limit],
      );
      for (const event of events) {
        const recipients = stringArrayValue(event.recipient_subject_ids);
        for (const recipient of recipients) {
          await transaction.unsafe(
            `
              INSERT INTO notifications (outbox_event_id, recipient_subject_id, event_type, payload)
              VALUES ($1, $2, $3, $4::jsonb)
              ON CONFLICT (outbox_event_id, recipient_subject_id) DO NOTHING
            `,
            [
              stringValue(event.id),
              recipient,
              stringValue(event.event_type),
              JSON.stringify(jsonObjectValue(event.payload)),
            ],
          );
        }
        await transaction.unsafe(
          'UPDATE outbox_events SET processed_at = now(), attempts = attempts + 1 WHERE id = $1',
          [stringValue(event.id)],
        );
      }
      return events.length;
    });
  }
}

class PostgresRegistryTransaction implements RegistryTransaction {
  constructor(private readonly sql: DatabaseTransaction) {}

  async getAuthorizationContext(actor: RegistryActor): Promise<AuthorizationContext> {
    const aliases = [
      ...new Set((actor.issuerAliases ?? []).filter((issuer) => issuer !== actor.issuer)),
    ];
    if (aliases.length > 0) {
      const [collision] = await this.sql.unsafe<Row[]>(
        `SELECT id FROM user_profiles
         WHERE external_subject_id = $1 AND external_issuer = ANY($2::text[]) LIMIT 1`,
        [actor.subjectId, aliases],
      );
      if (collision) {
        throw new RegistryError(
          'conflict',
          'Identity issuer alias collides with an existing profile; ownership was not changed.',
        );
      }
    }
    const rows = await this.sql.unsafe<Row[]>(
      `
        SELECT profile.active AS profile_active,
               membership.id AS membership_id,
               membership.organization_id,
               membership.active AS membership_active,
               grant_row.id AS grant_id,
               grant_row.capability,
               grant_row.organization_id AS grant_organization_id,
               grant_row.active AS grant_active,
               grant_row.demo_only,
               grant_row.production_decision_enabled,
               grant_scope.administrative_unit_id,
               grant_scope.include_descendants
        FROM user_profiles profile
        LEFT JOIN memberships membership ON membership.user_profile_id = profile.id
        LEFT JOIN access_grants grant_row ON grant_row.membership_id = membership.id
        LEFT JOIN grant_scopes grant_scope ON grant_scope.grant_id = grant_row.id
        WHERE profile.external_issuer = $1 AND profile.external_subject_id = $2
      `,
      [actor.issuer, actor.subjectId],
    );

    const profileActive = rows.some((row) => row.profile_active === true);
    const memberships = new Map<string, AuthorizationMembership>();
    const grants = new Map<string, AuthorizationGrant>();
    if (profileActive) {
      for (const row of rows) {
        if (!row.membership_id || !row.organization_id) continue;
        const membershipId = stringValue(row.membership_id);
        memberships.set(membershipId, {
          id: membershipId,
          organizationId: stringValue(row.organization_id),
          active: row.membership_active === true,
        });
        if (!row.grant_id || !row.capability || !row.grant_organization_id) continue;
        const grantId = stringValue(row.grant_id);
        let grant = grants.get(grantId);
        if (!grant) {
          grant = {
            id: grantId,
            membershipId,
            capability: stringValue(row.capability) as Capability,
            organizationId: stringValue(row.grant_organization_id),
            scopes: [],
            active: row.grant_active === true,
            demoOnly: row.demo_only === true,
            productionDecisionEnabled: row.production_decision_enabled === true,
          };
          grants.set(grantId, grant);
        }
        if (row.administrative_unit_id) {
          grant.scopes = [
            ...grant.scopes,
            {
              administrativeUnitId: stringValue(row.administrative_unit_id),
              includeDescendants: row.include_descendants === true,
            },
          ];
        }
      }
    }

    return {
      authenticated: true,
      subjectId: actor.subjectId,
      memberships: [...memberships.values()],
      grants: [...grants.values()],
    };
  }

  async getUnitScope(unitId: string): Promise<UnitScope | null> {
    const [row] = await this.sql.unsafe<Row[]>(
      `
        SELECT unit.id, unit.is_synthetic,
               COALESCE(array_agg(path.ancestor_unit_id) FILTER (WHERE path.ancestor_unit_id IS NOT NULL), ARRAY[unit.id]) AS ancestor_ids
        FROM administrative_units unit
        LEFT JOIN administrative_unit_paths path ON path.descendant_unit_id = unit.id
        WHERE unit.id = $1
        GROUP BY unit.id, unit.is_synthetic
      `,
      [unitId],
    );
    if (!row) return null;
    return {
      id: stringValue(row.id),
      isSynthetic: row.is_synthetic === true,
      ancestorIds: Array.isArray(row.ancestor_ids) ? row.ancestor_ids.map(stringValue) : [unitId],
    };
  }

  async getResource(resourceId: string, forUpdate = false): Promise<RegistryResourceRecord | null> {
    const rows = await this.sql.unsafe<Row[]>(
      `
        SELECT resource.id, resource.kind, resource.owner_organization_id,
               resource.administrative_unit_id, resource.destination_id,
               resource.created_by_membership_id, resource.current_revision_id,
               resource.current_revision_number, resource.current_publication_release_id,
               publication.revision_id AS current_publication_revision_id,
               resource.version, resource.is_synthetic
        FROM registry_resources resource
        LEFT JOIN publication_releases publication
          ON publication.id = resource.current_publication_release_id
        WHERE resource.id = $1
        ${forUpdate ? 'FOR UPDATE OF resource' : ''}
      `,
      [resourceId],
    );
    const [row] = rows;
    return row ? resourceRecord(row) : null;
  }

  async getRevision(
    resourceId: string,
    revisionId: string,
  ): Promise<ResourceRevisionRecord | null> {
    const [row] = await this.sql.unsafe<Row[]>(
      `
        SELECT revision.id, revision.resource_id, revision.revision_number,
               revision.author_membership_id, revision.content, revision.content_hash,
               author.external_issuer AS author_issuer,
               author.external_subject_id AS author_subject_id
        FROM resource_revisions revision
        JOIN user_profiles author ON author.id = revision.author_profile_id
        WHERE revision.resource_id = $1 AND revision.id = $2
      `,
      [resourceId, revisionId],
    );
    return row ? revisionRecord(row) : null;
  }

  getCurrentRevision(resource: RegistryResourceRecord): Promise<ResourceRevisionRecord | null> {
    return resource.currentRevisionId
      ? this.getRevision(resource.id, resource.currentRevisionId)
      : Promise.resolve(null);
  }

  async getSubmission(revisionId: string): Promise<SubmissionRecord | null> {
    const [row] = await this.sql.unsafe<Row[]>(
      `
        SELECT submission.id, submission.resource_id, submission.revision_id,
               submission.submitted_by_membership_id,
               submitter.external_issuer AS submitter_issuer,
               submitter.external_subject_id AS submitter_subject_id,
               decision.decision, decision.reason, decision.policy_version,
               decision.reviewer_membership_id,
               reviewer.external_issuer AS reviewer_issuer,
               reviewer.external_subject_id AS reviewer_subject_id
        FROM submissions submission
        JOIN user_profiles submitter ON submitter.id = submission.submitted_by_profile_id
        LEFT JOIN review_decisions decision ON decision.submission_id = submission.id
        LEFT JOIN user_profiles reviewer ON reviewer.id = decision.reviewer_profile_id
        WHERE submission.revision_id = $1
      `,
      [revisionId],
    );
    if (!row) return null;
    const reviewDecision: ReviewDecisionRecord | null = row.decision
      ? {
          decision: stringValue(row.decision) as ReviewDecisionRecord['decision'],
          reason: stringValue(row.reason),
          policyVersion: stringValue(row.policy_version),
          reviewerMembershipId: stringValue(row.reviewer_membership_id),
          reviewer: {
            issuer: stringValue(row.reviewer_issuer),
            subjectId: stringValue(row.reviewer_subject_id),
          },
        }
      : null;
    return {
      id: stringValue(row.id),
      resourceId: stringValue(row.resource_id),
      revisionId: stringValue(row.revision_id),
      submittedByMembershipId: stringValue(row.submitted_by_membership_id),
      submittedBy: {
        issuer: stringValue(row.submitter_issuer),
        subjectId: stringValue(row.submitter_subject_id),
      },
      reviewDecision,
    };
  }

  async isDestinationPublic(destinationId: string): Promise<boolean> {
    const [row] = await this.sql.unsafe<Row[]>(
      `SELECT 1 AS eligible FROM registry_resources WHERE id = $1 AND current_publication_release_id IS NOT NULL`,
      [destinationId],
    );
    return Boolean(row);
  }

  async nextReleaseNumber(resourceId: string): Promise<number> {
    const [row] = await this.sql.unsafe<Row[]>(
      'SELECT COALESCE(MAX(release_number), 0) + 1 AS next_number FROM publication_releases WHERE resource_id = $1',
      [resourceId],
    );
    return numberValue(row?.next_number ?? 1);
  }

  async findReviewRecipients(resource: RegistryResourceRecord): Promise<string[]> {
    const rows = await this.sql.unsafe<Row[]>(
      `
        SELECT DISTINCT profile.external_subject_id
        FROM user_profiles profile
        JOIN memberships membership ON membership.user_profile_id = profile.id AND membership.active
        JOIN access_grants grant_row
          ON grant_row.membership_id = membership.id
         AND grant_row.organization_id = membership.organization_id
         AND grant_row.capability = 'registry:submission:review'
         AND grant_row.active
         AND grant_row.demo_only
         AND NOT grant_row.production_decision_enabled
        JOIN grant_scopes grant_scope ON grant_scope.grant_id = grant_row.id
        JOIN administrative_unit_paths path
          ON path.ancestor_unit_id = grant_scope.administrative_unit_id
         AND path.descendant_unit_id = $2
        WHERE profile.active
          AND membership.organization_id = $1
          AND (grant_scope.administrative_unit_id = $2 OR grant_scope.include_descendants)
      `,
      [resource.ownerOrganizationId, resource.administrativeUnitId],
    );
    return rows.map((row) => stringValue(row.external_subject_id));
  }

  async createResource(resource: RegistryResourceRecord): Promise<void> {
    await this.sql.unsafe(
      `
        INSERT INTO registry_resources (
          id, kind, owner_organization_id, administrative_unit_id, destination_id,
          created_by_membership_id, current_revision_id, current_revision_number,
          current_publication_release_id, version, is_synthetic
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      `,
      [
        resource.id,
        resource.kind,
        resource.ownerOrganizationId,
        resource.administrativeUnitId,
        resource.destinationId,
        resource.createdByMembershipId,
        resource.currentRevisionId,
        resource.currentRevisionNumber,
        resource.currentPublicationReleaseId,
        resource.version,
        resource.isSynthetic,
      ],
    );
  }

  async createRevision(revision: ResourceRevisionRecord): Promise<void> {
    await this.sql.unsafe(
      `
        INSERT INTO resource_revisions (
          id, resource_id, revision_number, author_profile_id, author_membership_id, content, content_hash
        )
        SELECT $1, $2, $3, profile.id, $4, $5::jsonb, $6
        FROM user_profiles profile
        WHERE profile.external_issuer = $7
          AND profile.external_subject_id = $8
          AND profile.active
      `,
      [
        revision.id,
        revision.resourceId,
        revision.revisionNumber,
        revision.authorMembershipId,
        JSON.stringify(revision.content),
        revision.contentHash,
        revision.author.issuer,
        revision.author.subjectId,
      ],
    );
  }

  async setCurrentRevision(
    resourceId: string,
    revisionId: string,
    revisionNumber: number,
  ): Promise<void> {
    await this.sql.unsafe(
      `
        UPDATE registry_resources
        SET current_revision_id = $2, current_revision_number = $3,
            version = version + 1, updated_at = now()
        WHERE id = $1
      `,
      [resourceId, revisionId, revisionNumber],
    );
  }

  async incrementVersion(resourceId: string): Promise<void> {
    await this.sql.unsafe(
      'UPDATE registry_resources SET version = version + 1, updated_at = now() WHERE id = $1',
      [resourceId],
    );
  }

  async createSubmission(submission: Omit<SubmissionRecord, 'reviewDecision'>): Promise<void> {
    await this.sql.unsafe(
      `
        INSERT INTO submissions (
          id, resource_id, revision_id, submitted_by_profile_id, submitted_by_membership_id
        )
        SELECT $1, $2, $3, profile.id, $4
        FROM user_profiles profile
        WHERE profile.external_issuer = $5
          AND profile.external_subject_id = $6
          AND profile.active
      `,
      [
        submission.id,
        submission.resourceId,
        submission.revisionId,
        submission.submittedByMembershipId,
        submission.submittedBy.issuer,
        submission.submittedBy.subjectId,
      ],
    );
  }

  async createReviewDecision(submissionId: string, decision: ReviewDecisionRecord): Promise<void> {
    await this.sql.unsafe(
      `
        INSERT INTO review_decisions (
          submission_id, reviewer_profile_id, reviewer_membership_id,
          decision, reason, policy_version
        )
        SELECT $1, profile.id, $2, $3, $4, $5
        FROM user_profiles profile
        WHERE profile.external_issuer = $6
          AND profile.external_subject_id = $7
          AND profile.active
      `,
      [
        submissionId,
        decision.reviewerMembershipId,
        decision.decision,
        decision.reason,
        decision.policyVersion,
        decision.reviewer.issuer,
        decision.reviewer.subjectId,
      ],
    );
  }

  async createRelease(input: {
    id: string;
    resourceId: string;
    revisionId: string;
    submissionId: string;
    releaseNumber: number;
    publisher: RegistryActor;
    publisherMembershipId: string;
  }): Promise<void> {
    await this.sql.unsafe(
      `
        INSERT INTO publication_releases (
          id, resource_id, revision_id, submission_id, release_number,
          publisher_profile_id, publisher_membership_id
        )
        SELECT $1, $2, $3, $4, $5, profile.id, $6
        FROM user_profiles profile
        WHERE profile.external_issuer = $7
          AND profile.external_subject_id = $8
          AND profile.active
      `,
      [
        input.id,
        input.resourceId,
        input.revisionId,
        input.submissionId,
        input.releaseNumber,
        input.publisherMembershipId,
        input.publisher.issuer,
        input.publisher.subjectId,
      ],
    );
  }

  async setCurrentPublication(resourceId: string, releaseId: string | null): Promise<void> {
    await this.sql.unsafe(
      `
        UPDATE registry_resources
        SET current_publication_release_id = $2, version = version + 1, updated_at = now()
        WHERE id = $1
      `,
      [resourceId, releaseId],
    );
  }

  async withdrawRelease(input: {
    releaseId: string;
    actor: RegistryActor;
    membershipId: string;
    reason: string;
  }): Promise<void> {
    await this.sql.unsafe(
      `
        INSERT INTO publication_withdrawals (
          release_id, withdrawn_by_profile_id, withdrawn_by_membership_id, reason
        )
        SELECT $1, profile.id, $2, $3
        FROM user_profiles profile
        WHERE profile.external_issuer = $4
          AND profile.external_subject_id = $5
          AND profile.active
      `,
      [
        input.releaseId,
        input.membershipId,
        input.reason,
        input.actor.issuer,
        input.actor.subjectId,
      ],
    );
  }

  async appendAudit(record: AuditRecord): Promise<void> {
    await this.sql.unsafe(
      `
        INSERT INTO audit_events (
          actor_issuer, actor_subject_id, actor_membership_id, action, outcome,
          target_resource_id, target_revision_id, reason_code, policy_version, details
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb)
      `,
      [
        record.actor?.issuer ?? null,
        record.actor?.subjectId ?? null,
        record.membershipId,
        record.action,
        record.outcome,
        record.resourceId,
        record.revisionId,
        record.reasonCode,
        record.policyVersion,
        JSON.stringify(record.details),
      ],
    );
  }

  async enqueueOutbox(record: OutboxRecord): Promise<void> {
    await this.sql.unsafe(
      `
        INSERT INTO outbox_events (
          event_type, resource_id, revision_id, recipient_subject_ids, payload
        ) VALUES ($1, $2, $3, $4::jsonb, $5::jsonb)
      `,
      [
        record.eventType,
        record.resourceId,
        record.revisionId,
        JSON.stringify([...new Set(record.recipientSubjectIds)]),
        JSON.stringify(record.payload),
      ],
    );
  }
}

function resourceRecord(row: Row): RegistryResourceRecord {
  return {
    id: stringValue(row.id),
    kind: stringValue(row.kind) as RegistryResourceRecord['kind'],
    ownerOrganizationId: stringValue(row.owner_organization_id),
    administrativeUnitId: stringValue(row.administrative_unit_id),
    destinationId: nullableString(row.destination_id),
    createdByMembershipId: stringValue(row.created_by_membership_id),
    currentRevisionId: nullableString(row.current_revision_id),
    currentRevisionNumber: numberValue(row.current_revision_number),
    currentPublicationReleaseId: nullableString(row.current_publication_release_id),
    currentPublicationRevisionId: nullableString(row.current_publication_revision_id),
    version: numberValue(row.version),
    isSynthetic: row.is_synthetic === true,
  };
}

function revisionRecord(row: Row): ResourceRevisionRecord {
  return {
    id: stringValue(row.id),
    resourceId: stringValue(row.resource_id),
    revisionNumber: numberValue(row.revision_number),
    author: {
      issuer: stringValue(row.author_issuer),
      subjectId: stringValue(row.author_subject_id),
    },
    authorMembershipId: stringValue(row.author_membership_id),
    content: jsonValue(row.content) as ResourceRevisionRecord['content'],
    contentHash: stringValue(row.content_hash),
  };
}

function jsonValue(value: unknown): unknown {
  if (typeof value === 'string') return JSON.parse(value) as unknown;
  return value;
}

function nullableString(value: unknown): string | null {
  return value === null || value === undefined ? null : String(value);
}

function stringValue(value: unknown): string {
  if (value === null || value === undefined) throw new Error('Unexpected empty database value.');
  return String(value);
}

function numberValue(value: unknown): number {
  const number = Number(value);
  if (!Number.isFinite(number)) throw new Error('Unexpected numeric database value.');
  return number;
}

function stringArrayValue(value: unknown): string[] {
  const parsed = jsonValue(value);
  return Array.isArray(parsed)
    ? parsed.filter((item): item is string => typeof item === 'string')
    : [];
}

function jsonObjectValue(value: unknown): Record<string, string> {
  const parsed = jsonValue(value);
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
  return Object.fromEntries(
    Object.entries(parsed).filter(
      (entry): entry is [string, string] => typeof entry[1] === 'string',
    ),
  );
}
