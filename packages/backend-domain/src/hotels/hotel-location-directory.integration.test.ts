import { randomUUID } from 'node:crypto';

import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { isDisposableHotelTestDatabase } from '@ethio-tour/db/testing/disposable-database-target';
import {
  provisionSyntheticHotelReleasePair,
  provisionSyntheticHotelRoutingRelease,
} from '@ethio-tour/db';
import type { HotelGeographyUnitInput, SyntheticHotelReleasePairImport } from '@ethio-tour/db';
import type {
  HotelApplicationContent,
  HotelLocationSearchQuery,
  HotelLocationSelection,
} from '@ethio-tour/contracts';

import { HotelOnboardingService } from './hotel-onboarding-service';
import { PostgresHotelOnboardingStore } from './postgres-hotel-onboarding-store';
import type { RegistryActor } from '../registry/registry-store';

const databaseUrl = process.env.HOTEL_PILOT_TEST_DATABASE_URL;
const safeDatabase = isDisposableHotelTestDatabase(
  databaseUrl,
  process.env.HOTEL_PILOT_TEST_DISPOSABLE,
);
if (process.env.HOTEL_PILOT_TEST_REQUIRED === 'true' && !safeDatabase) {
  throw new Error('Required hotel tests need the guarded disposable HOTEL_PILOT_TEST_* target.');
}
const suite = describe.skipIf(!safeDatabase);
const environment = { NODE_ENV: 'test', REGISTRY_POLICY_MODE: 'demo' };
const issuer = 'https://identity.example.test/realms/synthetic-directory';
const readCapability = 'hotel:application:bureau:read';
const decideCapability = 'hotel:application:bureau:decide';
let client: postgres.Sql;
let suiteLock: postgres.Sql;

beforeAll(async () => {
  if (!safeDatabase || !databaseUrl) return;
  suiteLock = postgres(databaseUrl, { max: 1 });
  await suiteLock.unsafe("SET lock_timeout = '90s'");
  await suiteLock.unsafe('SELECT pg_advisory_lock(20261021, 71501)');
  client = postgres(databaseUrl, { max: 8 });
  const [migration] = await client.unsafe<{ exists: boolean }[]>(
    `SELECT to_regclass('public.hotel_active_release_pair') IS NOT NULL
     AND EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'hotel_versioned_submission_guard' AND NOT tgisinternal)
     AND EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'hotel_case_release_assignment_guard' AND NOT tgisinternal) AS exists`,
  );
  if (!migration?.exists) throw new Error('Disposable database is missing hotel migration 0005.');
}, 120_000);

afterAll(async () => {
  try {
    if (client) await client.end({ timeout: 5 });
  } finally {
    if (suiteLock) await suiteLock.end({ timeout: 5 });
  }
});

suite('release-aware hotel location directory PostgreSQL integration', () => {
  it.each([
    'cycle',
    'missing-parent',
    'duplicate-source-id',
    'foreign-release',
    'incompatible-pair',
    'invalid-route-reference',
  ] as const)('rejects an invalid import atomically without activating it: %s', async (failure) => {
    const f = await fixture();
    const invalidId = `directory-invalid-${randomUUID()}`;
    const units = f.pair.geography.units.map((item) => ({ ...item, revisionId: randomUUID() }));
    const invalid: SyntheticHotelReleasePairImport = {
      geography: { ...f.pair.geography, id: invalidId, units },
      routing: {
        ...f.pair.routing,
        id: `directory-invalid-routing-${randomUUID()}`,
        geographyReleaseId: invalidId,
        rules: f.pair.routing.rules.map((rule) => ({ ...rule, id: randomUUID() })),
      },
    };
    if (failure === 'cycle') units[0]!.parentUnitId = f.leafA.unitId;
    if (failure === 'missing-parent') units[0]!.parentUnitId = 'missing-synthetic-parent';
    if (failure === 'duplicate-source-id')
      units[4]!.externalIdentifiers = f.leafA.externalIdentifiers!;
    if (failure === 'foreign-release')
      Object.assign(units[0]!, { releaseId: 'foreign-synthetic-release' });
    if (failure === 'incompatible-pair')
      invalid.routing.geographyReleaseId = 'foreign-synthetic-release';
    if (failure === 'invalid-route-reference')
      Object.assign(invalid.routing.rules[0]!, { scopeUnitId: 'foreign-synthetic-unit' });
    await expect(provisionSyntheticHotelReleasePair(client, invalid, environment)).rejects.toThrow(
      /validation|incompatible/i,
    );
    const [state] = await client.unsafe(
      `SELECT (SELECT count(*)::int FROM hotel_geography_releases WHERE id = $1) AS imported,
         (SELECT geography_release_id FROM hotel_active_release_pair WHERE singleton = 1) AS geography,
         (SELECT routing_release_id FROM hotel_active_release_pair WHERE singleton = 1) AS routing`,
      [invalidId],
    );
    expect(state).toEqual({
      imported: 0,
      geography: f.pair.geography.id,
      routing: f.pair.routing.id,
    });
  });

  it('derives office and scope server-side even when an applicant supplies forged routing fields', async () => {
    const f = await fixture();
    const forgedContent = {
      ...content(selection(f.pair, f.leafA)),
      bureauOrganizationId: f.officeB,
      organizationId: f.officeB,
      scopeUnitId: f.rootB.unitId,
      synthetic: false,
      locationSelection: {
        ...selection(f.pair, f.leafA),
        routingReleaseId: 'forged-routing-release',
      },
    };
    const draft = await f.service.createApplication(f.applicant, { content: forgedContent });
    expect(draft.content).toEqual(
      contentWithName(draft.content.claimedHotelName, selection(f.pair, f.leafA)),
    );
    const submitted = await f.service.submitApplication(f.applicant, draft.id, draft.version);
    await assertBinding(submitted.id, f.pair);
    const assigned = await f.service.getBureauCase(f.reviewer, await caseId(submitted.id));
    expect(assigned.assignment).toMatchObject({
      organizationId: f.officeA,
      scopeUnitId: f.leafA.unitId,
    });
    await expect(f.service.getBureauCase(f.otherReviewer, assigned.caseId)).rejects.toMatchObject({
      code: 'not_found',
    });
  });

  it('disambiguates duplicate names with different-depth paths and omits assignment/private metadata', async () => {
    const f = await fixture();
    const result = await f.service.listLocations(f.applicant, { query: 'Synthetic locality' });
    expect(result.directoryRelease).toMatchObject({
      id: f.pair.geography.id,
      synthetic: true,
      sourceEdition: 'fixture-A',
    });
    expect(result.items.map((item) => item.unitId).sort()).toEqual(
      [f.leafA.unitId, f.leafB.unitId].sort(),
    );
    expect(result.items.every((item) => item.displayName === 'Synthetic locality')).toBe(true);
    const a = result.items.find((item) => item.unitId === f.leafA.unitId)!;
    const b = result.items.find((item) => item.unitId === f.leafB.unitId)!;
    expect(a.hierarchy.map((item) => item.unitId)).toEqual([
      f.rootA.unitId,
      f.branch.unitId,
      f.leafA.unitId,
    ]);
    expect(b.hierarchy.map((item) => item.unitId)).toEqual([f.rootB.unitId, f.leafB.unitId]);
    for (const item of result.items) {
      expect(Object.keys(item).sort()).toEqual([
        'displayName',
        'hierarchy',
        'matchedName',
        'unitId',
        'unitRevisionId',
        'unitType',
      ]);
      for (const node of item.hierarchy)
        expect(Object.keys(node).sort()).toEqual([
          'displayName',
          'unitId',
          'unitRevisionId',
          'unitType',
        ]);
    }
    for (const privateValue of [
      f.officeA,
      f.officeB,
      f.reviewer.subjectId,
      f.pair.routing.id,
      f.pair.routing.rules[0]!.id,
    ]) {
      expect(JSON.stringify(result)).not.toContain(privateValue);
    }
  });

  it('searches stored multilingual aliases once per unit with NFKC normalization and literal wildcards', async () => {
    const f = await fixture();
    const alias = await f.service.listLocations(f.applicant, {
      query: '  ＡＬＩＡＳ  ',
      language: 'fr',
    });
    expect(alias.items).toHaveLength(1);
    expect(alias.items[0]).toMatchObject({
      unitId: f.leafA.unitId,
      displayName: 'Localite synthetique A',
      matchedName: { language: 'fr' },
    });
    expect(alias.items[0]!.hierarchy.at(-1)?.displayName).toBe(alias.items[0]!.displayName);
    expect(
      (await f.service.listLocations(f.applicant, { query: '%_' })).items.map(
        (item) => item.unitId,
      ),
    ).toEqual([f.leafA.unitId]);
    expect(
      (await f.service.listLocations(f.applicant, { query: 'nonexistent synthetic location' }))
        .items,
    ).toEqual([]);
  });

  it('uses deterministic keyset pagination with no duplicate or missing units', async () => {
    const f = await fixture();
    const expected = await f.service.listLocations(f.applicant, { limit: 50 });
    const ids: string[] = [];
    const cursors = new Set<string>();
    let cursor: string | undefined;
    for (let page = 0; page < f.pair.geography.units.length + 1; page++) {
      const result = await f.service.listLocations(f.applicant, {
        limit: 1,
        ...(cursor ? { cursor } : {}),
      });
      expect(result.items.length).toBeLessThanOrEqual(1);
      ids.push(...result.items.map((item) => item.unitId));
      if (!result.nextCursor) break;
      expect(cursors.has(result.nextCursor)).toBe(false);
      cursors.add(result.nextCursor);
      cursor = result.nextCursor;
    }
    expect(ids).toEqual(expected.items.map((item) => item.unitId));
    expect(new Set(ids).size).toBe(f.pair.geography.units.length);
    expect(await f.service.listLocations(f.applicant, { limit: 50 })).toEqual(expected);
  });

  it.each([
    { limit: 0 },
    { limit: 51 },
    { limit: 1.5 },
    { query: 'x'.repeat(101) },
    { language: 'invalid_language' },
    { cursor: 'not-a-location-cursor' },
  ] satisfies HotelLocationSearchQuery[])('rejects invalid search inputs %j', async (query) => {
    const f = await fixture();
    await expect(f.service.listLocations(f.applicant, query)).rejects.toMatchObject({
      code: 'invalid',
    });
  });

  it('rejects query-bound cursors and stale release cursors/selections without mutating drafts', async () => {
    const f = await fixture();
    const page = await f.service.listLocations(f.applicant, { query: 'Synthetic', limit: 1 });
    expect(page.nextCursor).not.toBeNull();
    await expect(
      f.service.listLocations(f.applicant, { query: 'locality', cursor: page.nextCursor! }),
    ).rejects.toMatchObject({ code: 'invalid' });
    const draft = await f.service.createApplication(f.applicant, {
      content: content(selection(f.pair, f.leafA)),
    });
    const b = nextPair(f);
    await provisionSyntheticHotelReleasePair(client, b, environment);
    await expect(
      f.service.listLocations(f.applicant, { query: 'Synthetic', cursor: page.nextCursor! }),
    ).rejects.toMatchObject({ code: 'conflict' });
    expect(await f.service.getMyApplication(f.applicant, draft.id)).toMatchObject({
      status: 'draft',
      version: draft.version,
      locationState: 'stale',
    });
    await expect(
      f.service.submitApplication(f.applicant, draft.id, draft.version),
    ).rejects.toMatchObject({ code: 'conflict' });
    await expectNoSubmission(draft.id);
  });

  it.each(['no-selection', 'no-route', 'disabled-route', 'ambiguous-route'] as const)(
    'preserves a private draft with no version/case/success audit for %s',
    async (failure) => {
      const f = await fixture((pair) => {
        if (failure === 'no-route') pair.routing.rules = [];
        if (failure === 'disabled-route')
          pair.routing.rules = pair.routing.rules.map((rule) => ({ ...rule, enabled: false }));
        if (failure === 'ambiguous-route')
          pair.routing.rules = [
            ...pair.routing.rules,
            {
              id: randomUUID(),
              matchUnitId: pair.geography.units[0]!.unitId,
              matchMode: 'descendants',
              organizationId: pair.routing.rules[0]!.organizationId,
              scopeUnitId: pair.geography.units[0]!.unitId,
              enabled: true,
            },
          ];
      });
      const draftContent: HotelApplicationContent =
        failure === 'no-selection'
          ? { claimedHotelName: 'Synthetic missing selection', applicantNotes: 'Draft only.' }
          : content(selection(f.pair, f.leafA));
      const draft = await f.service.createApplication(f.applicant, { content: draftContent });
      await expect(
        f.service.submitApplication(f.applicant, draft.id, draft.version),
      ).rejects.toMatchObject({ code: 'unavailable' });
      expect(await f.service.getMyApplication(f.applicant, draft.id)).toMatchObject({
        status: 'draft',
        version: draft.version,
        content: draftContent,
      });
      await expectNoSubmission(draft.id);
    },
  );

  it('resolves descendant route matches on the server and rejects a mismatched unit revision', async () => {
    const f = await fixture((pair) => {
      pair.routing.rules = [
        {
          ...pair.routing.rules[0]!,
          matchUnitId: pair.geography.units[0]!.unitId,
          matchMode: 'descendants',
          scopeUnitId: pair.geography.units[0]!.unitId,
        },
      ];
    });
    const submitted = await submit(f, f.leafA);
    expect(
      (await f.service.getBureauCase(f.reviewer, await caseId(submitted.id))).assignment,
    ).toMatchObject({ scopeUnitId: f.rootA.unitId, organizationId: f.officeA });
    const forged = await f.service.createApplication(f.applicant, {
      content: content({ ...selection(f.pair, f.leafA), unitRevisionId: f.leafB.revisionId }),
    });
    await expect(
      f.service.submitApplication(f.applicant, forged.id, forged.version),
    ).rejects.toMatchObject({ code: 'conflict' });
    await expectNoSubmission(forged.id);
  });

  it('keeps release-A snapshots, office and ancestral authorization after release B reparents and reroutes the unit', async () => {
    const f = await fixture();
    const old = await submit(f, f.leafA);
    const oldCase = await caseId(old.id);
    const oldSnapshot = old.location;
    const originalAssignment = (await f.service.getBureauCase(f.reviewer, oldCase)).assignment;
    const wrongAncestor = await actor('same-office-wrong-ancestor');
    await grant(
      wrongAncestor,
      f.officeA,
      f.pair.geography.id,
      f.rootB.unitId,
      [readCapability, decideCapability],
      true,
    );
    const b = nextPair(f);
    await provisionSyntheticHotelReleasePair(client, b, environment);
    await grant(
      f.otherReviewer,
      f.officeB,
      b.geography.id,
      f.rootB.unitId,
      [readCapability, decideCapability],
      true,
    );
    expect((await f.service.getMyApplication(f.applicant, old.id)).location).toEqual(oldSnapshot);
    expect(await f.service.getBureauCase(f.reviewer, oldCase)).toMatchObject({
      location: oldSnapshot,
      submittedLocation: oldSnapshot,
      assignment: originalAssignment,
    });
    expect(
      (await f.service.listBureauCases(f.reviewer)).items.map((item) => item.caseId),
    ).toContain(oldCase);
    expect(
      (await f.service.listBureauCases(wrongAncestor)).items.map((item) => item.caseId),
    ).not.toContain(oldCase);
    for (const denied of [wrongAncestor, f.otherReviewer]) {
      await expect(f.service.getBureauCase(denied, oldCase)).rejects.toMatchObject({
        code: 'not_found',
      });
      await expect(
        f.service.decideBureauCase(denied, oldCase, {
          expectedVersion: old.version,
          decision: 'approve',
          reason: 'A new parent or office cannot authorize an old case.',
        }),
      ).rejects.toMatchObject({ code: 'not_found' });
    }
    const approved = await f.service.decideBureauCase(f.reviewer, oldCase, {
      expectedVersion: old.version,
      decision: 'approve',
      reason: 'Review under original release A coverage.',
    });
    expect(approved.bureauDecision).toMatchObject({ applicationVersion: 1, decision: 'approve' });
    const leafB = b.geography.units.find((unit) => unit.unitId === f.leafA.unitId)!;
    const freshDraft = await f.service.createApplication(f.applicant, {
      content: content(selection(b, leafB)),
    });
    const fresh = await f.service.submitApplication(f.applicant, freshDraft.id, freshDraft.version);
    expect(fresh.location).toMatchObject({
      geographyReleaseId: b.geography.id,
      hierarchy: [
        expect.objectContaining({ unitId: f.rootB.unitId }),
        expect.objectContaining({ unitId: f.leafA.unitId }),
      ],
    });
    const freshCase = await caseId(fresh.id);
    expect((await f.service.getBureauCase(f.otherReviewer, freshCase)).assignment).toMatchObject({
      organizationId: f.officeB,
      routingReleaseId: b.routing.id,
    });
    await expect(f.service.getBureauCase(f.reviewer, freshCase)).rejects.toMatchObject({
      code: 'not_found',
    });
    await assertBinding(old.id, f.pair);
    await assertBinding(fresh.id, b);
  });

  it('updates routing independently while retaining the geography and all existing case assignments', async () => {
    const f = await fixture();
    const old = await submit(f, f.leafA);
    const oldCase = await caseId(old.id);
    const routing = {
      ...f.pair.routing,
      id: `directory-routing-only-${randomUUID()}`,
      sourceEdition: 'synthetic-route-correction',
      rules: f.pair.routing.rules.map((rule) => ({
        ...rule,
        id: randomUUID(),
        organizationId: f.officeB,
      })),
    };
    await provisionSyntheticHotelRoutingRelease(client, routing, environment);
    await grant(
      f.otherReviewer,
      f.officeB,
      f.pair.geography.id,
      f.rootA.unitId,
      [readCapability, decideCapability],
      true,
    );
    expect((await f.service.listLocations(f.applicant)).directoryRelease.id).toBe(
      f.pair.geography.id,
    );
    expect(await f.service.getBureauCase(f.reviewer, oldCase)).toMatchObject({
      location: old.location,
      assignment: { organizationId: f.officeA, routingReleaseId: f.pair.routing.id },
    });
    await expect(f.service.getBureauCase(f.otherReviewer, oldCase)).rejects.toMatchObject({
      code: 'not_found',
    });
    const fresh = await submit(f, f.leafA);
    expect(
      (await f.service.getBureauCase(f.otherReviewer, await caseId(fresh.id))).assignment,
    ).toMatchObject({ organizationId: f.officeB, routingReleaseId: routing.id });
    await assertBinding(old.id, f.pair);
    await assertBinding(fresh.id, { ...f.pair, routing });
  });

  it.each(['membership', 'grant'] as const)(
    'uses current %s revocation even for historical release-A cases',
    async (revocation) => {
      const f = await fixture();
      const submitted = await submit(f, f.leafA);
      const id = await caseId(submitted.id);
      await provisionSyntheticHotelReleasePair(client, nextPair(f), environment);
      expect(await f.service.getBureauCase(f.reviewer, id)).toMatchObject({ caseId: id });
      const profile = await profileId(f.reviewer);
      if (revocation === 'membership')
        await client.unsafe('UPDATE memberships SET active = false WHERE user_profile_id = $1', [
          profile,
        ]);
      else
        await client.unsafe(
          'UPDATE access_grants SET active = false WHERE membership_id IN (SELECT id FROM memberships WHERE user_profile_id = $1)',
          [profile],
        );
      await expect(f.service.getBureauCase(f.reviewer, id)).rejects.toMatchObject({
        code: 'not_found',
      });
      await expect(
        f.service.decideBureauCase(f.reviewer, id, {
          expectedVersion: submitted.version,
          decision: 'approve',
          reason: 'Revoked assignment.',
        }),
      ).rejects.toMatchObject({ code: 'not_found' });
      await expect(f.service.listBureauCases(f.reviewer)).rejects.toMatchObject({
        code: 'forbidden',
      });
      const [decisions] = await client.unsafe(
        'SELECT count(*)::int AS count FROM hotel_bureau_decisions WHERE case_id = $1',
        [id],
      );
      expect(decisions?.count).toBe(0);
    },
  );

  it.each(['read-first', 'decision-first'] as const)(
    'never combines capability and scope from different grants: %s',
    async (order) => {
      const f = await fixture();
      const submitted = await submit(f, f.leafA);
      const id = await caseId(submitted.id);
      const mixed = await actor('mixed-grant');
      const entries = [
        { capability: readCapability, unit: f.rootA.unitId },
        { capability: decideCapability, unit: f.rootB.unitId },
      ];
      if (order === 'decision-first') entries.reverse();
      for (const entry of entries)
        await grant(mixed, f.officeA, f.pair.geography.id, entry.unit, [entry.capability], true);
      expect(await f.service.getBureauCase(mixed, id)).toMatchObject({ caseId: id });
      await expect(
        f.service.decideBureauCase(mixed, id, {
          expectedVersion: submitted.version,
          decision: 'approve',
          reason: 'Two incomplete grants.',
        }),
      ).rejects.toMatchObject({ code: 'not_found' });
      const [before] = await client.unsafe(
        'SELECT count(*)::int AS count FROM hotel_bureau_decisions WHERE case_id = $1',
        [id],
      );
      expect(before?.count).toBe(0);
      await grant(mixed, f.officeA, f.pair.geography.id, f.rootA.unitId, [decideCapability], true);
      expect(
        await f.service.decideBureauCase(mixed, id, {
          expectedVersion: submitted.version,
          decision: 'approve',
          reason: 'One complete grant now exists.',
        }),
      ).toMatchObject({ status: 'approved' });
    },
  );

  it('does not treat a scope for the same stable unit in a different release as authority', async () => {
    const f = await fixture();
    const submitted = await submit(f, f.leafA);
    const b = nextPair(f);
    await provisionSyntheticHotelReleasePair(client, b, environment);
    const wrongRelease = await actor('wrong-release');
    await grant(
      wrongRelease,
      f.officeA,
      b.geography.id,
      f.leafA.unitId,
      [readCapability, decideCapability],
      false,
    );
    const id = await caseId(submitted.id);
    await expect(f.service.getBureauCase(wrongRelease, id)).rejects.toMatchObject({
      code: 'not_found',
    });
    await expect(
      f.service.decideBureauCase(wrongRelease, id, {
        expectedVersion: submitted.version,
        decision: 'approve',
        reason: 'Wrong release.',
      }),
    ).rejects.toMatchObject({ code: 'not_found' });
  });

  it.each(['name', 'parent', 'identifier', 'geography', 'routing', 'rule', 'insert-name'] as const)(
    'freezes activated release contents: %s',
    async (mutation) => {
      const f = await fixture();
      const statements: Record<typeof mutation, [string, string[]]> = {
        name: [
          'UPDATE hotel_geography_names SET value = $2 WHERE unit_revision_id = $1',
          [f.leafA.revisionId, 'Forged label'],
        ],
        parent: [
          'UPDATE hotel_geography_unit_revisions SET parent_revision_id = $2 WHERE id = $1',
          [f.leafA.revisionId, f.rootB.revisionId],
        ],
        identifier: [
          'UPDATE hotel_geography_external_identifiers SET source_identifier = $2 WHERE unit_revision_id = $1',
          [f.leafA.revisionId, 'forged'],
        ],
        geography: [
          'UPDATE hotel_geography_releases SET source_edition = $2 WHERE id = $1',
          [f.pair.geography.id, 'forged'],
        ],
        routing: [
          'UPDATE hotel_routing_releases SET provenance = $2 WHERE id = $1',
          [f.pair.routing.id, 'forged'],
        ],
        rule: [
          'UPDATE hotel_routing_rules SET bureau_organization_id = $2 WHERE id = $1',
          [f.pair.routing.rules[0]!.id, f.officeB],
        ],
        'insert-name': [
          "INSERT INTO hotel_geography_names (geography_release_id, unit_revision_id, value, normalized_value, language_tag, script, name_kind) VALUES ($1, $2, 'Injected', 'injected', 'en', 'Latn', 'alias')",
          [f.pair.geography.id, f.leafA.revisionId],
        ],
      };
      const [sql, parameters] = statements[mutation];
      await expect(client.unsafe(sql, parameters)).rejects.toThrow(/immutable/i);
      expect(
        (await f.service.listLocations(f.applicant, { query: 'Synthetic locality' })).items,
      ).toHaveLength(2);
    },
  );

  it('rejects forged office, scope and hierarchy at the database boundary and mismatched case inserts', async () => {
    const f = await fixture();
    const submitted = await submit(f, f.leafA);
    for (const forged of ['office', 'scope', 'hierarchy'] as const) {
      const [source] = await client.unsafe(
        'SELECT * FROM hotel_application_versions WHERE id = $1',
        [submitted.currentVersionId!],
      );
      expect(source).toBeDefined();
      const snapshot =
        forged === 'hierarchy'
          ? { ...source!.submitted_location_snapshot, hierarchy: [] }
          : source!.submitted_location_snapshot;
      await expect(
        client.unsafe(
          `INSERT INTO hotel_application_versions (application_id, version_number, content, submitted_by_profile_id,
         bureau_organization_id, geography_release_id, location_revision_id, submitted_location_snapshot,
         routing_release_id, routing_rule_id, resolved_scope_unit_id)
         VALUES ($1, 2, $2::text::jsonb, $3, $4, $5, $6, $7::text::jsonb, $8, $9, $10)`,
          [
            submitted.id,
            JSON.stringify(source!.content),
            source!.submitted_by_profile_id,
            forged === 'office' ? f.officeB : f.officeA,
            f.pair.geography.id,
            f.leafA.revisionId,
            JSON.stringify(snapshot),
            f.pair.routing.id,
            f.pair.routing.rules[0]!.id,
            forged === 'scope' ? f.rootB.unitId : f.leafA.unitId,
          ],
        ),
      ).rejects.toThrow(/does not match|scope|assignment/i);
    }
    const originalCase = await caseId(submitted.id);
    await expect(
      client.begin(async (tx) => {
        await tx.unsafe('DELETE FROM hotel_bureau_cases WHERE id = $1', [originalCase]);
        await tx.unsafe(
          `INSERT INTO hotel_bureau_cases (application_id, application_version_id, bureau_organization_id,
         geography_release_id, location_revision_id, routing_release_id, routing_rule_id, scope_geography_unit_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [
            submitted.id,
            submitted.currentVersionId!,
            f.officeB,
            f.pair.geography.id,
            f.leafA.revisionId,
            f.pair.routing.id,
            f.pair.routing.rules[0]!.id,
            f.leafA.unitId,
          ],
        );
      }),
    ).rejects.toThrow(/does not match/i);
    expect(await f.service.getBureauCase(f.reviewer, originalCase)).toMatchObject({
      caseId: originalCase,
    });
  });

  it('rejects incompatible active pairs and requires explicit continuity for reused stable IDs', async () => {
    const f = await fixture();
    const b = nextPair(f);
    await expect(
      provisionSyntheticHotelReleasePair(client, { ...b, continuity: [] }, environment),
    ).rejects.toThrow(/continuity/i);
    const [absent] = await client.unsafe(
      'SELECT count(*)::int AS count FROM hotel_geography_releases WHERE id = $1',
      [b.geography.id],
    );
    expect(absent?.count).toBe(0);
    await provisionSyntheticHotelReleasePair(client, b, environment);
    await expect(
      client.unsafe(
        'UPDATE hotel_active_release_pair SET routing_release_id = $1 WHERE singleton = 1',
        [f.pair.routing.id],
      ),
    ).rejects.toThrow(/compatible/i);
    const [active] = await client.unsafe(
      'SELECT geography_release_id, routing_release_id FROM hotel_active_release_pair WHERE singleton = 1',
    );
    expect(active).toEqual({
      geography_release_id: b.geography.id,
      routing_release_id: b.routing.id,
    });
  });

  it('blocks activation until a submitting transaction commits, then uses only release B for new submissions', async () => {
    const f = await fixture();
    const draft = await f.service.createApplication(f.applicant, {
      content: content(selection(f.pair, f.leafA)),
    });
    const b = nextPair(f);
    const activation = postgres(databaseUrl!, { max: 1 });
    try {
      await activation.unsafe("SET lock_timeout = '150ms'");
      await new PostgresHotelOnboardingStore(client).transaction(async (tx) => {
        const pending = await tx.submitApplication(f.applicant, draft.id, draft.version);
        expect(pending?.location).toMatchObject({ geographyReleaseId: f.pair.geography.id });
        await expect(
          provisionSyntheticHotelReleasePair(activation, b, environment),
        ).rejects.toMatchObject({ code: '55P03' });
      });
    } finally {
      await activation.end({ timeout: 5 });
    }
    await assertBinding(draft.id, f.pair);
    await provisionSyntheticHotelReleasePair(client, b, environment);
    const newUnit = b.geography.units.find((unit) => unit.unitId === f.leafA.unitId)!;
    const nextDraft = await f.service.createApplication(f.applicant, {
      content: content(selection(b, newUnit)),
    });
    await f.service.submitApplication(f.applicant, nextDraft.id, nextDraft.version);
    await assertBinding(nextDraft.id, b);
  });

  it('never stores mixed geography/routing references when activation races submission', async () => {
    const f = await fixture();
    const draft = await f.service.createApplication(f.applicant, {
      content: content(selection(f.pair, f.leafA)),
    });
    const b = nextPair(f);
    const results = await Promise.allSettled([
      f.service.submitApplication(f.applicant, draft.id, draft.version),
      provisionSyntheticHotelReleasePair(client, b, environment),
    ]);
    expect(results[1]!.status).toBe('fulfilled');
    const submission = results[0]!;
    if (submission.status === 'fulfilled') {
      await assertBinding(draft.id, f.pair);
    } else {
      expect(submission.reason).toMatchObject({ code: 'conflict' });
      await expectNoSubmission(draft.id);
      expect(await f.service.getMyApplication(f.applicant, draft.id)).toMatchObject({
        status: 'draft',
        version: draft.version,
      });
    }
    const [mixed] = await client.unsafe(
      `SELECT count(*)::int AS count FROM hotel_application_versions v
       JOIN hotel_routing_releases r ON r.id = v.routing_release_id
       WHERE v.application_id = $1 AND v.geography_release_id IS DISTINCT FROM r.geography_release_id`,
      [draft.id],
    );
    expect(mixed?.count).toBe(0);
  });

  it('rejects new legacy-style versions rather than inventing missing historical release references', async () => {
    const f = await fixture();
    const draft = await f.service.createApplication(f.applicant, {
      content: {
        claimedHotelName: 'Synthetic legacy draft',
        applicantNotes: 'No location supplied.',
      },
    });
    await expect(
      client.unsafe(
        `INSERT INTO hotel_application_versions (application_id, version_number, content, submitted_by_profile_id)
       VALUES ($1, 1, $2::text::jsonb, $3)`,
        [draft.id, JSON.stringify(draft.content), await profileId(f.applicant)],
      ),
    ).rejects.toThrow(/require a versioned location/i);
    await expectNoSubmission(draft.id);
    expect(await f.service.getMyApplication(f.applicant, draft.id)).toMatchObject({
      content: draft.content,
      status: 'draft',
      locationState: 'unselected',
    });
  });

  it('preserves legacy-shaped synthetic history with exact grants and never infers historical ancestry', async () => {
    const f = await fixture();
    const legacyParent = `directory-legacy-parent-${randomUUID()}`;
    const legacyUnit = `directory-legacy-location-${randomUUID()}`;
    await client.unsafe(
      `INSERT INTO administrative_units (id, display_name, level, parent_id, is_synthetic)
      VALUES ($1, 'Synthetic legacy parent', 'regional', NULL, true),
             ($2, 'Synthetic legacy place', 'woreda', $1, true)`,
      [legacyParent, legacyUnit],
    );
    const legacy = {
      claimedHotelName: 'Synthetic historical lodging',
      applicantNotes: 'Legacy compatibility fixture.',
    };
    const draft = await f.service.createApplication(f.applicant, { content: legacy });
    const snapshot = {
      id: legacyUnit,
      label: 'Synthetic legacy place',
      parentId: legacyParent,
      hierarchy: [
        { id: legacyParent, label: 'Synthetic legacy parent', parentId: null },
        { id: legacyUnit, label: 'Synthetic legacy place', parentId: legacyParent },
      ],
    };
    // Only this guarded disposable fixture simulates a row created before 0005.
    // ALTER TABLE is transactional; the insert guard is reenabled before commit.
    await client.begin(async (tx) => {
      await tx.unsafe(
        'ALTER TABLE hotel_application_versions DISABLE TRIGGER hotel_versioned_submission_guard',
      );
      const [version] = await tx.unsafe<{ id: string }[]>(
        `INSERT INTO hotel_application_versions (application_id, version_number, content, submitted_by_profile_id,
         location_unit_id, location_snapshot, bureau_organization_id, scope_unit_id)
         VALUES ($1, 1, $2::text::jsonb, $3, $4, $5::text::jsonb, $6, $4) RETURNING id`,
        [
          draft.id,
          JSON.stringify({ ...legacy, administrativeUnitId: legacyUnit }),
          await profileId(f.applicant),
          legacyUnit,
          JSON.stringify(snapshot),
          f.officeA,
        ],
      );
      if (!version) throw new Error('Synthetic historical fixture insert returned no row.');
      await tx.unsafe(
        'ALTER TABLE hotel_application_versions ENABLE TRIGGER hotel_versioned_submission_guard',
      );
      await tx.unsafe(
        `INSERT INTO hotel_bureau_cases (application_id, application_version_id, bureau_organization_id, scope_unit_id)
        VALUES ($1, $2, $3, $4)`,
        [draft.id, version.id, f.officeA, legacyUnit],
      );
      await tx.unsafe(
        `UPDATE hotel_applications SET status = 'submitted', current_submitted_version_id = $2,
        current_version_number = 1, version = version + 1 WHERE id = $1`,
        [draft.id, version.id],
      );
    });
    const exact = await actor('legacy-exact-reviewer');
    const ancestor = await actor('legacy-ancestor-reviewer');
    for (const [identity, scope, descendants] of [
      [exact, legacyUnit, false],
      [ancestor, legacyParent, true],
    ] as const) {
      const [member] = await client.unsafe<{ id: string }[]>(
        "INSERT INTO memberships (user_profile_id, organization_id, label) VALUES ($1, $2, 'Synthetic legacy reviewer') RETURNING id",
        [await profileId(identity), f.officeA],
      );
      if (!member) throw new Error('Synthetic legacy membership was not created.');
      for (const capability of [readCapability, decideCapability]) {
        const [access] = await client.unsafe<{ id: string }[]>(
          `INSERT INTO access_grants (membership_id, capability, organization_id, demo_only, production_decision_enabled)
          VALUES ($1, $2, $3, true, false) RETURNING id`,
          [member.id, capability, f.officeA],
        );
        if (!access) throw new Error('Synthetic legacy grant was not created.');
        await client.unsafe(
          'INSERT INTO grant_scopes (grant_id, administrative_unit_id, include_descendants) VALUES ($1, $2, $3)',
          [access.id, scope, descendants],
        );
      }
    }
    await provisionSyntheticHotelReleasePair(client, nextPair(f), environment);
    const id = await caseId(draft.id);
    expect(await f.service.getBureauCase(exact, id)).toMatchObject({
      location: snapshot,
      locationState: 'legacy',
      assignment: null,
    });
    expect(
      (await f.service.listBureauCases(ancestor)).items.map((item) => item.caseId),
    ).not.toContain(id);
    await expect(f.service.getBureauCase(ancestor, id)).rejects.toMatchObject({
      code: 'not_found',
    });
    await expect(
      f.service.decideBureauCase(ancestor, id, {
        expectedVersion: draft.version + 1,
        decision: 'approve',
        reason: 'Current ancestry is not historical evidence.',
      }),
    ).rejects.toMatchObject({ code: 'not_found' });
    const [preserved] = await client.unsafe(
      `SELECT geography_release_id, routing_release_id, location_snapshot,
      location_unit_id FROM hotel_application_versions WHERE application_id = $1`,
      [draft.id],
    );
    expect(preserved).toEqual({
      geography_release_id: null,
      routing_release_id: null,
      location_snapshot: snapshot,
      location_unit_id: legacyUnit,
    });
    const [guard] = await client.unsafe(
      "SELECT tgenabled FROM pg_trigger WHERE tgname = 'hotel_versioned_submission_guard' AND NOT tgisinternal",
    );
    expect(guard?.tgenabled).toBe('O');
  });
});

type MutablePair = Omit<SyntheticHotelReleasePairImport, 'routing'> & {
  routing: Omit<SyntheticHotelReleasePairImport['routing'], 'rules'> & {
    rules: SyntheticHotelReleasePairImport['routing']['rules'][number][];
  };
};

async function fixture(configure?: (pair: MutablePair) => void) {
  const suffix = randomUUID();
  const officeA = `directory-office-a-${suffix}`;
  const officeB = `directory-office-b-${suffix}`;
  const oldUnit = `directory-org-scope-${suffix}`;
  await client.unsafe(
    "INSERT INTO administrative_units (id, display_name, level, is_synthetic) VALUES ($1, 'Synthetic organization scope', 'woreda', true)",
    [oldUnit],
  );
  for (const id of [officeA, officeB])
    await client.unsafe(
      `INSERT INTO organizations (id, display_name, organization_type, level, administrative_unit_id, is_synthetic)
     VALUES ($1, 'Synthetic directory review office', 'administrative', 'woreda', $2, true)`,
      [id, oldUnit],
    );
  const rootA = unit(`directory-root-a-${suffix}`, 'Synthetic root A', null, 'demo-area');
  const rootB = unit(`directory-root-b-${suffix}`, 'Synthetic root B', null, 'demo-city');
  const branch = unit(
    `directory-branch-${suffix}`,
    'Synthetic branch',
    rootA.unitId,
    'demo-branch',
  );
  const leafA = unit(
    `directory-locality-a-${suffix}`,
    'Synthetic locality',
    branch.unitId,
    'demo-locality',
  );
  const leafB = unit(
    `directory-locality-b-${suffix}`,
    'Synthetic locality',
    rootB.unitId,
    'demo-neighborhood',
  );
  leafA.names = [
    ...leafA.names,
    { value: 'Localite synthetique A', languageTag: 'fr', script: 'Latn', kind: 'display' },
    { value: 'Alias synthetique', languageTag: 'fr', script: 'Latn', kind: 'alias' },
    { value: 'Alias second', languageTag: 'en', script: 'Latn', kind: 'alias' },
    { value: 'Synthetic 100%_literal', languageTag: 'en', script: 'Latn', kind: 'alias' },
  ];
  leafA.externalIdentifiers = [
    { sourceNamespace: 'urn:synthetic:source-one', sourceIdentifier: '001' },
    { sourceNamespace: 'urn:synthetic:source-two', sourceIdentifier: '001' },
  ];
  const geographyId = `directory-geography-a-${suffix}`;
  const pair: MutablePair = {
    geography: {
      id: geographyId,
      sourceName: 'Synthetic directory fixture',
      sourceEdition: 'fixture-A',
      sourceReference: 'urn:ethio-tour:synthetic-tests',
      synthetic: true,
      units: [rootA, rootB, branch, leafA, leafB],
    },
    routing: {
      id: `directory-routing-a-${suffix}`,
      geographyReleaseId: geographyId,
      sourceName: 'Synthetic routing fixture',
      sourceEdition: 'fixture-A',
      provenance: 'Synthetic test routing only.',
      synthetic: true,
      rules: [
        {
          id: randomUUID(),
          matchUnitId: leafA.unitId,
          matchMode: 'exact',
          organizationId: officeA,
          scopeUnitId: leafA.unitId,
          enabled: true,
        },
        {
          id: randomUUID(),
          matchUnitId: leafB.unitId,
          matchMode: 'exact',
          organizationId: officeB,
          scopeUnitId: leafB.unitId,
          enabled: true,
        },
      ],
    },
  };
  configure?.(pair);
  await provisionSyntheticHotelReleasePair(client, pair, environment);
  const applicant = await actor('applicant');
  const reviewer = await actor('reviewer-a');
  const otherReviewer = await actor('reviewer-b');
  await grant(
    reviewer,
    officeA,
    pair.geography.id,
    rootA.unitId,
    [readCapability, decideCapability],
    true,
  );
  await grant(
    otherReviewer,
    officeB,
    pair.geography.id,
    rootB.unitId,
    [readCapability, decideCapability],
    true,
  );
  const service = new HotelOnboardingService(new PostgresHotelOnboardingStore(client), {
    enabled: true,
    production: false,
    administratorOrganizationId: null,
  });
  return {
    pair,
    rootA,
    rootB,
    branch,
    leafA,
    leafB,
    officeA,
    officeB,
    applicant,
    reviewer,
    otherReviewer,
    service,
  };
}

function nextPair(f: Awaited<ReturnType<typeof fixture>>): SyntheticHotelReleasePairImport {
  const id = `directory-geography-b-${randomUUID()}`;
  const units = f.pair.geography.units.map((old) => ({
    ...old,
    revisionId: randomUUID(),
    parentUnitId: old.unitId === f.leafA.unitId ? f.rootB.unitId : old.parentUnitId,
  }));
  return {
    geography: { ...f.pair.geography, id, sourceEdition: 'fixture-B', units },
    routing: {
      ...f.pair.routing,
      id: `directory-routing-b-${randomUUID()}`,
      geographyReleaseId: id,
      sourceEdition: 'fixture-B',
      rules: f.pair.routing.rules.map((rule) => ({
        ...rule,
        id: randomUUID(),
        organizationId: f.officeB,
      })),
    },
    continuity: units.map((target, index) => ({
      fromReleaseId: f.pair.geography.id,
      fromUnitRevisionId: f.pair.geography.units[index]!.revisionId,
      toUnitRevisionId: target.revisionId,
      relation: 'same_entity',
      confidence: 'asserted',
      provenance: 'Synthetic test continuity only.',
    })),
  };
}

function unit(
  unitId: string,
  label: string,
  parentUnitId: string | null,
  unitType: string,
): HotelGeographyUnitInput {
  return {
    unitId,
    revisionId: randomUUID(),
    unitType,
    parentUnitId,
    names: [{ value: label, languageTag: 'en', script: 'Latn', kind: 'display' }],
  };
}

function selection(
  pair: SyntheticHotelReleasePairImport,
  location: HotelGeographyUnitInput,
): HotelLocationSelection {
  return {
    geographyReleaseId: pair.geography.id,
    unitId: location.unitId,
    unitRevisionId: location.revisionId,
  };
}

function content(locationSelection: HotelLocationSelection): HotelApplicationContent {
  return contentWithName(`Synthetic directory lodging ${randomUUID()}`, locationSelection);
}

function contentWithName(
  claimedHotelName: string,
  locationSelection: HotelLocationSelection,
): HotelApplicationContent {
  return { claimedHotelName, applicantNotes: 'Synthetic-only fixture.', locationSelection };
}

async function actor(label: string): Promise<RegistryActor> {
  const identity = { issuer, subjectId: `${label}-${randomUUID()}` };
  await client.unsafe(
    'INSERT INTO user_profiles (external_issuer, external_subject_id) VALUES ($1, $2)',
    [issuer, identity.subjectId],
  );
  return identity;
}

async function profileId(identity: RegistryActor): Promise<string> {
  const [row] = await client.unsafe<{ id: string }[]>(
    'SELECT id FROM user_profiles WHERE external_issuer = $1 AND external_subject_id = $2',
    [identity.issuer, identity.subjectId],
  );
  if (!row) throw new Error('Synthetic identity fixture was not created.');
  return row.id;
}

async function grant(
  identity: RegistryActor,
  organization: string,
  releaseId: string,
  unitId: string,
  capabilities: string[],
  descendants: boolean,
) {
  const [membership] = await client.unsafe<{ id: string }[]>(
    `INSERT INTO memberships (user_profile_id, organization_id, label) VALUES ($1, $2, 'Synthetic directory reviewer')
     ON CONFLICT (user_profile_id, organization_id) DO UPDATE SET label = EXCLUDED.label RETURNING id`,
    [await profileId(identity), organization],
  );
  if (!membership) throw new Error('Synthetic reviewer membership was not created.');
  for (const capability of capabilities) {
    const [access] = await client.unsafe<{ id: string }[]>(
      `INSERT INTO access_grants (membership_id, capability, organization_id, demo_only, production_decision_enabled)
       VALUES ($1, $2, $3, true, false) ON CONFLICT (membership_id, capability, organization_id)
       DO UPDATE SET active = true RETURNING id`,
      [membership.id, capability, organization],
    );
    if (!access) throw new Error('Synthetic reviewer grant was not created.');
    await client.unsafe(
      `INSERT INTO grant_scopes (grant_id, administrative_unit_id, hotel_geography_release_id, hotel_geography_unit_id, include_descendants)
      VALUES ($1, NULL, $2, $3, $4)`,
      [access.id, releaseId, unitId, descendants],
    );
  }
}

async function submit(f: Awaited<ReturnType<typeof fixture>>, location: HotelGeographyUnitInput) {
  const draft = await f.service.createApplication(f.applicant, {
    content: content(selection(f.pair, location)),
  });
  return f.service.submitApplication(f.applicant, draft.id, draft.version);
}

async function caseId(application: string): Promise<string> {
  const [row] = await client.unsafe<{ id: string }[]>(
    'SELECT id FROM hotel_bureau_cases WHERE application_id = $1 ORDER BY created_at DESC, id DESC LIMIT 1',
    [application],
  );
  if (!row) throw new Error('Synthetic submitted case is missing.');
  return row.id;
}

async function expectNoSubmission(application: string) {
  const [counts] = await client.unsafe(
    `SELECT (SELECT count(*)::int FROM hotel_application_versions WHERE application_id = $1) AS versions,
     (SELECT count(*)::int FROM hotel_bureau_cases WHERE application_id = $1) AS cases,
     (SELECT count(*)::int FROM audit_events WHERE target_resource_id = $1 AND action = 'hotel.application.submitted' AND outcome = 'allowed') AS success_audits`,
    [application],
  );
  expect(counts).toEqual({ versions: 0, cases: 0, success_audits: 0 });
}

async function assertBinding(application: string, pair: SyntheticHotelReleasePairImport) {
  const [row] = await client.unsafe(
    `SELECT v.geography_release_id, v.routing_release_id, c.geography_release_id AS case_geography,
     c.routing_release_id AS case_routing, c.routing_rule_id, c.bureau_organization_id,
     (v.submitted_location_snapshot->>'geographyReleaseId') AS snapshot_release,
     (v.geography_release_id = r.geography_release_id AND c.routing_rule_id = v.routing_rule_id
       AND c.location_revision_id = v.location_revision_id AND c.scope_geography_unit_id = v.resolved_scope_unit_id
       AND c.bureau_organization_id = v.bureau_organization_id) AS consistent
     FROM hotel_application_versions v JOIN hotel_bureau_cases c ON c.application_version_id = v.id
     JOIN hotel_routing_releases r ON r.id = v.routing_release_id WHERE v.application_id = $1`,
    [application],
  );
  expect(row).toMatchObject({
    geography_release_id: pair.geography.id,
    routing_release_id: pair.routing.id,
    case_geography: pair.geography.id,
    case_routing: pair.routing.id,
    snapshot_release: pair.geography.id,
    consistent: true,
  });
  expect(pair.routing.rules.map((rule) => rule.id)).toContain(row!.routing_rule_id);
}
