import type postgres from 'postgres';

import type { DatabaseClient } from './client';
import { resolveDisposableMigrationTarget } from './disposable-database-target';
import {
  validateHotelGeographyImport,
  validateHotelRoutingRules,
  type HotelGeographyUnitInput,
  type HotelRoutingRuleInput,
} from './hotel-location-directory';

export interface SyntheticHotelReleasePairImport {
  geography: {
    id: string;
    sourceName: string;
    sourceEdition: string;
    sourceReference: string;
    effectiveFrom?: string;
    effectiveTo?: string;
    synthetic: true;
    units: readonly HotelGeographyUnitInput[];
  };
  routing: {
    id: string;
    geographyReleaseId: string;
    sourceName: string;
    sourceEdition: string;
    provenance: string;
    synthetic: true;
    rules: readonly HotelRoutingRuleInput[];
  };
  continuity?: readonly {
    fromReleaseId: string;
    fromUnitRevisionId: string;
    toUnitRevisionId: string;
    relation:
      | 'same_entity'
      | 'renamed'
      | 'split_into'
      | 'merged_into'
      | 'possible_successor'
      | 'no_claim';
    confidence: 'asserted' | 'uncertain';
    provenance: string;
  }[];
}

export interface SyntheticHotelReviewScopeInput {
  issuer: string;
  subjectId: string;
  membershipId: string;
  organizationId: string;
  capability: 'hotel:application:bureau:read' | 'hotel:application:bureau:decide';
  geographyReleaseId: string;
  scopeUnitId: string;
  includeDescendants: boolean;
}

// Only static refusal messages use this type; database/input details are never logged by the CLI.
export class HotelReviewScopeProvisioningError extends Error {}

/** Explicit scope addition only: never creates identities or reactivates authority. */
export async function provisionSyntheticHotelReviewScope(
  client: DatabaseClient,
  input: SyntheticHotelReviewScopeInput,
  environment: NodeJS.ProcessEnv,
): Promise<{ grantId: string; scopeId: string; created: boolean }> {
  const target = resolveDisposableMigrationTarget(environment);
  if (
    !['development', 'test'].includes(environment.NODE_ENV ?? '') ||
    environment.REGISTRY_POLICY_MODE !== 'demo' ||
    !target.ok
  ) {
    throw new HotelReviewScopeProvisioningError(
      'Hotel review scope provisioning requires development/test demo mode and a guarded disposable target.',
    );
  }
  const options = client.options;
  if (
    options?.host.length !== 1 ||
    options.host[0]?.replace(/^\[|\]$/g, '') !== target.target.hostname ||
    options.port.length !== 1 ||
    options.port[0] !== target.target.port ||
    options.database !== target.target.databaseName
  ) {
    throw new HotelReviewScopeProvisioningError(
      'The review scope client does not match the guarded disposable target.',
    );
  }
  const fields = [
    'issuer',
    'subjectId',
    'membershipId',
    'organizationId',
    'capability',
    'geographyReleaseId',
    'scopeUnitId',
    'includeDescendants',
  ];
  if (
    !input ||
    typeof input !== 'object' ||
    Array.isArray(input) ||
    Object.keys(input).some((field) => !fields.includes(field)) ||
    fields
      .filter((field) => field !== 'includeDescendants')
      .some((field) => {
        const value = input[field as keyof SyntheticHotelReviewScopeInput];
        return (
          typeof value !== 'string' ||
          !value.trim() ||
          value !== value.trim() ||
          value.length > 1000
        );
      }) ||
    typeof input.includeDescendants !== 'boolean' ||
    !['hotel:application:bureau:read', 'hotel:application:bureau:decide'].includes(
      input.capability,
    ) ||
    !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(input.membershipId)
  ) {
    throw new HotelReviewScopeProvisioningError(
      'The explicit hotel review scope binding is invalid.',
    );
  }
  let issuer: string;
  try {
    const url = new URL(input.issuer);
    if (
      !['https:', 'http:'].includes(url.protocol) ||
      url.username ||
      url.password ||
      url.search ||
      url.hash
    ) {
      throw new Error();
    }
    issuer = url.href.replace(/\/+$/, '');
  } catch {
    throw new HotelReviewScopeProvisioningError('A canonical identity issuer URL is required.');
  }

  return client.begin(async (transaction) => {
    const [database] = await transaction.unsafe<{ database_name: string }[]>(
      'SELECT current_database() AS database_name',
    );
    if (database?.database_name !== target.target.databaseName) {
      throw new HotelReviewScopeProvisioningError(
        'The effective review scope database does not match the disposable target.',
      );
    }
    // Serialize requests and revocation on this membership without changing its state.
    const [binding] = await transaction.unsafe<{ id: string }[]>(
      `SELECT membership.id FROM memberships membership
       JOIN user_profiles profile ON profile.id = membership.user_profile_id
       JOIN organizations organization ON organization.id = membership.organization_id
       WHERE membership.id = $1 AND profile.external_issuer = $2 AND profile.external_subject_id = $3
         AND membership.organization_id = $4 AND membership.active = true AND profile.active = true
         AND organization.organization_type = 'administrative' AND organization.is_synthetic = true
       FOR UPDATE OF membership FOR SHARE OF profile, organization`,
      [input.membershipId, issuer, input.subjectId, input.organizationId],
    );
    if (!binding)
      throw new HotelReviewScopeProvisioningError(
        'An active synthetic Bureau identity/membership binding is required.',
      );
    const [scopeUnit] = await transaction.unsafe<{ unit_id: string }[]>(
      `SELECT revision.unit_id FROM hotel_geography_unit_revisions revision
       JOIN hotel_geography_releases geography ON geography.id = revision.geography_release_id
       WHERE geography.id = $1 AND revision.unit_id = $2 AND geography.synthetic = true
         AND geography.validation_status = 'valid' AND geography.activated_at IS NOT NULL
         AND EXISTS (
           SELECT 1 FROM hotel_routing_releases routing
           JOIN hotel_routing_rules rule ON rule.routing_release_id = routing.id
             AND rule.geography_release_id = routing.geography_release_id
           WHERE routing.geography_release_id = geography.id AND routing.synthetic = true
             AND routing.activated_at IS NOT NULL AND rule.enabled = true
             AND rule.bureau_organization_id = $3
         )`,
      [input.geographyReleaseId, input.scopeUnitId, input.organizationId],
    );
    if (!scopeUnit)
      throw new HotelReviewScopeProvisioningError(
        'The synthetic release, configured Bureau or review scope is unavailable.',
      );
    type Grant = {
      id: string;
      active: boolean;
      demo_only: boolean;
      production_decision_enabled: boolean;
    };
    const [insertedGrant] = await transaction.unsafe<Grant[]>(
      `INSERT INTO access_grants (membership_id, capability, organization_id, demo_only, production_decision_enabled)
       VALUES ($1, $2, $3, true, false)
       ON CONFLICT (membership_id, capability, organization_id) DO NOTHING
       RETURNING id, active, demo_only, production_decision_enabled`,
      [input.membershipId, input.capability, input.organizationId],
    );
    const [grant] = insertedGrant
      ? [insertedGrant]
      : await transaction.unsafe<Grant[]>(
          `SELECT id, active, demo_only, production_decision_enabled FROM access_grants
       WHERE membership_id = $1 AND capability = $2 AND organization_id = $3 FOR UPDATE`,
          [input.membershipId, input.capability, input.organizationId],
        );
    if (!grant || !grant.active || !grant.demo_only || grant.production_decision_enabled) {
      throw new HotelReviewScopeProvisioningError(
        'The existing hotel review grant is revoked or conflicts with demo-only authority.',
      );
    }
    const [insertedScope] = await transaction.unsafe<
      { id: string; include_descendants: boolean }[]
    >(
      `INSERT INTO grant_scopes (grant_id, hotel_geography_release_id, hotel_geography_unit_id, include_descendants)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (grant_id, hotel_geography_release_id, hotel_geography_unit_id) DO NOTHING
       RETURNING id, include_descendants`,
      [grant.id, input.geographyReleaseId, input.scopeUnitId, input.includeDescendants],
    );
    const [scope] = insertedScope
      ? [insertedScope]
      : await transaction.unsafe<{ id: string; include_descendants: boolean }[]>(
          `SELECT id, include_descendants FROM grant_scopes
       WHERE grant_id = $1 AND hotel_geography_release_id = $2 AND hotel_geography_unit_id = $3 FOR UPDATE`,
          [grant.id, input.geographyReleaseId, input.scopeUnitId],
        );
    if (!scope || scope.include_descendants !== input.includeDescendants) {
      throw new HotelReviewScopeProvisioningError(
        'The existing hotel review scope conflicts with the explicit request.',
      );
    }
    if (insertedScope) {
      const audit = await transaction.unsafe<{ id: string }[]>(
        `INSERT INTO audit_events (actor_issuer, actor_subject_id, action, outcome, policy_version, details)
         VALUES ('urn:ethio-tour:local-provisioner', 'synthetic-review-scope-provisioner',
           'hotel.directory.review_scope.provisioned', 'allowed', 'synthetic-hotel-directory-v1', $1::text::jsonb)
         RETURNING id`,
        [
          JSON.stringify({
            membershipId: input.membershipId,
            organizationId: input.organizationId,
            capability: input.capability,
            geographyReleaseId: input.geographyReleaseId,
            scopeUnitId: input.scopeUnitId,
            includeDescendants: input.includeDescendants,
            grantId: grant.id,
            scopeId: scope.id,
          }),
        ],
      );
      if (audit.length !== 1) throw new Error('Hotel review scope audit insert returned no row.');
    }
    return { grantId: grant.id, scopeId: scope.id, created: Boolean(insertedScope) };
  });
}

/** Local synthetic provisioning only. No HTTP administration surface is exposed. */
export async function provisionSyntheticHotelReleasePair(
  client: DatabaseClient,
  input: SyntheticHotelReleasePairImport,
  environment: NodeJS.ProcessEnv,
): Promise<void> {
  if (
    !['development', 'test'].includes(environment.NODE_ENV ?? '') ||
    environment.REGISTRY_POLICY_MODE !== 'demo' ||
    input.geography.synthetic !== true ||
    input.routing.synthetic !== true
  ) {
    throw new Error(
      'Hotel directory provisioning requires an explicit synthetic development/test environment.',
    );
  }
  if (input.geography.id !== input.routing.geographyReleaseId) {
    throw new Error('The routing and geography release are incompatible.');
  }
  for (const value of [
    input.geography.id,
    input.geography.sourceName,
    input.geography.sourceEdition,
    input.geography.sourceReference,
    input.routing.id,
    input.routing.sourceName,
    input.routing.sourceEdition,
    input.routing.provenance,
  ]) {
    if (typeof value !== 'string' || !value.trim() || value.length > 1000) {
      throw new Error('Synthetic release metadata is incomplete or oversized.');
    }
  }
  const geographyValidation = validateHotelGeographyImport(
    input.geography.id,
    input.geography.units,
  );
  const routingValidation = validateHotelRoutingRules(input.geography.units, input.routing.rules);
  if (!geographyValidation.valid || !routingValidation.valid) {
    throw new Error(
      `Hotel release validation failed: ${[...geographyValidation.errors, ...routingValidation.errors].join(' ')}`,
    );
  }

  await client.begin(async (transaction) => {
    // Serializes creation/activation, including the first pointer insertion.
    await transaction.unsafe('LOCK TABLE hotel_active_release_pair IN SHARE ROW EXCLUSIVE MODE');
    await transaction.unsafe(
      `INSERT INTO hotel_geography_releases
         (id, source_name, source_edition, source_reference, effective_from, effective_to,
          synthetic, validation_status, validation_report, validated_at)
       VALUES ($1, $2, $3, $4, $5, $6, true, 'valid', $7::text::jsonb, now())`,
      [
        input.geography.id,
        input.geography.sourceName,
        input.geography.sourceEdition,
        input.geography.sourceReference,
        input.geography.effectiveFrom ?? null,
        input.geography.effectiveTo ?? null,
        JSON.stringify(geographyValidation),
      ],
    );
    const revisionByUnit = new Map(
      input.geography.units.map((unit) => [unit.unitId, unit.revisionId]),
    );
    // Parent references are connected after all revisions exist, independent of import order.
    for (const unit of input.geography.units) {
      await transaction.unsafe(
        'INSERT INTO hotel_geography_units (id) VALUES ($1) ON CONFLICT (id) DO NOTHING',
        [unit.unitId],
      );
      await transaction.unsafe(
        `INSERT INTO hotel_geography_unit_revisions
           (id, geography_release_id, unit_id, unit_type)
         VALUES ($1, $2, $3, $4)`,
        [unit.revisionId, input.geography.id, unit.unitId, unit.unitType],
      );
      for (const name of unit.names) {
        await transaction.unsafe(
          `INSERT INTO hotel_geography_names
             (geography_release_id, unit_revision_id, value, normalized_value,
              language_tag, script, name_kind)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [
            input.geography.id,
            unit.revisionId,
            name.value.trim(),
            name.value.normalize('NFKC').trim().toLowerCase(),
            name.languageTag,
            name.script,
            name.kind,
          ],
        );
      }
      for (const identifier of unit.externalIdentifiers ?? []) {
        await transaction.unsafe(
          `INSERT INTO hotel_geography_external_identifiers
             (geography_release_id, unit_revision_id, source_namespace, source_identifier)
           VALUES ($1, $2, $3, $4)`,
          [
            input.geography.id,
            unit.revisionId,
            identifier.sourceNamespace,
            identifier.sourceIdentifier,
          ],
        );
      }
    }
    for (const unit of input.geography.units) {
      if (!unit.parentUnitId) continue;
      await transaction.unsafe(
        'UPDATE hotel_geography_unit_revisions SET parent_revision_id = $2 WHERE id = $1',
        [unit.revisionId, revisionByUnit.get(unit.parentUnitId)!],
      );
    }
    for (const continuity of input.continuity ?? []) {
      await transaction.unsafe(
        `INSERT INTO hotel_geography_continuity
           (from_release_id, from_unit_revision_id, to_release_id, to_unit_revision_id,
            relation, confidence, provenance)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          continuity.fromReleaseId,
          continuity.fromUnitRevisionId,
          input.geography.id,
          continuity.toUnitRevisionId,
          continuity.relation,
          continuity.confidence,
          continuity.provenance,
        ],
      );
    }
    await transaction.unsafe(
      'UPDATE hotel_geography_releases SET activated_at = now() WHERE id = $1',
      [input.geography.id],
    );
    await insertAndActivateRouting(transaction, input.routing);
  });
}

/** A routing correction can create a new release without changing geography. */
export async function provisionSyntheticHotelRoutingRelease(
  client: DatabaseClient,
  input: SyntheticHotelReleasePairImport['routing'],
  environment: NodeJS.ProcessEnv,
): Promise<void> {
  if (
    !['development', 'test'].includes(environment.NODE_ENV ?? '') ||
    environment.REGISTRY_POLICY_MODE !== 'demo' ||
    input.synthetic !== true
  ) {
    throw new Error(
      'Hotel routing provisioning requires an explicit synthetic development/test environment.',
    );
  }
  for (const value of [
    input.id,
    input.geographyReleaseId,
    input.sourceName,
    input.sourceEdition,
    input.provenance,
  ]) {
    if (typeof value !== 'string' || !value.trim() || value.length > 1000) {
      throw new Error('Synthetic routing release metadata is incomplete or oversized.');
    }
  }
  await client.begin(async (transaction) => {
    await transaction.unsafe('LOCK TABLE hotel_active_release_pair IN SHARE ROW EXCLUSIVE MODE');
    await insertAndActivateRouting(transaction, input);
  });
}

async function insertAndActivateRouting(
  transaction: postgres.TransactionSql,
  input: SyntheticHotelReleasePairImport['routing'],
): Promise<void> {
  await transaction.unsafe(
    `INSERT INTO hotel_routing_releases
       (id, geography_release_id, source_name, source_edition, provenance, synthetic, validated_at)
     VALUES ($1, $2, $3, $4, $5, true, now())`,
    [input.id, input.geographyReleaseId, input.sourceName, input.sourceEdition, input.provenance],
  );
  for (const rule of input.rules) {
    await transaction.unsafe(
      `INSERT INTO hotel_routing_rules
           (id, routing_release_id, geography_release_id, match_unit_id, match_mode,
            bureau_organization_id, scope_unit_id, enabled)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        rule.id,
        input.id,
        input.geographyReleaseId,
        rule.matchUnitId,
        rule.matchMode,
        rule.organizationId,
        rule.scopeUnitId,
        rule.enabled,
      ],
    );
  }
  await transaction.unsafe('UPDATE hotel_routing_releases SET activated_at = now() WHERE id = $1', [
    input.id,
  ]);
  await transaction.unsafe(
    `INSERT INTO hotel_active_release_pair (singleton, geography_release_id, routing_release_id)
       VALUES (1, $1, $2)
       ON CONFLICT (singleton) DO UPDATE
         SET geography_release_id = EXCLUDED.geography_release_id,
             routing_release_id = EXCLUDED.routing_release_id, activated_at = now()`,
    [input.geographyReleaseId, input.id],
  );
  await transaction.unsafe(
    `INSERT INTO audit_events (actor_issuer, actor_subject_id, action, outcome, policy_version, details)
       VALUES ('urn:ethio-tour:local-provisioner', 'synthetic-release-provisioner',
               'hotel.directory.release_pair.activated', 'allowed', 'synthetic-hotel-directory-v1', $1::text::jsonb)`,
    [JSON.stringify({ geographyReleaseId: input.geographyReleaseId, routingReleaseId: input.id })],
  );
}
