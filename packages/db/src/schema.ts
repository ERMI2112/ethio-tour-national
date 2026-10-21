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

// Structurally matches the public contract without adding a runtime package dependency.
export interface HotelLocation {
  id: string;
  label: string;
  parentId: string | null;
  hierarchy: { id: string; label: string; parentId: string | null }[];
}

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
    organizationType: text('organization_type').default('administrative').notNull(),
    level: text('level'),
    administrativeUnitId: text('administrative_unit_id').references(() => administrativeUnits.id),
    isSynthetic: boolean('is_synthetic').default(true).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    check(
      'organizations_type_level_check',
      sql`(${table.organizationType} = 'administrative' and ${table.level} in ('federal', 'regional', 'woreda', 'kebele')) or (${table.organizationType} in ('platform', 'provider') and ${table.level} is null and ${table.administrativeUnitId} is null)`,
    ),
    index('organizations_unit_idx').on(table.administrativeUnitId),
  ],
);

export const hotelGeographyReleases = pgTable(
  'hotel_geography_releases',
  {
    id: text('id').primaryKey(),
    sourceName: text('source_name').notNull(),
    sourceEdition: text('source_edition').notNull(),
    sourceReference: text('source_reference').notNull(),
    effectiveFrom: timestamp('effective_from', { withTimezone: true }),
    effectiveTo: timestamp('effective_to', { withTimezone: true }),
    synthetic: boolean('synthetic').notNull(),
    validationStatus: text('validation_status').default('draft').notNull(),
    validationReport: jsonb('validation_report').$type<Record<string, unknown>>(),
    validatedAt: timestamp('validated_at', { withTimezone: true }),
    activatedAt: timestamp('activated_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    check(
      'hotel_geography_releases_status_check',
      sql`${table.validationStatus} in ('draft', 'valid', 'invalid')`,
    ),
    check(
      'hotel_geography_releases_dates_check',
      sql`${table.effectiveTo} is null or ${table.effectiveFrom} is null or ${table.effectiveTo} >= ${table.effectiveFrom}`,
    ),
  ],
);

export const hotelGeographyUnits = pgTable('hotel_geography_units', {
  id: text('id').primaryKey(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const hotelGeographyUnitRevisions = pgTable(
  'hotel_geography_unit_revisions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    geographyReleaseId: text('geography_release_id')
      .notNull()
      .references(() => hotelGeographyReleases.id),
    unitId: text('unit_id')
      .notNull()
      .references(() => hotelGeographyUnits.id),
    parentRevisionId: uuid('parent_revision_id'),
    unitType: text('unit_type').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('hotel_geography_unit_revisions_release_unit_uq').on(
      table.geographyReleaseId,
      table.unitId,
    ),
    uniqueIndex('hotel_geography_unit_revisions_release_revision_uq').on(
      table.geographyReleaseId,
      table.id,
    ),
    foreignKey({
      columns: [table.geographyReleaseId, table.parentRevisionId],
      foreignColumns: [table.geographyReleaseId, table.id],
      name: 'hotel_geography_unit_revisions_parent_same_release_fk',
    }),
    check(
      'hotel_geography_unit_revisions_parent_check',
      sql`${table.parentRevisionId} is null or ${table.parentRevisionId} <> ${table.id}`,
    ),
    index('hotel_geography_unit_revisions_parent_idx').on(
      table.geographyReleaseId,
      table.parentRevisionId,
    ),
  ],
);

export const hotelGeographyNames = pgTable(
  'hotel_geography_names',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    geographyReleaseId: text('geography_release_id').notNull(),
    unitRevisionId: uuid('unit_revision_id').notNull(),
    value: text('value').notNull(),
    normalizedValue: text('normalized_value').notNull(),
    languageTag: text('language_tag').notNull(),
    script: text('script'),
    nameKind: text('name_kind').notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.geographyReleaseId, table.unitRevisionId],
      foreignColumns: [
        hotelGeographyUnitRevisions.geographyReleaseId,
        hotelGeographyUnitRevisions.id,
      ],
      name: 'hotel_geography_names_revision_release_fk',
    }),
    check('hotel_geography_names_kind_check', sql`${table.nameKind} in ('display', 'alias')`),
    uniqueIndex('hotel_geography_names_revision_value_uq').on(
      table.unitRevisionId,
      table.normalizedValue,
      table.languageTag,
      table.script,
      table.nameKind,
    ),
    index('hotel_geography_names_search_idx').on(table.geographyReleaseId, table.normalizedValue),
  ],
);

export const hotelGeographyExternalIdentifiers = pgTable(
  'hotel_geography_external_identifiers',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    geographyReleaseId: text('geography_release_id').notNull(),
    unitRevisionId: uuid('unit_revision_id').notNull(),
    sourceNamespace: text('source_namespace').notNull(),
    sourceIdentifier: text('source_identifier').notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.geographyReleaseId, table.unitRevisionId],
      foreignColumns: [
        hotelGeographyUnitRevisions.geographyReleaseId,
        hotelGeographyUnitRevisions.id,
      ],
      name: 'hotel_geography_external_identifiers_revision_release_fk',
    }),
    uniqueIndex('hotel_geography_external_identifiers_source_id_uq').on(
      table.geographyReleaseId,
      table.sourceNamespace,
      table.sourceIdentifier,
    ),
  ],
);

export const hotelGeographyContinuity = pgTable(
  'hotel_geography_continuity',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    fromReleaseId: text('from_release_id').notNull(),
    fromUnitRevisionId: uuid('from_unit_revision_id').notNull(),
    toReleaseId: text('to_release_id').notNull(),
    toUnitRevisionId: uuid('to_unit_revision_id').notNull(),
    relation: text('relation').notNull(),
    confidence: text('confidence').notNull(),
    provenance: text('provenance').notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.fromReleaseId, table.fromUnitRevisionId],
      foreignColumns: [
        hotelGeographyUnitRevisions.geographyReleaseId,
        hotelGeographyUnitRevisions.id,
      ],
      name: 'hotel_geography_continuity_from_revision_fk',
    }),
    foreignKey({
      columns: [table.toReleaseId, table.toUnitRevisionId],
      foreignColumns: [
        hotelGeographyUnitRevisions.geographyReleaseId,
        hotelGeographyUnitRevisions.id,
      ],
      name: 'hotel_geography_continuity_to_revision_fk',
    }),
    check(
      'hotel_geography_continuity_releases_check',
      sql`${table.fromReleaseId} <> ${table.toReleaseId}`,
    ),
    check(
      'hotel_geography_continuity_relation_check',
      sql`${table.relation} in ('same_entity', 'renamed', 'split_into', 'merged_into', 'possible_successor', 'no_claim')`,
    ),
    check(
      'hotel_geography_continuity_confidence_check',
      sql`${table.confidence} in ('asserted', 'uncertain')`,
    ),
  ],
);

export const hotelRoutingReleases = pgTable(
  'hotel_routing_releases',
  {
    id: text('id').primaryKey(),
    geographyReleaseId: text('geography_release_id')
      .notNull()
      .references(() => hotelGeographyReleases.id),
    sourceName: text('source_name').notNull(),
    sourceEdition: text('source_edition').notNull(),
    provenance: text('provenance').notNull(),
    synthetic: boolean('synthetic').notNull(),
    validatedAt: timestamp('validated_at', { withTimezone: true }),
    activatedAt: timestamp('activated_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('hotel_routing_releases_pair_uq').on(table.id, table.geographyReleaseId),
    index('hotel_routing_releases_geography_idx').on(table.geographyReleaseId),
  ],
);

export const hotelRoutingRules = pgTable(
  'hotel_routing_rules',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    routingReleaseId: text('routing_release_id').notNull(),
    geographyReleaseId: text('geography_release_id').notNull(),
    matchUnitId: text('match_unit_id').notNull(),
    matchMode: text('match_mode').notNull(),
    bureauOrganizationId: text('bureau_organization_id')
      .notNull()
      .references(() => organizations.id),
    scopeUnitId: text('scope_unit_id').notNull(),
    enabled: boolean('enabled').default(true).notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.routingReleaseId, table.geographyReleaseId],
      foreignColumns: [hotelRoutingReleases.id, hotelRoutingReleases.geographyReleaseId],
      name: 'hotel_routing_rules_release_pair_fk',
    }),
    foreignKey({
      columns: [table.geographyReleaseId, table.matchUnitId],
      foreignColumns: [
        hotelGeographyUnitRevisions.geographyReleaseId,
        hotelGeographyUnitRevisions.unitId,
      ],
      name: 'hotel_routing_rules_match_unit_release_fk',
    }),
    foreignKey({
      columns: [table.geographyReleaseId, table.scopeUnitId],
      foreignColumns: [
        hotelGeographyUnitRevisions.geographyReleaseId,
        hotelGeographyUnitRevisions.unitId,
      ],
      name: 'hotel_routing_rules_scope_unit_release_fk',
    }),
    uniqueIndex('hotel_routing_rules_assignment_uq').on(
      table.id,
      table.routingReleaseId,
      table.geographyReleaseId,
    ),
    uniqueIndex('hotel_routing_rules_scope_uq').on(table.id, table.scopeUnitId),
    uniqueIndex('hotel_routing_rules_organization_uq').on(table.id, table.bureauOrganizationId),
    check(
      'hotel_routing_rules_match_mode_check',
      sql`${table.matchMode} in ('exact', 'descendants')`,
    ),
    index('hotel_routing_rules_match_idx').on(
      table.routingReleaseId,
      table.geographyReleaseId,
      table.matchUnitId,
      table.enabled,
    ),
  ],
);

export const hotelActiveReleasePair = pgTable(
  'hotel_active_release_pair',
  {
    singleton: integer('singleton').primaryKey(),
    geographyReleaseId: text('geography_release_id').notNull(),
    routingReleaseId: text('routing_release_id').notNull(),
    activatedAt: timestamp('activated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.routingReleaseId, table.geographyReleaseId],
      foreignColumns: [hotelRoutingReleases.id, hotelRoutingReleases.geographyReleaseId],
      name: 'hotel_active_release_pair_compatible_fk',
    }),
    check('hotel_active_release_pair_singleton_check', sql`${table.singleton} = 1`),
  ],
);

export const hotelLocations = pgTable('hotel_locations', {
  administrativeUnitId: text('administrative_unit_id')
    .primaryKey()
    .references(() => administrativeUnits.id),
  enabled: boolean('enabled').default(true).notNull(),
});

export const hotelLocationRoutes = pgTable(
  'hotel_location_routes',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    locationUnitId: text('location_unit_id')
      .notNull()
      .references(() => hotelLocations.administrativeUnitId),
    bureauOrganizationId: text('bureau_organization_id')
      .notNull()
      .references(() => organizations.id),
    enabled: boolean('enabled').default(true).notNull(),
  },
  // Deliberately non-unique: multiple enabled routes must fail closed in the backend.
  (table) => [index('hotel_location_routes_location_idx').on(table.locationUnitId)],
);

export const hotelApplications = pgTable(
  'hotel_applications',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    applicantProfileId: uuid('applicant_profile_id')
      .notNull()
      .references(() => userProfiles.id),
    draftContent: jsonb('draft_content')
      .$type<{
        claimedHotelName: string;
        applicantNotes: string;
        administrativeUnitId?: string;
        locationSelection?: { geographyReleaseId: string; unitId: string; unitRevisionId: string };
      }>()
      .notNull(),
    status: text('status').default('draft').notNull(),
    admissionStatus: text('admission_status').default('not_eligible').notNull(),
    isSynthetic: boolean('is_synthetic').default(true).notNull(),
    currentVersionNumber: integer('current_version_number').default(0).notNull(),
    currentSubmittedVersionId: uuid('current_submitted_version_id').references(
      (): AnyPgColumn => hotelApplicationVersions.id,
    ),
    providerOrganizationId: text('provider_organization_id').references(() => organizations.id),
    version: integer('version').default(1).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('hotel_applications_provider_org_uq').on(table.providerOrganizationId),
    check(
      'hotel_applications_status_check',
      sql`${table.status} in ('draft', 'submitted', 'changes_requested', 'approved', 'rejected')`,
    ),
    check(
      'hotel_applications_admission_status_check',
      sql`${table.admissionStatus} in ('not_eligible', 'pending', 'admitted', 'declined')`,
    ),
    check(
      'hotel_applications_version_check',
      sql`${table.currentVersionNumber} >= 0 and ${table.version} > 0`,
    ),
    check('hotel_applications_synthetic_check', sql`${table.isSynthetic} = true`),
    index('hotel_applications_owner_idx').on(table.applicantProfileId, table.updatedAt),
    index('hotel_applications_status_idx').on(table.status, table.admissionStatus),
  ],
);

export const hotelApplicationVersions = pgTable(
  'hotel_application_versions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    applicationId: uuid('application_id')
      .notNull()
      .references(() => hotelApplications.id),
    versionNumber: integer('version_number').notNull(),
    content: jsonb('content')
      .$type<{
        claimedHotelName: string;
        applicantNotes: string;
        administrativeUnitId?: string;
        locationSelection?: { geographyReleaseId: string; unitId: string; unitRevisionId: string };
      }>()
      .notNull(),
    locationUnitId: text('location_unit_id').references(() => administrativeUnits.id),
    locationSnapshot: jsonb('location_snapshot').$type<HotelLocation>(),
    bureauOrganizationId: text('bureau_organization_id').references(() => organizations.id),
    scopeUnitId: text('scope_unit_id').references(() => administrativeUnits.id),
    geographyReleaseId: text('geography_release_id').references(() => hotelGeographyReleases.id),
    locationRevisionId: uuid('location_revision_id'),
    submittedLocationSnapshot: jsonb('submitted_location_snapshot').$type<
      Record<string, unknown>
    >(),
    routingReleaseId: text('routing_release_id').references(() => hotelRoutingReleases.id),
    routingRuleId: uuid('routing_rule_id'),
    resolvedScopeUnitId: text('resolved_scope_unit_id'),
    submittedByProfileId: uuid('submitted_by_profile_id')
      .notNull()
      .references(() => userProfiles.id),
    submittedAt: timestamp('submitted_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('hotel_application_versions_app_number_uq').on(
      table.applicationId,
      table.versionNumber,
    ),
    uniqueIndex('hotel_application_versions_app_id_uq').on(table.applicationId, table.id),
    uniqueIndex('hotel_application_versions_release_assignment_uq').on(
      table.id,
      table.geographyReleaseId,
      table.locationRevisionId,
      table.routingReleaseId,
      table.routingRuleId,
      table.bureauOrganizationId,
      table.resolvedScopeUnitId,
    ),
    foreignKey({
      columns: [table.geographyReleaseId, table.locationRevisionId],
      foreignColumns: [
        hotelGeographyUnitRevisions.geographyReleaseId,
        hotelGeographyUnitRevisions.id,
      ],
      name: 'hotel_application_versions_location_revision_release_fk',
    }),
    foreignKey({
      columns: [table.routingReleaseId, table.geographyReleaseId],
      foreignColumns: [hotelRoutingReleases.id, hotelRoutingReleases.geographyReleaseId],
      name: 'hotel_application_versions_routing_release_pair_fk',
    }),
    foreignKey({
      columns: [table.routingRuleId, table.routingReleaseId, table.geographyReleaseId],
      foreignColumns: [
        hotelRoutingRules.id,
        hotelRoutingRules.routingReleaseId,
        hotelRoutingRules.geographyReleaseId,
      ],
      name: 'hotel_application_versions_routing_rule_fk',
    }),
    foreignKey({
      columns: [table.routingRuleId, table.resolvedScopeUnitId],
      foreignColumns: [hotelRoutingRules.id, hotelRoutingRules.scopeUnitId],
      name: 'hotel_application_versions_routing_scope_fk',
    }),
    foreignKey({
      columns: [table.routingRuleId, table.bureauOrganizationId],
      foreignColumns: [hotelRoutingRules.id, hotelRoutingRules.bureauOrganizationId],
      name: 'hotel_application_versions_routing_organization_fk',
    }),
    check('hotel_application_versions_number_check', sql`${table.versionNumber} > 0`),
    check(
      'hotel_application_versions_routing_complete_check',
      sql`(${table.locationUnitId} is null and ${table.locationSnapshot} is null and ${table.bureauOrganizationId} is null and ${table.scopeUnitId} is null) or (${table.locationUnitId} is not null and ${table.locationSnapshot} is not null and ${table.bureauOrganizationId} is not null and ${table.scopeUnitId} is not null) or (${table.locationUnitId} is null and ${table.locationSnapshot} is null and ${table.bureauOrganizationId} is not null and ${table.scopeUnitId} is null and ${table.geographyReleaseId} is not null and ${table.locationRevisionId} is not null and ${table.routingReleaseId} is not null and ${table.routingRuleId} is not null and ${table.resolvedScopeUnitId} is not null and jsonb_typeof(${table.submittedLocationSnapshot}) = 'object')`,
    ),
    check(
      'hotel_application_versions_routing_consistency_check',
      sql`${table.locationUnitId} is null or (${table.scopeUnitId} = ${table.locationUnitId} and jsonb_typeof(${table.locationSnapshot}) = 'object' and (${table.locationSnapshot}->>'id' = ${table.locationUnitId}) is true and (not (${table.locationSnapshot} ? 'administrativeUnitId') or (${table.locationSnapshot}->>'administrativeUnitId' = ${table.locationUnitId}) is true) and (${table.content}->>'administrativeUnitId' = ${table.locationUnitId}) is true)`,
    ),
    check(
      'hotel_application_versions_release_assignment_complete_check',
      sql`(${table.geographyReleaseId} is null and ${table.locationRevisionId} is null and ${table.submittedLocationSnapshot} is null and ${table.routingReleaseId} is null and ${table.routingRuleId} is null and ${table.resolvedScopeUnitId} is null) or (${table.geographyReleaseId} is not null and ${table.locationRevisionId} is not null and jsonb_typeof(${table.submittedLocationSnapshot}) = 'object' and ${table.routingReleaseId} is not null and ${table.routingRuleId} is not null and ${table.bureauOrganizationId} is not null and ${table.scopeUnitId} is null and ${table.locationUnitId} is null and ${table.locationSnapshot} is null and ${table.resolvedScopeUnitId} is not null)`,
    ),
    check(
      'hotel_application_versions_release_assignment_consistency_check',
      sql`${table.geographyReleaseId} is null or ((${table.content}->'locationSelection'->>'geographyReleaseId' = ${table.geographyReleaseId}) is true and (${table.content}->'locationSelection'->>'unitRevisionId' = ${table.locationRevisionId}::text) is true and (${table.submittedLocationSnapshot}->>'geographyReleaseId' = ${table.geographyReleaseId}) is true and (${table.submittedLocationSnapshot}->>'unitRevisionId' = ${table.locationRevisionId}::text) is true)`,
    ),
    index('hotel_application_versions_submitted_idx').on(table.submittedAt),
  ],
);

export const hotelBureauCases = pgTable(
  'hotel_bureau_cases',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    applicationId: uuid('application_id').notNull(),
    applicationVersionId: uuid('application_version_id').notNull(),
    bureauOrganizationId: text('bureau_organization_id')
      .notNull()
      .references(() => organizations.id),
    scopeUnitId: text('scope_unit_id').references(() => administrativeUnits.id),
    geographyReleaseId: text('geography_release_id'),
    locationRevisionId: uuid('location_revision_id'),
    routingReleaseId: text('routing_release_id'),
    routingRuleId: uuid('routing_rule_id'),
    scopeGeographyUnitId: text('scope_geography_unit_id'),
    status: text('status').default('in_review').notNull(),
    version: integer('version').default(1).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.applicationId, table.applicationVersionId],
      foreignColumns: [hotelApplicationVersions.applicationId, hotelApplicationVersions.id],
      name: 'hotel_bureau_cases_version_fk',
    }),
    foreignKey({
      columns: [
        table.applicationVersionId,
        table.geographyReleaseId,
        table.locationRevisionId,
        table.routingReleaseId,
        table.routingRuleId,
        table.bureauOrganizationId,
        table.scopeGeographyUnitId,
      ],
      foreignColumns: [
        hotelApplicationVersions.id,
        hotelApplicationVersions.geographyReleaseId,
        hotelApplicationVersions.locationRevisionId,
        hotelApplicationVersions.routingReleaseId,
        hotelApplicationVersions.routingRuleId,
        hotelApplicationVersions.bureauOrganizationId,
        hotelApplicationVersions.resolvedScopeUnitId,
      ],
      name: 'hotel_bureau_cases_release_assignment_fk',
    }),
    uniqueIndex('hotel_bureau_cases_version_uq').on(table.applicationVersionId),
    check(
      'hotel_bureau_cases_status_check',
      sql`${table.status} in ('submitted', 'in_review', 'approved', 'changes_requested', 'rejected')`,
    ),
    check('hotel_bureau_cases_version_check', sql`${table.version} > 0`),
    check(
      'hotel_bureau_cases_release_assignment_complete_check',
      sql`(${table.geographyReleaseId} is null and ${table.locationRevisionId} is null and ${table.routingReleaseId} is null and ${table.routingRuleId} is null and ${table.scopeGeographyUnitId} is null and ${table.scopeUnitId} is not null) or (${table.geographyReleaseId} is not null and ${table.locationRevisionId} is not null and ${table.routingReleaseId} is not null and ${table.routingRuleId} is not null and ${table.scopeGeographyUnitId} is not null and ${table.scopeUnitId} is null)`,
    ),
    index('hotel_bureau_cases_queue_idx').on(
      table.bureauOrganizationId,
      table.scopeUnitId,
      table.status,
      table.createdAt,
    ),
    index('hotel_bureau_cases_release_queue_idx').on(
      table.bureauOrganizationId,
      table.geographyReleaseId,
      table.scopeGeographyUnitId,
      table.status,
      table.createdAt,
    ),
  ],
);

export const hotelBureauDecisions = pgTable(
  'hotel_bureau_decisions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    caseId: uuid('case_id')
      .notNull()
      .references(() => hotelBureauCases.id),
    applicationVersionId: uuid('application_version_id')
      .notNull()
      .references(() => hotelApplicationVersions.id),
    reviewerProfileId: uuid('reviewer_profile_id')
      .notNull()
      .references(() => userProfiles.id),
    reviewerMembershipId: uuid('reviewer_membership_id')
      .notNull()
      .references(() => memberships.id),
    decision: text('decision').notNull(),
    reason: text('reason').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('hotel_bureau_decisions_case_uq').on(table.caseId),
    check(
      'hotel_bureau_decisions_decision_check',
      sql`${table.decision} in ('approve', 'request_changes', 'reject')`,
    ),
    index('hotel_bureau_decisions_version_idx').on(table.applicationVersionId),
  ],
);

export const hotelAdmissionDecisions = pgTable(
  'hotel_admission_decisions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    applicationId: uuid('application_id')
      .notNull()
      .references(() => hotelApplications.id),
    applicationVersionId: uuid('application_version_id')
      .notNull()
      .references(() => hotelApplicationVersions.id),
    administratorProfileId: uuid('administrator_profile_id')
      .notNull()
      .references(() => userProfiles.id),
    administratorMembershipId: uuid('administrator_membership_id')
      .notNull()
      .references(() => memberships.id),
    decision: text('decision').notNull(),
    reason: text('reason').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('hotel_admission_decisions_app_version_uq').on(
      table.applicationId,
      table.applicationVersionId,
    ),
    check(
      'hotel_admission_decisions_decision_check',
      sql`${table.decision} in ('admit', 'decline')`,
    ),
    index('hotel_admission_decisions_created_idx').on(table.createdAt),
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
      sql`${table.capability} in ('registry:resource:read', 'registry:resource:create', 'registry:resource:edit', 'registry:submission:submit', 'registry:submission:review', 'registry:publication:publish', 'registry:publication:withdraw', 'hotel:application:bureau:read', 'hotel:application:bureau:decide', 'hotel:application:admin:read', 'hotel:application:admin:decide', 'hotel:workspace:read', 'hotel:workspace:edit')`,
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
    administrativeUnitId: text('administrative_unit_id').references(() => administrativeUnits.id),
    includeDescendants: boolean('include_descendants').default(false).notNull(),
    hotelGeographyReleaseId: text('hotel_geography_release_id'),
    hotelGeographyUnitId: text('hotel_geography_unit_id'),
  },
  (table) => [
    uniqueIndex('grant_scopes_grant_unit_uq').on(table.grantId, table.administrativeUnitId),
    uniqueIndex('grant_scopes_grant_hotel_geo_uq').on(
      table.grantId,
      table.hotelGeographyReleaseId,
      table.hotelGeographyUnitId,
    ),
    foreignKey({
      columns: [table.hotelGeographyReleaseId, table.hotelGeographyUnitId],
      foreignColumns: [
        hotelGeographyUnitRevisions.geographyReleaseId,
        hotelGeographyUnitRevisions.unitId,
      ],
      name: 'grant_scopes_hotel_geography_unit_fk',
    }),
    check(
      'grant_scopes_exactly_one_geography_check',
      sql`(${table.administrativeUnitId} is not null and ${table.hotelGeographyReleaseId} is null and ${table.hotelGeographyUnitId} is null) or (${table.administrativeUnitId} is null and ${table.hotelGeographyReleaseId} is not null and ${table.hotelGeographyUnitId} is not null)`,
    ),
    index('grant_scopes_unit_idx').on(table.administrativeUnitId),
    index('grant_scopes_hotel_geography_idx').on(
      table.hotelGeographyReleaseId,
      table.hotelGeographyUnitId,
    ),
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
  hotelGeographyReleases,
  hotelGeographyUnits,
  hotelGeographyUnitRevisions,
  hotelGeographyNames,
  hotelGeographyExternalIdentifiers,
  hotelGeographyContinuity,
  hotelRoutingReleases,
  hotelRoutingRules,
  hotelActiveReleasePair,
  hotelLocations,
  hotelLocationRoutes,
  hotelApplications,
  hotelApplicationVersions,
  hotelBureauCases,
  hotelBureauDecisions,
  hotelAdmissionDecisions,
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
