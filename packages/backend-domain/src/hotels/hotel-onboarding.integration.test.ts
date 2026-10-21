import { randomUUID } from 'node:crypto';

import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { isDisposableHotelTestDatabase } from '@ethio-tour/db/testing/disposable-database-target';
import { createDatabase, provisionSyntheticHotelReleasePair } from '@ethio-tour/db';
import type { HotelLocationSelection } from '@ethio-tour/contracts';

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
const issuer = 'https://identity.example.test/realms/synthetic-hotel';
let client: postgres.Sql;
let suiteLock: postgres.Sql;
let service: HotelOnboardingService;
let selectedLocation: HotelLocationSelection;

beforeAll(async () => {
  if (!safeDatabase || !databaseUrl) return;
  // Both suites activate the singleton pair; serialize them using a dedicated session.
  suiteLock = postgres(databaseUrl, { max: 1 });
  await suiteLock.unsafe("SET lock_timeout = '90s'");
  await suiteLock.unsafe('SELECT pg_advisory_lock(20261021, 71501)');
  client = postgres(databaseUrl, { max: 8 });
  const [migration] = await client.unsafe<{ exists: boolean }[]>(
    `SELECT to_regclass('public.hotel_active_release_pair') IS NOT NULL
     AND EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'hotel_versioned_submission_guard' AND NOT tgisinternal)
     AND EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'hotel_bureau_case_binding_immutable' AND NOT tgisinternal) AS exists`,
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

suite('synthetic hotel onboarding PostgreSQL integration', () => {
  it.each(['raw', 'api-factory'])(
    'stores object JSONB, immutable release bindings and denial audits with %s',
    async (driver) => {
      const f = await fixture();
      const apiClient = driver === 'api-factory' ? createDatabase(databaseUrl!).client : null;
      const scoped = apiClient
        ? new HotelOnboardingService(new PostgresHotelOnboardingStore(apiClient), f.settings)
        : service;
      try {
        const draft = await scoped.createApplication(f.applicant, { content: content() });
        const updated = await scoped.updateDraft(f.applicant, draft.id, draft.version, content());
        const submitted = await scoped.submitApplication(f.applicant, draft.id, updated.version);
        const [stored] = await client.unsafe(
          `SELECT jsonb_typeof(a.draft_content) AS draft_type, jsonb_typeof(v.content) AS content_type,
         jsonb_typeof(v.submitted_location_snapshot) AS snapshot_type,
         v.content->'locationSelection'->>'unitId' AS content_id,
         v.submitted_location_snapshot->>'unitId' AS snapshot_id,
         v.geography_release_id, v.location_revision_id, v.routing_release_id, v.routing_rule_id,
         v.resolved_scope_unit_id, v.scope_unit_id, v.location_unit_id, v.bureau_organization_id
         FROM hotel_applications a JOIN hotel_application_versions v ON v.id = a.current_submitted_version_id WHERE a.id = $1`,
          [draft.id],
        );
        expect(stored).toEqual({
          draft_type: 'object',
          content_type: 'object',
          snapshot_type: 'object',
          content_id: f.selection.unitId,
          snapshot_id: f.selection.unitId,
          geography_release_id: f.selection.geographyReleaseId,
          location_revision_id: f.selection.unitRevisionId,
          routing_release_id: f.routingReleaseId,
          routing_rule_id: f.ruleId,
          resolved_scope_unit_id: f.selection.unitId,
          scope_unit_id: null,
          location_unit_id: null,
          bureau_organization_id: f.bureauOrganizationId,
        });
        expect(submitted).toMatchObject({
          location: f.selection,
          locationState: 'submitted_snapshot',
        });
        const audits = await client.unsafe(
          `SELECT jsonb_typeof(details) AS details_type FROM audit_events WHERE target_resource_id = $1
         AND action IN ('hotel.application.created', 'hotel.application.draft_updated', 'hotel.application.submitted')`,
          [draft.id],
        );
        expect(audits).toHaveLength(3);
        expect(audits.every((row) => row.details_type === 'object')).toBe(true);
        await expect(scoped.listBureauCases(f.applicant)).rejects.toMatchObject({
          code: 'forbidden',
        });
        const [denial] = await client.unsafe(
          `SELECT jsonb_typeof(details) AS details_type, outcome FROM audit_events WHERE actor_subject_id = $1
         AND action = 'hotel.application.bureau.queue' ORDER BY created_at DESC LIMIT 1`,
          [f.applicant.subjectId],
        );
        expect(denial).toEqual({ details_type: 'object', outcome: 'denied' });
      } finally {
        if (apiClient) await apiClient.end({ timeout: 5 });
      }
    },
  );

  it.each(['submit', 'update-then-submit'])(
    'reads double-encoded private drafts and stores release-bound object JSON on %s',
    async (flow) => {
      const f = await fixture();
      const draftContent = content();
      const draft = await service.createApplication(f.applicant, { content: draftContent });
      await client.unsafe('UPDATE hotel_applications SET draft_content = $2::jsonb WHERE id = $1', [
        draft.id,
        client.json(JSON.stringify(draftContent)),
      ]);
      expect((await service.getMyApplication(f.applicant, draft.id)).content).toEqual(draftContent);
      const ready =
        flow === 'submit'
          ? draft
          : await service.updateDraft(f.applicant, draft.id, draft.version, {
              ...draftContent,
              applicantNotes: 'Updated legacy encoding.',
            });
      expect(
        (await service.submitApplication(f.applicant, draft.id, ready.version)).location,
      ).toMatchObject(f.selection);
      const [stored] = await client.unsafe(
        `SELECT jsonb_typeof(a.draft_content) AS draft_type, jsonb_typeof(v.content) AS content_type,
       jsonb_typeof(v.submitted_location_snapshot) AS snapshot_type FROM hotel_applications a
       JOIN hotel_application_versions v ON v.id = a.current_submitted_version_id WHERE a.id = $1`,
        [draft.id],
      );
      expect(stored).toEqual({
        draft_type: flow === 'submit' ? 'string' : 'object',
        content_type: 'object',
        snapshot_type: 'object',
      });
    },
  );

  it('keeps applicant drafts private without membership, grants or workspace admission', async () => {
    const f = await fixture();
    const draft = await service.createApplication(f.applicant, { content: content() });
    expect(draft).toMatchObject({
      status: 'draft',
      admissionStatus: 'not_eligible',
      workspaceAccess: 'not_admitted',
    });
    const [counts] = await client.unsafe(
      `SELECT (SELECT count(*)::int FROM memberships WHERE user_profile_id = $1) AS memberships,
       (SELECT count(*)::int FROM access_grants g JOIN memberships m ON m.id = g.membership_id WHERE m.user_profile_id = $1) AS grants`,
      [f.applicantProfileId],
    );
    expect(counts).toEqual({ memberships: 0, grants: 0 });
    await expect(service.getMyApplication(f.other, draft.id)).rejects.toMatchObject({
      code: 'not_found',
    });
    await expect(
      service.updateDraft(f.other, draft.id, draft.version, content()),
    ).rejects.toMatchObject({ code: 'not_found' });
    await expect(service.submitApplication(f.other, draft.id, draft.version)).rejects.toMatchObject(
      { code: 'not_found' },
    );
    await expect(service.getProviderWorkspace(f.applicant, draft.id)).rejects.toMatchObject({
      code: 'not_found',
    });
  });

  it('fails closed on an issuer alias collision without transferring ownership or creating a canonical profile', async () => {
    await fixture();
    const subjectId = `alias-collision-${randomUUID()}`;
    const alias = 'http://keycloak:8080/realms/synthetic-hotel';
    await client.unsafe(
      'INSERT INTO user_profiles (external_issuer, external_subject_id) VALUES ($1, $2)',
      [alias, subjectId],
    );
    await expect(
      service.createApplication(
        { issuer, issuerAliases: [alias], subjectId },
        { content: content() },
      ),
    ).rejects.toMatchObject({ code: 'conflict', reason: expect.stringContaining('collides') });
    const [counts] = await client.unsafe(
      `SELECT (SELECT count(*)::int FROM user_profiles WHERE external_issuer = $1 AND external_subject_id = $2) AS profiles,
       (SELECT count(*)::int FROM hotel_applications a JOIN user_profiles p ON p.id = a.applicant_profile_id WHERE p.external_subject_id = $2) AS applications`,
      [issuer, subjectId],
    );
    expect(counts).toEqual({ profiles: 0, applications: 0 });
  });

  it('uses one canonical profile for an explicitly accepted alias when no collision exists', async () => {
    await fixture();
    const actor = { issuer, subjectId: `canonical-alias-${randomUUID()}` };
    const draft = await service.createApplication(actor, { content: content() });
    const owned = await service.listMyApplications({
      ...actor,
      issuerAliases: ['http://keycloak:8080/realms/synthetic-hotel'],
    });
    expect(owned.items.map((row) => row.id)).toContain(draft.id);
    const [count] = await client.unsafe(
      'SELECT count(*)::int AS count FROM user_profiles WHERE external_subject_id = $1',
      [actor.subjectId],
    );
    expect(count?.count).toBe(1);
  });

  it('isolates office queues and makes inaccessible reads/decisions match nonexistent cases', async () => {
    const f = await fixture();
    const a = await submit(f.applicant);
    const b = await submit(f.other, f.otherSelection);
    const caseA = await caseId(a.id);
    const caseB = await caseId(b.id);
    expect((await service.listBureauCases(f.reviewer)).items.map((row) => row.caseId)).toEqual([
      caseA,
    ]);
    expect((await service.listBureauCases(f.otherReviewer)).items.map((row) => row.caseId)).toEqual(
      [caseB],
    );
    await expect(service.getBureauCase(f.reviewer, caseB)).rejects.toMatchObject({
      code: 'not_found',
    });
    for (const id of [caseA, randomUUID()]) {
      await expect(service.getBureauCase(f.otherReviewer, id)).rejects.toMatchObject({
        code: 'not_found',
      });
      await expect(
        service.decideBureauCase(f.otherReviewer, id, {
          expectedVersion: a.version,
          decision: 'approve',
          reason: 'Wrong-office probe.',
        }),
      ).rejects.toMatchObject({ code: 'not_found' });
    }
    expect((await service.getBureauCase(f.reviewer, caseA)).assignment).toMatchObject({
      organizationId: f.bureauOrganizationId,
      routingReleaseId: f.routingReleaseId,
      routingRuleId: f.ruleId,
    });
  });

  it('requires an independent reviewer and binds corrections to a new immutable version', async () => {
    const f = await fixture({ applicantCanReview: true });
    const first = await submit(f.applicant);
    const oldCase = await caseId(first.id);
    await expect(
      service.decideBureauCase(f.applicant, oldCase, {
        expectedVersion: first.version,
        decision: 'approve',
        reason: 'Self-review.',
      }),
    ).rejects.toMatchObject({ code: 'forbidden' });
    const changes = await service.decideBureauCase(f.reviewer, oldCase, {
      expectedVersion: first.version,
      decision: 'request_changes',
      reason: 'Synthetic correction.',
    });
    const draft = await service.updateDraft(f.applicant, first.id, changes.version, {
      ...content(),
      applicantNotes: 'Corrected.',
    });
    const next = await service.submitApplication(f.applicant, first.id, draft.version);
    expect(next.currentVersion).toBe(2);
    expect(next.currentVersionId).not.toBe(first.currentVersionId);
    await expect(
      service.decideBureauCase(f.reviewer, oldCase, {
        expectedVersion: next.version,
        decision: 'approve',
        reason: 'Old version.',
      }),
    ).rejects.toMatchObject({ code: 'conflict' });
    expect(next.historicalBureauDecisions).toEqual([
      expect.objectContaining({ decision: 'request_changes', applicationVersion: 1 }),
    ]);
  });

  it('serializes concurrent decisions so exactly one can decide the current version', async () => {
    const f = await fixture({ secondReviewer: true });
    const submitted = await submit(f.applicant);
    const id = await caseId(submitted.id);
    const results = await Promise.allSettled([
      service.decideBureauCase(f.reviewer, id, {
        expectedVersion: submitted.version,
        decision: 'approve',
        reason: 'Synthetic A.',
      }),
      service.decideBureauCase(f.secondReviewer!, id, {
        expectedVersion: submitted.version,
        decision: 'reject',
        reason: 'Synthetic B.',
      }),
    ]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);
    const [count] = await client.unsafe(
      'SELECT count(*)::int AS count FROM hotel_bureau_decisions WHERE case_id = $1',
      [id],
    );
    expect(count?.count).toBe(1);
  });

  it('blocks Administrator admission without approval of the current submitted version', async () => {
    const f = await fixture();
    const submitted = await submit(f.applicant);
    expect((await service.listAdmissionQueue(f.administrator)).items).not.toContainEqual(
      expect.objectContaining({ id: submitted.id }),
    );
    await expect(
      service.decideAdmission(f.administrator, submitted.id, {
        expectedVersion: submitted.version,
        decision: 'admit',
        reason: 'Unapproved.',
      }),
    ).rejects.toMatchObject({ code: 'not_found' });
    const [count] = await client.unsafe(
      'SELECT count(*)::int AS count FROM hotel_admission_decisions WHERE application_id = $1',
      [submitted.id],
    );
    expect(count?.count).toBe(0);
  });

  it('atomically grants private provider access on admission without commercial/public capabilities or private DTO leakage', async () => {
    const f = await fixture();
    const admitted = await admit(f);
    expect(admitted).toMatchObject({
      workspaceAccess: 'private_only',
      admissionStatus: 'admitted',
      admittedVersion: 1,
    });
    const [provider] = await client.unsafe(
      `SELECT o.organization_type, o.level, o.administrative_unit_id FROM hotel_applications a
       JOIN organizations o ON o.id = a.provider_organization_id WHERE a.id = $1`,
      [admitted.id],
    );
    expect(provider).toEqual({
      organization_type: 'provider',
      level: null,
      administrative_unit_id: null,
    });
    const grants = await client.unsafe(
      `SELECT g.capability FROM hotel_applications a JOIN memberships m ON m.organization_id = a.provider_organization_id
       JOIN access_grants g ON g.membership_id = m.id WHERE a.id = $1 ORDER BY g.capability`,
      [admitted.id],
    );
    expect(grants.map((row) => row.capability)).toEqual([
      'hotel:workspace:edit',
      'hotel:workspace:read',
    ]);
    expect(await service.getProviderWorkspace(f.applicant, admitted.id)).toMatchObject({
      workspaceAccess: 'private_only',
    });
    await expect(service.getProviderWorkspace(f.other, admitted.id)).rejects.toMatchObject({
      code: 'not_found',
    });
    for (const key of [
      'assignment',
      'providerOrganizationId',
      'applicantProfileId',
      'externalIssuer',
      'externalSubjectId',
      'routingReleaseId',
      'routingRuleId',
    ])
      expect(admitted).not.toHaveProperty(key);
    const audit = await client.unsafe(
      "SELECT action FROM audit_events WHERE target_resource_id = $1 AND outcome = 'allowed'",
      [admitted.id],
    );
    expect(audit.map((row) => row.action)).toEqual(
      expect.arrayContaining([
        'hotel.application.created',
        'hotel.application.submitted',
        'hotel.bureau.approve',
        'hotel.admission.admit',
      ]),
    );
  });

  it('preserves private workspace after a different-location resubmission without carrying forward historical approval', async () => {
    const f = await fixture();
    const admitted = await admit(f);
    const oldCase = await caseId(admitted.id);
    const draft = await service.updateDraft(
      f.applicant,
      admitted.id,
      admitted.version,
      content(f.otherSelection),
    );
    const next = await service.submitApplication(f.applicant, admitted.id, draft.version);
    expect(next).toMatchObject({
      status: 'submitted',
      admissionStatus: 'admitted',
      workspaceAccess: 'private_only',
      currentVersion: 2,
      admittedVersion: 1,
      bureauDecision: null,
      admissionDecision: null,
      location: f.otherSelection,
      historicalBureauDecisions: [
        expect.objectContaining({ decision: 'approve', applicationVersion: 1 }),
      ],
      historicalAdmissionDecisions: [
        expect.objectContaining({ decision: 'admit', applicationVersion: 1 }),
      ],
    });
    expect(await service.getProviderWorkspace(f.applicant, admitted.id)).toMatchObject({
      currentVersion: 2,
      admittedVersion: 1,
      workspaceAccess: 'private_only',
      location: f.otherSelection,
    });
    const newCase = await caseId(admitted.id);
    expect((await service.listBureauCases(f.reviewer)).items).not.toContainEqual(
      expect.objectContaining({ caseId: newCase }),
    );
    expect(await service.getBureauCase(f.otherReviewer, newCase)).toMatchObject({
      currentVersion: 2,
      location: f.otherSelection,
      bureauDecision: null,
      historicalBureauDecisions: [],
      historicalAdmissionDecisions: [],
    });
    await expect(
      service.decideBureauCase(f.reviewer, oldCase, {
        expectedVersion: next.version,
        decision: 'approve',
        reason: 'Stale case.',
      }),
    ).rejects.toMatchObject({ code: 'conflict' });
    await expect(
      service.decideAdmission(f.administrator, admitted.id, {
        expectedVersion: next.version,
        decision: 'admit',
        reason: 'Old approval cannot cover a new location.',
      }),
    ).rejects.toMatchObject({ code: 'not_found' });
    expect((await service.listAdmissionQueue(f.administrator)).items).not.toContainEqual(
      expect.objectContaining({ id: admitted.id }),
    );
  });

  it('requires the current active provider-edit grant after admission', async () => {
    const f = await fixture();
    const admitted = await admit(f);
    await client.unsafe(
      `UPDATE access_grants SET active = false WHERE capability = 'hotel:workspace:edit' AND membership_id IN
       (SELECT id FROM memberships WHERE organization_id = (SELECT provider_organization_id FROM hotel_applications WHERE id = $1))`,
      [admitted.id],
    );
    await expect(
      service.updateDraft(f.applicant, admitted.id, admitted.version, content()),
    ).rejects.toMatchObject({ code: 'forbidden' });
    expect(await service.getMyApplication(f.applicant, admitted.id)).toMatchObject({
      status: 'approved',
      admissionStatus: 'admitted',
    });
  });

  it('rolls back provider organization, membership, grants, decision and success audit on admission failure', async () => {
    const f = await fixture();
    const [before] = await client.unsafe<{ count: number }[]>(
      "SELECT count(*)::int AS count FROM organizations WHERE organization_type = 'provider'",
    );
    if (!before) throw new Error('Provider baseline count was not returned.');
    const submitted = await submit(f.applicant);
    const approved = await service.decideBureauCase(f.reviewer, await caseId(submitted.id), {
      expectedVersion: submitted.version,
      decision: 'approve',
      reason: 'Rollback preparation.',
    });
    const trigger = `hotel_pilot_fail_${randomUUID().replaceAll('-', '')}`;
    const fn = `${trigger}_fn`;
    try {
      await client.unsafe(`CREATE FUNCTION ${fn}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
        IF NEW.user_profile_id = '${f.applicantProfileId}'::uuid THEN RAISE EXCEPTION 'pilot rollback probe'; END IF; RETURN NEW; END $$`);
      await client.unsafe(
        `CREATE TRIGGER ${trigger} BEFORE INSERT ON memberships FOR EACH ROW EXECUTE FUNCTION ${fn}()`,
      );
      await expect(
        service.decideAdmission(f.administrator, submitted.id, {
          expectedVersion: approved.version,
          decision: 'admit',
          reason: 'Atomic rollback.',
        }),
      ).rejects.toThrow('pilot rollback probe');
    } finally {
      await client.unsafe(`DROP TRIGGER IF EXISTS ${trigger} ON memberships`);
      await client.unsafe(`DROP FUNCTION IF EXISTS ${fn}()`);
    }
    const [counts] = await client.unsafe(
      `SELECT (SELECT count(*)::int FROM hotel_admission_decisions WHERE application_id = $1) AS decisions,
       (SELECT count(*)::int FROM organizations WHERE organization_type = 'provider') AS organizations,
       (SELECT count(*)::int FROM memberships WHERE user_profile_id = $2) AS memberships,
       (SELECT count(*)::int FROM access_grants g JOIN memberships m ON m.id = g.membership_id WHERE m.user_profile_id = $2) AS grants,
       (SELECT count(*)::int FROM audit_events WHERE target_resource_id = $1 AND action = 'hotel.admission.admit' AND outcome = 'allowed') AS audits`,
      [submitted.id, f.applicantProfileId],
    );
    expect(counts).toEqual({
      decisions: 0,
      organizations: before.count,
      memberships: 0,
      grants: 0,
      audits: 0,
    });
    expect(await service.getMyApplication(f.applicant, submitted.id)).toMatchObject({
      version: approved.version,
      admissionStatus: 'pending',
      workspaceAccess: 'not_admitted',
    });
  });

  it('rejects mutation of submitted contents, version assignment, case binding and decision history', async () => {
    const f = await fixture();
    const submitted = await submit(f.applicant);
    const id = await caseId(submitted.id);
    for (const [column, value] of [
      ['content', '{}'],
      ['geography_release_id', 'forged-synthetic-release'],
      ['submitted_location_snapshot', '{}'],
    ])
      await expect(
        client.unsafe(`UPDATE hotel_application_versions SET ${column} = $2 WHERE id = $1`, [
          submitted.currentVersionId!,
          value!,
        ]),
      ).rejects.toThrow(/immutable/i);
    for (const [column, value] of [
      ['bureau_organization_id', f.otherBureauOrganizationId],
      ['geography_release_id', 'forged-synthetic-release'],
      ['scope_geography_unit_id', f.otherSelection.unitId],
      ['routing_rule_id', randomUUID()],
      ['application_version_id', randomUUID()],
    ])
      await expect(
        client.unsafe(`UPDATE hotel_bureau_cases SET ${column} = $2 WHERE id = $1`, [id, value!]),
      ).rejects.toThrow(/immutable/i);
    await service.decideBureauCase(f.reviewer, id, {
      expectedVersion: submitted.version,
      decision: 'reject',
      reason: 'Immutable decision.',
    });
    await expect(
      client.unsafe('DELETE FROM hotel_bureau_decisions WHERE case_id = $1', [id]),
    ).rejects.toThrow(/immutable/i);
    expect((await service.getMyApplication(f.applicant, submitted.id)).location).toEqual(
      submitted.location,
    );
  });
});

async function fixture(options: { applicantCanReview?: boolean; secondReviewer?: boolean } = {}) {
  const suffix = randomUUID();
  const administrativeUnitId = `hotel-org-scope-${suffix}`;
  const bureauOrganizationId = `hotel-bureau-a-${suffix}`;
  const otherBureauOrganizationId = `hotel-bureau-b-${suffix}`;
  const administratorOrganizationId = `hotel-platform-${suffix}`;
  const geographyReleaseId = `hotel-geography-${suffix}`;
  const routingReleaseId = `hotel-routing-${suffix}`;
  const selection = {
    geographyReleaseId,
    unitId: `hotel-location-a-${suffix}`,
    unitRevisionId: randomUUID(),
  };
  const otherSelection = {
    geographyReleaseId,
    unitId: `hotel-location-b-${suffix}`,
    unitRevisionId: randomUUID(),
  };
  const ruleId = randomUUID();
  const otherRuleId = randomUUID();
  await client.unsafe(
    "INSERT INTO administrative_units (id, display_name, level, is_synthetic) VALUES ($1, 'Synthetic organization scope', 'woreda', true)",
    [administrativeUnitId],
  );
  for (const id of [bureauOrganizationId, otherBureauOrganizationId, administratorOrganizationId]) {
    const platform = id === administratorOrganizationId;
    await client.unsafe(
      `INSERT INTO organizations (id, display_name, organization_type, level, administrative_unit_id, is_synthetic)
      VALUES ($1, 'Synthetic hotel test organization', $2, $3, $4, true)`,
      [
        id,
        platform ? 'platform' : 'administrative',
        platform ? null : 'woreda',
        platform ? null : administrativeUnitId,
      ],
    );
  }
  await provisionSyntheticHotelReleasePair(
    client,
    {
      geography: {
        id: geographyReleaseId,
        sourceName: 'Synthetic tests',
        sourceEdition: 'test-v1',
        sourceReference: 'urn:ethio-tour:synthetic-tests',
        synthetic: true,
        units: [selection, otherSelection].map((s) => ({
          unitId: s.unitId,
          revisionId: s.unitRevisionId,
          unitType: 'demo-locality',
          parentUnitId: null,
          names: [
            {
              value: `Synthetic location ${s === selection ? 'A' : 'B'}`,
              languageTag: 'en',
              script: 'Latn',
              kind: 'display' as const,
            },
          ],
        })),
      },
      routing: {
        id: routingReleaseId,
        geographyReleaseId,
        sourceName: 'Synthetic routing',
        sourceEdition: 'test-v1',
        provenance: 'Synthetic software assignment only.',
        synthetic: true,
        rules: [
          {
            id: ruleId,
            matchUnitId: selection.unitId,
            matchMode: 'exact',
            organizationId: bureauOrganizationId,
            scopeUnitId: selection.unitId,
            enabled: true,
          },
          {
            id: otherRuleId,
            matchUnitId: otherSelection.unitId,
            matchMode: 'exact',
            organizationId: otherBureauOrganizationId,
            scopeUnitId: otherSelection.unitId,
            enabled: true,
          },
        ],
      },
    },
    { NODE_ENV: 'test', REGISTRY_POLICY_MODE: 'demo' },
  );
  selectedLocation = selection;
  const applicant = await makeActor('applicant');
  const other = await makeActor('other');
  const reviewer = await makeActor('reviewer');
  const otherReviewer = await makeActor('other-reviewer');
  const administrator = await makeActor('administrator');
  const secondReviewer = options.secondReviewer ? await makeActor('second-reviewer') : undefined;
  const settings = { enabled: true, production: false, administratorOrganizationId };
  service = new HotelOnboardingService(new PostgresHotelOnboardingStore(client), settings);
  for (const actor of [
    reviewer,
    ...(options.applicantCanReview ? [applicant] : []),
    ...(secondReviewer ? [secondReviewer] : []),
  ]) {
    await grant(actor, bureauOrganizationId, selection, [
      'hotel:application:bureau:read',
      'hotel:application:bureau:decide',
    ]);
  }
  await grant(otherReviewer, otherBureauOrganizationId, otherSelection, [
    'hotel:application:bureau:read',
    'hotel:application:bureau:decide',
  ]);
  await grant(administrator, administratorOrganizationId, null, [
    'hotel:application:admin:read',
    'hotel:application:admin:decide',
  ]);
  return {
    applicant,
    applicantProfileId: await profileId(applicant),
    other,
    reviewer,
    otherReviewer,
    administrator,
    secondReviewer,
    selection,
    otherSelection,
    bureauOrganizationId,
    otherBureauOrganizationId,
    routingReleaseId,
    ruleId,
    settings,
  };
}

async function makeActor(label: string): Promise<RegistryActor> {
  const actor = { issuer, subjectId: `${label}-${randomUUID()}` };
  await client.unsafe(
    'INSERT INTO user_profiles (external_issuer, external_subject_id) VALUES ($1, $2)',
    [actor.issuer, actor.subjectId],
  );
  return actor;
}

async function profileId(actor: RegistryActor): Promise<string> {
  const [row] = await client.unsafe<{ id: string }[]>(
    'SELECT id FROM user_profiles WHERE external_issuer = $1 AND external_subject_id = $2',
    [actor.issuer, actor.subjectId],
  );
  if (!row) throw new Error('Synthetic test profile is missing.');
  return row.id;
}

async function grant(
  actor: RegistryActor,
  organizationId: string,
  scope: HotelLocationSelection | null,
  capabilities: string[],
) {
  const [membership] = await client.unsafe<{ id: string }[]>(
    "INSERT INTO memberships (user_profile_id, organization_id, label) VALUES ($1, $2, 'Synthetic test role') RETURNING id",
    [await profileId(actor), organizationId],
  );
  if (!membership) throw new Error('Synthetic test membership insert returned no row.');
  for (const capability of capabilities) {
    const [row] = await client.unsafe<{ id: string }[]>(
      `INSERT INTO access_grants (membership_id, capability, organization_id, demo_only, production_decision_enabled)
      VALUES ($1, $2, $3, true, false) RETURNING id`,
      [membership.id, capability, organizationId],
    );
    if (!row) throw new Error('Synthetic test grant insert returned no row.');
    if (scope)
      await client.unsafe(
        `INSERT INTO grant_scopes (grant_id, administrative_unit_id, hotel_geography_release_id, hotel_geography_unit_id, include_descendants)
      VALUES ($1, NULL, $2, $3, false)`,
        [row.id, scope.geographyReleaseId, scope.unitId],
      );
  }
}

async function caseId(applicationId: string): Promise<string> {
  const [row] = await client.unsafe<{ id: string }[]>(
    'SELECT id FROM hotel_bureau_cases WHERE application_id = $1 ORDER BY created_at DESC, id DESC LIMIT 1',
    [applicationId],
  );
  if (!row) throw new Error('Synthetic submitted case is missing.');
  return row.id;
}

function content(locationSelection = selectedLocation) {
  return {
    locationSelection,
    claimedHotelName: `Synthetic test lodging ${randomUUID()}`,
    applicantNotes: 'Synthetic-only test content.',
  };
}

async function submit(actor: RegistryActor, selection = selectedLocation) {
  const draft = await service.createApplication(actor, { content: content(selection) });
  return service.submitApplication(actor, draft.id, draft.version);
}

async function admit(f: Awaited<ReturnType<typeof fixture>>) {
  const submitted = await submit(f.applicant);
  const approved = await service.decideBureauCase(f.reviewer, await caseId(submitted.id), {
    expectedVersion: submitted.version,
    decision: 'approve',
    reason: 'Synthetic pilot review.',
  });
  return service.decideAdmission(f.administrator, submitted.id, {
    expectedVersion: approved.version,
    decision: 'admit',
    reason: 'Synthetic private workspace admission.',
  });
}
