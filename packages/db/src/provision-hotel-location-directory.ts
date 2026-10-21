import type postgres from 'postgres';

import type { DatabaseClient } from './client';
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
