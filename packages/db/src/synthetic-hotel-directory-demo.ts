import type { DatabaseClient } from './client';
import { seedSyntheticRegistryDemo, type DemoActorKey } from './demo-seed';
import { provisionSyntheticHotelReleasePair } from './provision-hotel-location-directory';
import {
  syntheticHotelReleasePairImport,
  SYNTHETIC_HOTEL_GEOGRAPHY_RELEASE_ID,
} from './synthetic-hotel-location-fixture';

/** Explicit local provisioning, never a migration or automatic application startup. */
export async function provisionSyntheticHotelDirectoryDemo(
  client: DatabaseClient,
  issuer: string,
  subjects: Partial<Record<DemoActorKey, string>>,
  environment: NodeJS.ProcessEnv,
): Promise<void> {
  if (
    !['test', 'development'].includes(environment.NODE_ENV ?? '') ||
    environment.REGISTRY_POLICY_MODE !== 'demo'
  ) {
    throw new Error(
      'The synthetic hotel directory demo requires explicit development/test demo mode.',
    );
  }
  await seedSyntheticRegistryDemo(client, issuer, subjects);
  await provisionSyntheticHotelReleasePair(client, syntheticHotelReleasePairImport, environment);
  const canonicalIssuer = issuer.trim().replace(/\/+$/, '');
  await client.begin(async (transaction) => {
    for (const [key, organizationId, scopeUnitId] of [
      ['hotel-bureau.reviewer', 'demo-org-hotel-bureau', 'demo-geo-root'],
      ['hotel-bureau-b.reviewer', 'demo-org-hotel-bureau-b', 'demo-geo-area-b'],
    ] as const) {
      const subject = subjects[key];
      if (!subject) continue;
      for (const capability of [
        'hotel:application:bureau:read',
        'hotel:application:bureau:decide',
      ]) {
        const rows = await transaction.unsafe<{ id: string }[]>(
          `SELECT access_grant.id FROM access_grants access_grant
           JOIN memberships membership ON membership.id = access_grant.membership_id
           JOIN user_profiles profile ON profile.id = membership.user_profile_id
           WHERE profile.external_issuer = $1 AND profile.external_subject_id = $2
             AND profile.active = true AND membership.active = true
             AND membership.organization_id = $3 AND access_grant.organization_id = $3
             AND access_grant.capability = $4 AND access_grant.active = true
             AND access_grant.demo_only = true AND access_grant.production_decision_enabled = false
           FOR SHARE OF profile, membership, access_grant`,
          [canonicalIssuer, subject, organizationId, capability],
        );
        if (rows.length !== 1)
          throw new Error('The synthetic subject-to-organization grant binding is invalid.');
        await transaction.unsafe(
          `INSERT INTO grant_scopes
             (grant_id, hotel_geography_release_id, hotel_geography_unit_id, include_descendants)
           VALUES ($1, $2, $3, true)`,
          [rows[0]!.id, SYNTHETIC_HOTEL_GEOGRAPHY_RELEASE_ID, scopeUnitId],
        );
      }
    }
  });
}
