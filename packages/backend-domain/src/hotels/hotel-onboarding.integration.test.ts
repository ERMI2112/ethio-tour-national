import { randomUUID } from 'node:crypto';

import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { isDisposableHotelTestDatabase } from '@ethio-tour/db/testing/disposable-database-target';

import { HotelOnboardingService } from './hotel-onboarding-service';
import { PostgresHotelOnboardingStore } from './postgres-hotel-onboarding-store';
import type { RegistryActor } from '../registry/registry-store';

const databaseUrl = process.env.HOTEL_PILOT_TEST_DATABASE_URL;
const safeDatabase = isDisposableHotelTestDatabase(
  databaseUrl,
  process.env.HOTEL_PILOT_TEST_DISPOSABLE,
);
const requiredRun = process.env.HOTEL_PILOT_TEST_REQUIRED === 'true';
if (requiredRun && !safeDatabase) {
  throw new Error(
    'HOTEL_PILOT_TEST_REQUIRED=true requires HOTEL_PILOT_TEST_DISPOSABLE=true and a guarded disposable database URL.',
  );
}
const suite = describe.skipIf(!safeDatabase);

let client: postgres.Sql;
let service: HotelOnboardingService;
let issuer: string;

beforeAll(async () => {
  if (!safeDatabase || !databaseUrl) return;
  client = postgres(databaseUrl, { max: 8 });
  const [migration] = await client.unsafe<{ exists: boolean }[]>(
    `SELECT to_regclass('public.hotel_applications') IS NOT NULL AS exists`,
  );
  if (!migration?.exists) throw new Error('Disposable database is missing hotel migration 0002.');
  const route = {
    organizationId: `hotel-test-bureau-${randomUUID()}`,
    administrativeUnitId: `hotel-test-unit-${randomUUID()}`,
  };
  service = new HotelOnboardingService(new PostgresHotelOnboardingStore(client), {
    enabled: true,
    production: false,
    bureauRouting: {
      resolveApplicationRoute: async () => ({ kind: 'routed', route }),
      routesForReview: async () => [route],
    },
    administratorOrganizationId: `hotel-test-platform-${randomUUID()}`,
  });
});

afterAll(async () => {
  if (client) await client.end({ timeout: 5 });
});

suite('synthetic hotel onboarding PostgreSQL integration', () => {
  it('creates private profile-owned drafts without membership or provider grants', async () => {
    const fixture = await seedFixture();
    const response = await service.createApplication(fixture.applicant, { content: content() });
    const [counts] = await client.unsafe<{ memberships: number; grants: number }[]>(
      `SELECT
         (SELECT count(*)::int FROM memberships WHERE user_profile_id = $1) AS memberships,
         (SELECT count(*)::int FROM access_grants grant_row JOIN memberships membership ON membership.id = grant_row.membership_id WHERE membership.user_profile_id = $1) AS grants`,
      [fixture.applicantProfileId],
    );

    expect(response).toMatchObject({
      status: 'draft',
      admissionStatus: 'not_eligible',
      workspaceAccess: 'not_admitted',
    });
    expect(counts).toEqual({ memberships: 0, grants: 0 });
    await expect(service.getMyApplication(fixture.other, response.id)).rejects.toMatchObject({
      code: 'not_found',
    });
    await expect(
      service.getProviderWorkspace(fixture.applicant, response.id),
    ).rejects.toMatchObject({ code: 'not_found' });
  });

  it('fails closed on an issuer-alias collision without creating a canonical profile or application', async () => {
    await seedFixture();
    const subjectId = `alias-collision-${randomUUID()}`;
    await client.unsafe(
      `INSERT INTO user_profiles (external_issuer, external_subject_id) VALUES ($1, $2)`,
      ['http://keycloak:8080/realms/synthetic-hotel', subjectId],
    );
    const aliasedActor: RegistryActor = {
      issuer,
      issuerAliases: ['http://keycloak:8080/realms/synthetic-hotel'],
      subjectId,
    };

    await expect(
      service.createApplication(aliasedActor, { content: content() }),
    ).rejects.toMatchObject({
      code: 'conflict',
      reason: expect.stringContaining('collides'),
    });
    const [canonical] = await client.unsafe<{ count: number }[]>(
      `SELECT count(*)::int AS count FROM user_profiles WHERE external_issuer = $1 AND external_subject_id = $2`,
      [issuer, subjectId],
    );
    expect(canonical?.count).toBe(0);
  });

  it('maps an explicitly accepted alias to one canonical profile when no collision exists', async () => {
    const fixture = await seedFixture();
    const subjectId = `canonical-alias-${randomUUID()}`;
    const canonicalActor: RegistryActor = { issuer, subjectId };
    const aliasActor: RegistryActor = {
      issuer,
      issuerAliases: ['http://keycloak:8080/realms/synthetic-hotel'],
      subjectId,
    };
    const created = await service.createApplication(canonicalActor, { content: content() });
    const applications = await service.listMyApplications(aliasActor);
    const [profiles] = await client.unsafe<{ count: number }[]>(
      `SELECT count(*)::int AS count FROM user_profiles WHERE external_subject_id = $1`,
      [subjectId],
    );

    expect(applications.items.map((item) => item.id)).toContain(created.id);
    expect(profiles?.count).toBe(1);
    expect(fixture.applicant.subjectId).not.toBe(subjectId);
  });

  it('assigns only the configured synthetic Bureau route and denies a different organization', async () => {
    const fixture = await seedFixture();
    const created = await service.createApplication(fixture.applicant, { content: content() });
    const submitted = await service.submitApplication(
      fixture.applicant,
      created.id,
      created.version,
    );
    const [caseRow] = await client.unsafe<
      { bureau_organization_id: string; scope_unit_id: string }[]
    >(
      `SELECT bureau_organization_id, scope_unit_id FROM hotel_bureau_cases WHERE application_id = $1`,
      [created.id],
    );
    expect(caseRow).toEqual({
      bureau_organization_id: fixture.route.organizationId,
      scope_unit_id: fixture.route.administrativeUnitId,
    });

    const caseId = await getCaseId(created.id);
    await expect(
      service.decideBureauCase(fixture.otherOrgReviewer, caseId, {
        expectedVersion: submitted.version,
        decision: 'approve',
        reason: 'Wrong organization must not review this case.',
      }),
    ).rejects.toMatchObject({ code: 'forbidden' });
    const [denial] = await client.unsafe<{ outcome: string; reason_code: string }[]>(
      `SELECT outcome, reason_code FROM audit_events
       WHERE actor_subject_id = $1 AND action = 'hotel.application.bureau.decide'
         AND target_resource_id = $2 ORDER BY created_at DESC LIMIT 1`,
      [fixture.otherOrgReviewer.subjectId, caseId],
    );
    expect(denial).toMatchObject({ outcome: 'denied', reason_code: 'missing-capability' });
  });

  it('does not combine Bureau decision capability and geographic scope across grants', async () => {
    const fixture = await seedFixture();
    const created = await service.createApplication(fixture.applicant, { content: content() });
    const submitted = await service.submitApplication(
      fixture.applicant,
      created.id,
      created.version,
    );
    const mixedReviewer = await makeActor('mixed-reviewer');
    const [otherUnit] = await client.unsafe<{ id: string }[]>(
      `INSERT INTO administrative_units (id, display_name, level, is_synthetic)
       VALUES ($1, 'Synthetic wrong-scope unit', 'woreda', true) RETURNING id`,
      [`hotel-test-other-unit-${randomUUID()}`],
    );
    await grant(mixedReviewer, fixture.route.organizationId, otherUnit!.id, [
      'hotel:application:bureau:decide',
    ]);
    await grant(mixedReviewer, fixture.route.organizationId, fixture.route.administrativeUnitId, [
      'hotel:application:bureau:read',
    ]);

    await expect(
      service.decideBureauCase(mixedReviewer, await getCaseId(created.id), {
        expectedVersion: submitted.version,
        decision: 'approve',
        reason: 'Separate scope grant must not complete the decision permission.',
      }),
    ).rejects.toMatchObject({ code: 'forbidden' });
  });

  it('requires an independent scoped reviewer and keeps each decision bound to one submitted version', async () => {
    const fixture = await seedFixture({ applicantCanReview: true });
    const created = await service.createApplication(fixture.applicant, { content: content() });
    const submitted = await service.submitApplication(
      fixture.applicant,
      created.id,
      created.version,
    );
    const caseId = await getCaseId(created.id);
    await expect(
      service.decideBureauCase(fixture.applicant, caseId, {
        expectedVersion: submitted.version,
        decision: 'approve',
        reason: 'Self-review is not permitted.',
      }),
    ).rejects.toMatchObject({ code: 'forbidden' });

    const requested = await service.decideBureauCase(fixture.reviewer, caseId, {
      expectedVersion: submitted.version,
      decision: 'request_changes',
      reason: 'A synthetic correction is requested.',
    });
    expect(requested.status).toBe('changes_requested');
    const corrected = await service.updateDraft(fixture.applicant, created.id, requested.version, {
      ...content(),
      applicantNotes: 'Updated synthetic notes.',
    });
    const resubmitted = await service.submitApplication(
      fixture.applicant,
      created.id,
      corrected.version,
    );
    expect(resubmitted.currentVersion).toBe(2);
    expect(resubmitted.currentVersionId).not.toBe(submitted.currentVersionId);
    await expect(
      service.decideBureauCase(fixture.reviewer, caseId, {
        expectedVersion: resubmitted.version,
        decision: 'approve',
        reason: 'Old version is stale.',
      }),
    ).rejects.toMatchObject({ code: 'conflict' });
  });

  it('serializes concurrent decisions so only one can decide the same current version', async () => {
    const fixture = await seedFixture({ secondReviewer: true });
    const created = await service.createApplication(fixture.applicant, { content: content() });
    const submitted = await service.submitApplication(
      fixture.applicant,
      created.id,
      created.version,
    );
    const caseId = await getCaseId(created.id);
    const outcomes = await Promise.allSettled([
      service.decideBureauCase(fixture.reviewer, caseId, {
        expectedVersion: submitted.version,
        decision: 'approve',
        reason: 'Synthetic decision A.',
      }),
      service.decideBureauCase(fixture.secondReviewer!, caseId, {
        expectedVersion: submitted.version,
        decision: 'reject',
        reason: 'Synthetic decision B.',
      }),
    ]);

    expect(outcomes.filter((outcome) => outcome.status === 'fulfilled')).toHaveLength(1);
    expect(outcomes.filter((outcome) => outcome.status === 'rejected')).toHaveLength(1);
    const [count] = await client.unsafe<{ count: number }[]>(
      `SELECT count(*)::int AS count FROM hotel_bureau_decisions WHERE case_id = $1`,
      [caseId],
    );
    expect(count?.count).toBe(1);
  });

  it('keeps Administrator admission closed until current-version Bureau approval', async () => {
    const fixture = await seedFixture();
    const created = await service.createApplication(fixture.applicant, { content: content() });
    await service.submitApplication(fixture.applicant, created.id, created.version);
    expect((await service.listAdmissionQueue(fixture.administrator)).items).toHaveLength(0);
    await expect(
      service.decideAdmission(fixture.administrator, created.id, {
        expectedVersion: 2,
        decision: 'admit',
        reason: 'No Bureau approval exists yet.',
      }),
    ).rejects.toMatchObject({ code: 'not_found' });
    const [decisions] = await client.unsafe<{ count: number }[]>(
      `SELECT count(*)::int AS count FROM hotel_admission_decisions WHERE application_id = $1`,
      [created.id],
    );
    expect(decisions?.count).toBe(0);
  });

  it('atomically creates private provider access only after admission and records no commercial capabilities', async () => {
    const fixture = await seedFixture();
    const created = await service.createApplication(fixture.applicant, { content: content() });
    const submitted = await service.submitApplication(
      fixture.applicant,
      created.id,
      created.version,
    );
    const approved = await service.decideBureauCase(fixture.reviewer, await getCaseId(created.id), {
      expectedVersion: submitted.version,
      decision: 'approve',
      reason: 'Synthetic pilot Bureau review completed.',
    });
    expect(approved.admissionStatus).toBe('pending');
    const admitted = await service.decideAdmission(fixture.administrator, created.id, {
      expectedVersion: approved.version,
      decision: 'admit',
      reason: 'Synthetic pilot private workspace admission.',
    });
    expect(admitted.workspaceAccess).toBe('private_only');
    expect(admitted.admissionStatus).toBe('admitted');
    const [provider] = await client.unsafe<
      { organization_type: string; level: string | null; administrative_unit_id: string | null }[]
    >(
      `SELECT organization.organization_type, organization.level, organization.administrative_unit_id
       FROM hotel_applications application JOIN organizations organization
         ON organization.id = application.provider_organization_id WHERE application.id = $1`,
      [created.id],
    );
    expect(provider).toEqual({
      organization_type: 'provider',
      level: null,
      administrative_unit_id: null,
    });
    const grants = await client.unsafe<{ capability: string }[]>(
      `SELECT grant_row.capability FROM hotel_applications application
       JOIN memberships membership ON membership.organization_id = application.provider_organization_id
       JOIN access_grants grant_row ON grant_row.membership_id = membership.id
       WHERE application.id = $1 ORDER BY grant_row.capability`,
      [created.id],
    );
    expect(grants.map((grant) => grant.capability)).toEqual([
      'hotel:workspace:edit',
      'hotel:workspace:read',
    ]);
    expect(await service.getProviderWorkspace(fixture.applicant, created.id)).toMatchObject({
      workspaceAccess: 'private_only',
    });
    await expect(service.getProviderWorkspace(fixture.other, created.id)).rejects.toMatchObject({
      code: 'not_found',
    });
    expect(Object.keys(admitted)).not.toEqual(
      expect.arrayContaining([
        'providerOrganizationId',
        'applicantProfileId',
        'externalIssuer',
        'externalSubjectId',
      ]),
    );
    const audit = await client.unsafe<{ action: string }[]>(
      `SELECT action FROM audit_events WHERE target_resource_id = $1 AND outcome = 'allowed' ORDER BY created_at`,
      [created.id],
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

  it('keeps private access after a post-admission resubmission without carrying forward approval', async () => {
    const fixture = await seedFixture();
    const created = await service.createApplication(fixture.applicant, { content: content() });
    const submitted = await service.submitApplication(
      fixture.applicant,
      created.id,
      created.version,
    );
    const approved = await service.decideBureauCase(fixture.reviewer, await getCaseId(created.id), {
      expectedVersion: submitted.version,
      decision: 'approve',
      reason: 'First synthetic version approved.',
    });
    const admitted = await service.decideAdmission(fixture.administrator, created.id, {
      expectedVersion: approved.version,
      decision: 'admit',
      reason: 'Private pilot admission.',
    });
    const draft = await service.updateDraft(fixture.applicant, created.id, admitted.version, {
      ...content(),
      applicantNotes: 'Updated after private admission.',
    });
    const next = await service.submitApplication(fixture.applicant, created.id, draft.version);

    expect(next).toMatchObject({
      status: 'submitted',
      admissionStatus: 'admitted',
      workspaceAccess: 'private_only',
      currentVersion: 2,
      bureauDecision: null,
      admissionDecision: null,
    });
    expect(await service.getProviderWorkspace(fixture.applicant, created.id)).toMatchObject({
      status: 'submitted',
      workspaceAccess: 'private_only',
    });
    expect((await service.listAdmissionQueue(fixture.administrator)).items).not.toContainEqual(
      expect.objectContaining({ id: created.id }),
    );
  });

  it('requires the active provider edit grant for changes after admission', async () => {
    const fixture = await seedFixture();
    const created = await service.createApplication(fixture.applicant, { content: content() });
    const submitted = await service.submitApplication(
      fixture.applicant,
      created.id,
      created.version,
    );
    const approved = await service.decideBureauCase(fixture.reviewer, await getCaseId(created.id), {
      expectedVersion: submitted.version,
      decision: 'approve',
      reason: 'Synthetic approval before access test.',
    });
    const admitted = await service.decideAdmission(fixture.administrator, created.id, {
      expectedVersion: approved.version,
      decision: 'admit',
      reason: 'Synthetic private admission.',
    });
    await client.unsafe(
      `UPDATE access_grants SET active = false
       WHERE capability = 'hotel:workspace:edit'
         AND membership_id IN (SELECT id FROM memberships WHERE organization_id = (
           SELECT provider_organization_id FROM hotel_applications WHERE id = $1
         ))`,
      [created.id],
    );

    await expect(
      service.updateDraft(fixture.applicant, created.id, admitted.version, content()),
    ).rejects.toMatchObject({ code: 'forbidden' });
    expect(await service.getMyApplication(fixture.applicant, created.id)).toMatchObject({
      status: 'approved',
      admissionStatus: 'admitted',
    });
  });

  it('rolls back decision, organization, membership, grants and audit if admission provisioning fails', async () => {
    const fixture = await seedFixture();
    const created = await service.createApplication(fixture.applicant, { content: content() });
    const submitted = await service.submitApplication(
      fixture.applicant,
      created.id,
      created.version,
    );
    const approved = await service.decideBureauCase(fixture.reviewer, await getCaseId(created.id), {
      expectedVersion: submitted.version,
      decision: 'approve',
      reason: 'Synthetic approval for rollback test.',
    });
    const [triggerName] = [`hotel_pilot_fail_membership_${randomUUID().replaceAll('-', '')}`];
    const functionName = `${triggerName}_fn`;
    try {
      await client.unsafe(`CREATE FUNCTION ${functionName}() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN IF NEW.organization_id LIKE 'hotel-provider-%' THEN RAISE EXCEPTION 'pilot rollback probe'; END IF; RETURN NEW; END $$`);
      await client.unsafe(
        `CREATE TRIGGER ${triggerName} BEFORE INSERT ON memberships FOR EACH ROW EXECUTE FUNCTION ${functionName}()`,
      );
      await expect(
        service.decideAdmission(fixture.administrator, created.id, {
          expectedVersion: approved.version,
          decision: 'admit',
          reason: 'Must roll back as one transaction.',
        }),
      ).rejects.toThrow('pilot rollback probe');
    } finally {
      await client.unsafe(`DROP TRIGGER IF EXISTS ${triggerName} ON memberships`);
      await client.unsafe(`DROP FUNCTION IF EXISTS ${functionName}()`);
    }
    const [state] = await client.unsafe<
      { decision_count: number; provider_count: number; admission_audit_count: number }[]
    >(
      `SELECT
         (SELECT count(*)::int FROM hotel_admission_decisions WHERE application_id = $1) AS decision_count,
         (SELECT count(*)::int FROM organizations WHERE id LIKE 'hotel-provider-%' AND id IN (SELECT provider_organization_id FROM hotel_applications WHERE id = $1)) AS provider_count,
         (SELECT count(*)::int FROM audit_events WHERE target_resource_id = $1 AND action = 'hotel.admission.admit') AS admission_audit_count`,
      [created.id],
    );
    expect(state).toEqual({ decision_count: 0, provider_count: 0, admission_audit_count: 0 });
  });

  it('refuses updates to immutable submitted content and decision history', async () => {
    const fixture = await seedFixture();
    const created = await service.createApplication(fixture.applicant, { content: content() });
    const submitted = await service.submitApplication(
      fixture.applicant,
      created.id,
      created.version,
    );
    const [version] = await client.unsafe<{ id: string }[]>(
      `SELECT id FROM hotel_application_versions WHERE application_id = $1`,
      [created.id],
    );
    if (!version) throw new Error('Submitted immutable version is missing.');
    await expect(
      client.unsafe(`UPDATE hotel_application_versions SET content = '{}'::jsonb WHERE id = $1`, [
        version.id,
      ]),
    ).rejects.toThrow('hotel application history is immutable');
    await expect(
      service.decideBureauCase(fixture.reviewer, await getCaseId(created.id), {
        expectedVersion: submitted.version,
        decision: 'reject',
        reason: 'Synthetic rejection for immutable history test.',
      }),
    ).resolves.toMatchObject({ status: 'rejected' });
    const [decision] = await client.unsafe<{ id: string }[]>(
      `SELECT id FROM hotel_bureau_decisions WHERE application_version_id = $1`,
      [version.id],
    );
    if (!decision) throw new Error('Bureau decision history is missing.');
    await expect(
      client.unsafe(`DELETE FROM hotel_bureau_decisions WHERE id = $1`, [decision.id]),
    ).rejects.toThrow('hotel application history is immutable');
  });
});

async function seedFixture(
  options: { applicantCanReview?: boolean; secondReviewer?: boolean } = {},
) {
  const suffix = randomUUID();
  const route = {
    organizationId: `hotel-test-bureau-${suffix}`,
    administrativeUnitId: `hotel-test-unit-${suffix}`,
  };
  const otherBureauOrganizationId = `hotel-test-other-bureau-${suffix}`;
  const administratorOrganizationId = `hotel-test-platform-${suffix}`;
  issuer = 'https://identity.example.test/realms/synthetic-hotel';
  await client.unsafe(
    `INSERT INTO administrative_units (id, display_name, level, parent_id, is_synthetic)
     VALUES ($1, 'Synthetic hotel pilot test scope', 'woreda', NULL, true)`,
    [route.administrativeUnitId],
  );
  for (const org of [
    {
      id: route.organizationId,
      name: 'Synthetic Bureau test organization',
      type: 'administrative',
      level: 'woreda',
      unit: route.administrativeUnitId,
    },
    {
      id: otherBureauOrganizationId,
      name: 'Synthetic other Bureau test organization',
      type: 'administrative',
      level: 'woreda',
      unit: route.administrativeUnitId,
    },
    {
      id: administratorOrganizationId,
      name: 'Synthetic platform test organization',
      type: 'platform',
      level: null,
      unit: null,
    },
  ]) {
    await client.unsafe(
      `INSERT INTO organizations (id, display_name, organization_type, level, administrative_unit_id, is_synthetic)
       VALUES ($1, $2, $3, $4, $5, true)`,
      [org.id, org.name, org.type, org.level, org.unit],
    );
  }
  const applicant = await makeActor('applicant');
  const other = await makeActor('other');
  const reviewer = await makeActor('reviewer');
  const otherOrgReviewer = await makeActor('other-org-reviewer');
  const administrator = await makeActor('administrator');
  const secondReviewer = options.secondReviewer ? await makeActor('second-reviewer') : undefined;
  const settings = {
    enabled: true,
    production: false,
    bureauRouting: {
      resolveApplicationRoute: async () => ({ kind: 'routed' as const, route }),
      routesForReview: async () => [route],
    },
    administratorOrganizationId,
  };
  const localService = new HotelOnboardingService(
    new PostgresHotelOnboardingStore(client),
    settings,
  );
  if (options.applicantCanReview)
    await grant(applicant, route.organizationId, route.administrativeUnitId, [
      'hotel:application:bureau:read',
      'hotel:application:bureau:decide',
    ]);
  await grant(reviewer, route.organizationId, route.administrativeUnitId, [
    'hotel:application:bureau:read',
    'hotel:application:bureau:decide',
  ]);
  if (secondReviewer)
    await grant(secondReviewer, route.organizationId, route.administrativeUnitId, [
      'hotel:application:bureau:read',
      'hotel:application:bureau:decide',
    ]);
  await grant(otherOrgReviewer, otherBureauOrganizationId, route.administrativeUnitId, [
    'hotel:application:bureau:read',
    'hotel:application:bureau:decide',
  ]);
  await grant(administrator, administratorOrganizationId, null, [
    'hotel:application:admin:read',
    'hotel:application:admin:decide',
  ]);
  service = localService;
  return {
    applicant,
    applicantProfileId: await profileId(applicant),
    other,
    reviewer,
    otherOrgReviewer,
    secondReviewer,
    administrator,
    route,
    otherBureauOrganizationId,
    administratorOrganizationId,
    settings,
  };
}

async function makeActor(label: string): Promise<RegistryActor> {
  const subjectId = `${label}-${randomUUID()}`;
  await client.unsafe(
    `INSERT INTO user_profiles (external_issuer, external_subject_id) VALUES ($1, $2)`,
    [issuer, subjectId],
  );
  return { issuer, subjectId };
}

async function profileId(actor: RegistryActor): Promise<string> {
  const [row] = await client.unsafe<{ id: string }[]>(
    `SELECT id FROM user_profiles WHERE external_issuer = $1 AND external_subject_id = $2`,
    [actor.issuer, actor.subjectId],
  );
  if (!row) throw new Error('Synthetic fixture profile was not created.');
  return row.id;
}

async function grant(
  actor: RegistryActor,
  organizationId: string,
  scopeUnitId: string | null,
  capabilities: string[],
): Promise<void> {
  const profile = await profileId(actor);
  const [membership] = await client.unsafe<{ id: string }[]>(
    `INSERT INTO memberships (user_profile_id, organization_id, label) VALUES ($1, $2, 'Synthetic test role') RETURNING id`,
    [profile, organizationId],
  );
  if (!membership) throw new Error('Synthetic fixture membership insert returned no row.');
  for (const capability of capabilities) {
    const [grantRow] = await client.unsafe<{ id: string }[]>(
      `INSERT INTO access_grants (membership_id, capability, organization_id, demo_only, production_decision_enabled)
       VALUES ($1, $2, $3, true, false) RETURNING id`,
      [membership.id, capability, organizationId],
    );
    if (scopeUnitId && grantRow) {
      await client.unsafe(
        `INSERT INTO grant_scopes (grant_id, administrative_unit_id, include_descendants) VALUES ($1, $2, false)`,
        [grantRow.id, scopeUnitId],
      );
    }
  }
}

async function getCaseId(applicationId: string): Promise<string> {
  const [row] = await client.unsafe<{ id: string }[]>(
    `SELECT id FROM hotel_bureau_cases WHERE application_id = $1 ORDER BY created_at DESC LIMIT 1`,
    [applicationId],
  );
  if (!row) throw new Error('Synthetic Bureau case fixture was not created.');
  return row.id;
}

function content() {
  return {
    claimedHotelName: `Synthetic test lodging ${randomUUID().slice(0, 8)}`,
    applicantNotes: 'Synthetic-only content.',
  };
}
