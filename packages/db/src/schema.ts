import {
  boolean,
  check,
  foreignKey,
  type AnyPgColumn,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

export const platformMetadata = pgTable('platform_metadata', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const administrativeUnits = pgTable(
  'administrative_units',
  {
    id: text('id').primaryKey(),
    displayName: text('display_name').notNull(),
    level: text('level').notNull(),
    parentId: text('parent_id'),
    isSynthetic: boolean('is_synthetic').default(true).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    foreignKey({ columns: [table.parentId], foreignColumns: [table.id] }),
    check(
      'administrative_units_level_check',
      sql`${table.level} in ('federal', 'regional', 'woreda', 'kebele')`,
    ),
    index('administrative_units_parent_idx').on(table.parentId),
  ],
);

export const administrativeUnitPaths = pgTable(
  'administrative_unit_paths',
  {
    ancestorUnitId: text('ancestor_unit_id')
      .notNull()
      .references(() => administrativeUnits.id),
    descendantUnitId: text('descendant_unit_id')
      .notNull()
      .references(() => administrativeUnits.id),
    depth: integer('depth').notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.ancestorUnitId, table.descendantUnitId] }),
    check('administrative_unit_paths_depth_check', sql`${table.depth} >= 0`),
    index('administrative_unit_paths_descendant_idx').on(table.descendantUnitId),
  ],
);

export const organizations = pgTable(
  'organizations',
  {
    id: text('id').primaryKey(),
    displayName: text('display_name').notNull(),
    level: text('level').notNull(),
    administrativeUnitId: text('administrative_unit_id').references(() => administrativeUnits.id),
    isSynthetic: boolean('is_synthetic').default(true).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    check(
      'organizations_level_check',
      sql`${table.level} in ('federal', 'regional', 'woreda', 'kebele')`,
    ),
    index('organizations_unit_idx').on(table.administrativeUnitId),
  ],
);

export const userProfiles = pgTable(
  'user_profiles',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    externalIssuer: text('external_issuer').notNull(),
    externalSubjectId: text('external_subject_id').notNull(),
    displayName: text('display_name'),
    active: boolean('active').default(true).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('user_profiles_external_identity_uq').on(
      table.externalIssuer,
      table.externalSubjectId,
    ),
  ],
);

export const memberships = pgTable(
  'memberships',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userProfileId: uuid('user_profile_id')
      .notNull()
      .references(() => userProfiles.id),
    organizationId: text('organization_id')
      .notNull()
      .references(() => organizations.id),
    label: text('label').notNull(),
    active: boolean('active').default(true).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('memberships_user_organization_uq').on(table.userProfileId, table.organizationId),
    index('memberships_organization_idx').on(table.organizationId, table.active),
  ],
);

export const accessGrants = pgTable(
  'access_grants',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    membershipId: uuid('membership_id')
      .notNull()
      .references(() => memberships.id),
    capability: text('capability').notNull(),
    organizationId: text('organization_id')
      .notNull()
      .references(() => organizations.id),
    active: boolean('active').default(true).notNull(),
    demoOnly: boolean('demo_only').default(true).notNull(),
    productionDecisionEnabled: boolean('production_decision_enabled').default(false).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    check(
      'access_grants_production_decisions_disabled_check',
      sql`${table.productionDecisionEnabled} = false`,
    ),
    check(
      'access_grants_capability_check',
      sql`${table.capability} in ('registry:resource:read', 'registry:resource:create', 'registry:resource:edit', 'registry:submission:submit', 'registry:submission:review', 'registry:publication:publish', 'registry:publication:withdraw')`,
    ),
    uniqueIndex('access_grants_membership_capability_organization_uq').on(
      table.membershipId,
      table.capability,
      table.organizationId,
    ),
    index('access_grants_membership_capability_idx').on(
      table.membershipId,
      table.capability,
      table.active,
    ),
  ],
);

export const grantScopes = pgTable(
  'grant_scopes',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    grantId: uuid('grant_id')
      .notNull()
      .references(() => accessGrants.id),
    administrativeUnitId: text('administrative_unit_id')
      .notNull()
      .references(() => administrativeUnits.id),
    includeDescendants: boolean('include_descendants').default(false).notNull(),
  },
  (table) => [
    uniqueIndex('grant_scopes_grant_unit_uq').on(table.grantId, table.administrativeUnitId),
    index('grant_scopes_unit_idx').on(table.administrativeUnitId),
  ],
);

export const registryResources = pgTable(
  'registry_resources',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    kind: text('kind').notNull(),
    ownerOrganizationId: text('owner_organization_id')
      .notNull()
      .references(() => organizations.id),
    administrativeUnitId: text('administrative_unit_id')
      .notNull()
      .references(() => administrativeUnits.id),
    destinationId: uuid('destination_id').references((): AnyPgColumn => registryResources.id),
    createdByMembershipId: uuid('created_by_membership_id')
      .notNull()
      .references(() => memberships.id),
    currentRevisionId: uuid('current_revision_id').references(
      (): AnyPgColumn => resourceRevisions.id,
    ),
    currentRevisionNumber: integer('current_revision_number').default(0).notNull(),
    currentPublicationReleaseId: uuid('current_publication_release_id').references(
      (): AnyPgColumn => publicationReleases.id,
    ),
    version: integer('version').default(0).notNull(),
    isSynthetic: boolean('is_synthetic').default(true).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    check('registry_resources_kind_check', sql`${table.kind} in ('destination', 'attraction')`),
    check(
      'registry_resources_versions_check',
      sql`${table.currentRevisionNumber} >= 0 and ${table.version} >= 0`,
    ),
    index('registry_resources_owner_scope_idx').on(
      table.ownerOrganizationId,
      table.administrativeUnitId,
      table.kind,
    ),
    index('registry_resources_publication_idx').on(table.currentPublicationReleaseId),
  ],
);

export const resourceRevisions = pgTable(
  'resource_revisions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    resourceId: uuid('resource_id')
      .notNull()
      .references(() => registryResources.id),
    revisionNumber: integer('revision_number').notNull(),
    authorProfileId: uuid('author_profile_id')
      .notNull()
      .references(() => userProfiles.id),
    authorMembershipId: uuid('author_membership_id')
      .notNull()
      .references(() => memberships.id),
    content: jsonb('content').$type<{ title: string; summary: string }>().notNull(),
    contentHash: text('content_hash').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('resource_revisions_resource_number_uq').on(table.resourceId, table.revisionNumber),
    uniqueIndex('resource_revisions_resource_id_uq').on(table.resourceId, table.id),
    check('resource_revisions_number_check', sql`${table.revisionNumber} > 0`),
    index('resource_revisions_author_idx').on(table.authorProfileId),
  ],
);

export const submissions = pgTable(
  'submissions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    resourceId: uuid('resource_id')
      .notNull()
      .references(() => registryResources.id),
    revisionId: uuid('revision_id')
      .notNull()
      .references(() => resourceRevisions.id),
    submittedByProfileId: uuid('submitted_by_profile_id')
      .notNull()
      .references(() => userProfiles.id),
    submittedByMembershipId: uuid('submitted_by_membership_id')
      .notNull()
      .references(() => memberships.id),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('submissions_revision_uq').on(table.revisionId),
    index('submissions_resource_created_idx').on(table.resourceId, table.createdAt),
  ],
);

export const reviewDecisions = pgTable(
  'review_decisions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    submissionId: uuid('submission_id')
      .notNull()
      .references(() => submissions.id),
    reviewerProfileId: uuid('reviewer_profile_id')
      .notNull()
      .references(() => userProfiles.id),
    reviewerMembershipId: uuid('reviewer_membership_id')
      .notNull()
      .references(() => memberships.id),
    decision: text('decision').notNull(),
    reason: text('reason').notNull(),
    policyVersion: text('policy_version').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('review_decisions_submission_uq').on(table.submissionId),
    check(
      'review_decisions_decision_check',
      sql`${table.decision} in ('approve', 'request_changes', 'reject')`,
    ),
    index('review_decisions_reviewer_idx').on(table.reviewerProfileId),
  ],
);

export const publicationReleases = pgTable(
  'publication_releases',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    resourceId: uuid('resource_id')
      .notNull()
      .references(() => registryResources.id),
    revisionId: uuid('revision_id')
      .notNull()
      .references(() => resourceRevisions.id),
    submissionId: uuid('submission_id')
      .notNull()
      .references(() => submissions.id),
    releaseNumber: integer('release_number').notNull(),
    publisherProfileId: uuid('publisher_profile_id')
      .notNull()
      .references(() => userProfiles.id),
    publisherMembershipId: uuid('publisher_membership_id')
      .notNull()
      .references(() => memberships.id),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('publication_releases_resource_number_uq').on(
      table.resourceId,
      table.releaseNumber,
    ),
    check('publication_releases_number_check', sql`${table.releaseNumber} > 0`),
    index('publication_releases_revision_idx').on(table.revisionId),
  ],
);

export const publicationWithdrawals = pgTable(
  'publication_withdrawals',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    releaseId: uuid('release_id')
      .notNull()
      .references(() => publicationReleases.id),
    withdrawnByProfileId: uuid('withdrawn_by_profile_id')
      .notNull()
      .references(() => userProfiles.id),
    withdrawnByMembershipId: uuid('withdrawn_by_membership_id')
      .notNull()
      .references(() => memberships.id),
    reason: text('reason').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('publication_withdrawals_release_uq').on(table.releaseId),
    index('publication_withdrawals_created_idx').on(table.createdAt),
  ],
);

export const auditEvents = pgTable(
  'audit_events',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    actorIssuer: text('actor_issuer'),
    actorSubjectId: text('actor_subject_id'),
    actorMembershipId: uuid('actor_membership_id').references(() => memberships.id),
    action: text('action').notNull(),
    outcome: text('outcome').notNull(),
    targetResourceId: uuid('target_resource_id'),
    targetRevisionId: uuid('target_revision_id'),
    reasonCode: text('reason_code'),
    policyVersion: text('policy_version').notNull(),
    requestId: text('request_id'),
    details: jsonb('details').$type<Record<string, string | number | boolean | null>>(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('audit_events_target_created_idx').on(table.targetResourceId, table.createdAt),
    index('audit_events_actor_created_idx').on(table.actorSubjectId, table.createdAt),
  ],
);

export const outboxEvents = pgTable(
  'outbox_events',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    eventType: text('event_type').notNull(),
    resourceId: uuid('resource_id'),
    revisionId: uuid('revision_id'),
    recipientSubjectIds: jsonb('recipient_subject_ids').$type<string[]>().default([]).notNull(),
    payload: jsonb('payload').$type<Record<string, string>>().notNull(),
    attempts: integer('attempts').default(0).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    processedAt: timestamp('processed_at', { withTimezone: true }),
  },
  (table) => [
    check('outbox_events_attempts_check', sql`${table.attempts} >= 0`),
    index('outbox_events_pending_idx').on(table.processedAt, table.createdAt),
  ],
);

export const notifications = pgTable(
  'notifications',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    outboxEventId: uuid('outbox_event_id')
      .notNull()
      .references(() => outboxEvents.id),
    recipientSubjectId: text('recipient_subject_id').notNull(),
    eventType: text('event_type').notNull(),
    payload: jsonb('payload').$type<Record<string, string>>().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    readAt: timestamp('read_at', { withTimezone: true }),
  },
  (table) => [
    uniqueIndex('notifications_event_recipient_uq').on(
      table.outboxEventId,
      table.recipientSubjectId,
    ),
    index('notifications_recipient_created_idx').on(table.recipientSubjectId, table.createdAt),
  ],
);

export const schema = {
  platformMetadata,
  administrativeUnits,
  administrativeUnitPaths,
  organizations,
  userProfiles,
  memberships,
  accessGrants,
  grantScopes,
  registryResources,
  resourceRevisions,
  submissions,
  reviewDecisions,
  publicationReleases,
  publicationWithdrawals,
  auditEvents,
  outboxEvents,
  notifications,
};
