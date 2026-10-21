import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import postgres from 'postgres';
import { describe, expect, it } from 'vitest';
import { isDisposableHotelTestDatabase } from '@ethio-tour/db/testing/disposable-database-target';

import { HotelOnboardingService } from './hotel-onboarding-service';
import { PostgresHotelOnboardingStore } from './postgres-hotel-onboarding-store';

const target = process.env.HOTEL_PILOT_TEST_DATABASE_URL;
const allowed = isDisposableHotelTestDatabase(target, process.env.HOTEL_PILOT_TEST_DISPOSABLE);
if (process.env.HOTEL_PILOT_TEST_REQUIRED === 'true' && !allowed) {
  throw new Error('The hotel upgrade test requires the guarded disposable database target.');
}

describe.skipIf(!allowed)('real hotel migration 0004 to 0005 preservation', () => {
  it('preserves legacy versions, decisions, admitted workspace and grants without release backfill', async () => {
    const admin = postgres(target!, { max: 1, onnotice: () => undefined });
    const databaseName = `ethio_tour_hotel_test_upgrade_${randomUUID().replace(/-/g, '')}`;
    const upgradeUrl = new URL(target!);
    upgradeUrl.pathname = `/${databaseName}`;
    let client: postgres.Sql | undefined;
    try {
      // This creates an additional database only within the operator-verified,
      // newly provisioned disposable server. It remains for container cleanup.
      await admin`CREATE DATABASE ${admin(databaseName)}`;
      client = postgres(upgradeUrl.href, { max: 1, onnotice: () => undefined });
      for (const tag of [
        '0000_fresh_banshee',
        '0001_flashy_lily_hollister',
        '0002_normal_ronan',
        '0003_hotel_multi_office',
        '0004_hotel_case_assignment_immutable',
      ]) {
        await applyMigration(client, tag);
      }

      const owner = randomUUID();
      const reviewer = randomUUID();
      const administrator = randomUUID();
      const application = randomUUID();
      const version = randomUUID();
      const caseId = randomUUID();
      const member = randomUUID();
      const readGrant = randomUUID();
      const editGrant = randomUUID();
      const reviewMember = randomUUID();
      const adminMember = randomUUID();
      const legacyContent = {
        claimedHotelName: 'Synthetic legacy upgrade lodging',
        applicantNotes: 'Preserved synthetic history.',
        administrativeUnitId: 'upgrade-unit',
      };
      const node = { id: 'upgrade-unit', label: 'Synthetic legacy location', parentId: null };
      const snapshot = { ...node, hierarchy: [node] };
      await client.begin(async (sql) => {
        await sql.unsafe(
          "INSERT INTO administrative_units (id, display_name, level, is_synthetic) VALUES ('upgrade-unit', 'Synthetic legacy location', 'woreda', true)",
        );
        await sql.unsafe(`INSERT INTO organizations (id, display_name, organization_type, level, administrative_unit_id, is_synthetic)
          VALUES ('upgrade-office', 'Synthetic legacy office', 'administrative', 'woreda', 'upgrade-unit', true),
                 ('upgrade-platform', 'Synthetic legacy platform', 'platform', NULL, NULL, true),
                 ('upgrade-provider', 'Synthetic legacy private provider', 'provider', NULL, NULL, true)`);
        for (const [id, subject] of [
          [owner, 'synthetic-upgrade-owner'],
          [reviewer, 'synthetic-upgrade-reviewer'],
          [administrator, 'synthetic-upgrade-admin'],
        ]) {
          await sql.unsafe(
            'INSERT INTO user_profiles (id, external_issuer, external_subject_id) VALUES ($1, $2, $3)',
            [id!, 'https://identity.example.test/realms/synthetic-upgrade', subject!],
          );
        }
        await sql.unsafe(
          'INSERT INTO hotel_applications (id, applicant_profile_id, draft_content) VALUES ($1, $2, $3::text::jsonb)',
          [application, owner, JSON.stringify(legacyContent)],
        );
        await sql.unsafe(
          `INSERT INTO hotel_application_versions
          (id, application_id, version_number, content, submitted_by_profile_id, location_unit_id, location_snapshot, bureau_organization_id, scope_unit_id)
          VALUES ($1, $2, 1, $3::text::jsonb, $4, 'upgrade-unit', $5::text::jsonb, 'upgrade-office', 'upgrade-unit')`,
          [version, application, JSON.stringify(legacyContent), owner, JSON.stringify(snapshot)],
        );
        await sql.unsafe(
          `INSERT INTO hotel_bureau_cases (id, application_id, application_version_id, bureau_organization_id, scope_unit_id, status)
          VALUES ($1, $2, $3, 'upgrade-office', 'upgrade-unit', 'approved')`,
          [caseId, application, version],
        );
        for (const [id, profile, organization] of [
          [member, owner, 'upgrade-provider'],
          [reviewMember, reviewer, 'upgrade-office'],
          [adminMember, administrator, 'upgrade-platform'],
        ]) {
          await sql.unsafe(
            "INSERT INTO memberships (id, user_profile_id, organization_id, label) VALUES ($1, $2, $3, 'Synthetic legacy role')",
            [id!, profile!, organization!],
          );
        }
        for (const [id, capability] of [
          [readGrant, 'hotel:workspace:read'],
          [editGrant, 'hotel:workspace:edit'],
        ]) {
          await sql.unsafe(
            `INSERT INTO access_grants (id, membership_id, capability, organization_id, demo_only, production_decision_enabled)
            VALUES ($1, $2, $3, 'upgrade-provider', true, false)`,
            [id!, member, capability!],
          );
        }
        await sql.unsafe(
          `INSERT INTO hotel_bureau_decisions
          (case_id, application_version_id, reviewer_profile_id, reviewer_membership_id, decision, reason)
          VALUES ($1, $2, $3, $4, 'approve', 'Synthetic legacy decision')`,
          [caseId, version, reviewer, reviewMember],
        );
        await sql.unsafe(
          `INSERT INTO hotel_admission_decisions
          (application_id, application_version_id, administrator_profile_id, administrator_membership_id, decision, reason)
          VALUES ($1, $2, $3, $4, 'admit', 'Synthetic legacy admission')`,
          [application, version, administrator, adminMember],
        );
        await sql.unsafe(
          `UPDATE hotel_applications SET status = 'approved', admission_status = 'admitted',
          current_version_number = 1, current_submitted_version_id = $2, provider_organization_id = 'upgrade-provider' WHERE id = $1`,
          [application, version],
        );
      });

      const tables = [
        'administrative_units',
        'organizations',
        'user_profiles',
        'memberships',
        'access_grants',
        'grant_scopes',
        'hotel_applications',
        'hotel_application_versions',
        'hotel_bureau_cases',
        'hotel_bureau_decisions',
        'hotel_admission_decisions',
      ];
      const before = new Map<string, { columns: string[]; rows: unknown[] }>();
      for (const table of tables) {
        const columns = await client.unsafe<{ column_name: string }[]>(
          "SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1 ORDER BY ordinal_position",
          [table],
        );
        const names = columns.map((column) => column.column_name);
        before.set(table, {
          columns: names,
          rows: await client.unsafe(
            `SELECT ${names.map((name) => `"${name}"`).join(',')} FROM "${table}" ORDER BY id`,
          ),
        });
      }
      await applyMigration(client, '0005_hotel_versioned_directory');
      for (const [table, original] of before) {
        const after = await client.unsafe(
          `SELECT ${original.columns.map((name) => `"${name}"`).join(',')} FROM "${table}" ORDER BY id`,
        );
        expect(after, `Existing ${table} data must be preserved`).toEqual(original.rows);
      }
      const [releaseState] = await client.unsafe(`SELECT
        (SELECT count(*)::int FROM hotel_geography_releases) AS geography_count,
        (SELECT count(*)::int FROM hotel_routing_releases) AS routing_count,
        (SELECT count(*)::int FROM hotel_application_versions WHERE geography_release_id IS NOT NULL OR routing_release_id IS NOT NULL) AS backfilled_versions,
        (SELECT count(*)::int FROM grant_scopes WHERE hotel_geography_release_id IS NOT NULL) AS backfilled_grants`);
      expect(releaseState).toEqual({
        geography_count: 0,
        routing_count: 0,
        backfilled_versions: 0,
        backfilled_grants: 0,
      });
      const service = new HotelOnboardingService(new PostgresHotelOnboardingStore(client), {
        enabled: true,
        production: false,
        administratorOrganizationId: 'upgrade-platform',
      });
      const workspace = await service.getProviderWorkspace(
        {
          issuer: 'https://identity.example.test/realms/synthetic-upgrade',
          subjectId: 'synthetic-upgrade-owner',
        },
        application,
      );
      expect(workspace).toMatchObject({
        workspaceAccess: 'private_only',
        admittedVersion: 1,
        locationState: 'legacy',
        location: snapshot,
      });
      await expect(
        client.unsafe("UPDATE hotel_application_versions SET content = '{}'::jsonb WHERE id = $1", [
          version,
        ]),
      ).rejects.toThrow('history is immutable');
      await expect(
        client.unsafe('UPDATE hotel_bureau_cases SET scope_unit_id = NULL WHERE id = $1', [caseId]),
      ).rejects.toThrow('assignment is immutable');
    } finally {
      await client?.end({ timeout: 5 });
      await admin.end({ timeout: 5 });
    }
  }, 120_000);
});

async function applyMigration(client: postgres.Sql, tag: string): Promise<void> {
  const migration = readFileSync(resolve(process.cwd(), '../db/drizzle', `${tag}.sql`), 'utf8');
  await client.begin(async (sql) => {
    for (const statement of migration
      .split('--> statement-breakpoint')
      .map((item) => item.trim())
      .filter(Boolean)) {
      await sql.unsafe(statement);
    }
  });
}
