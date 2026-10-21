import { randomUUID } from 'node:crypto';

import { authorize } from '@ethio-tour/authz';
import type {
  AuthorizationContext,
  AuthorizationGrant,
  AuthorizationMembership,
  Capability,
} from '@ethio-tour/authz';
import type {
  HotelAdmissionDecision,
  HotelAdmissionDecisionSummary,
  HotelApplicationDecision,
  HotelApplicationContent,
  HotelApplicationResponse,
  HotelBureauDecisionSummary,
  HotelBureauCaseResponse,
  HotelLocation,
} from '@ethio-tour/contracts';
import type { DatabaseClient } from '@ethio-tour/db';
import type postgres from 'postgres';

import { HotelOnboardingError } from './hotel-onboarding-service';
import type {
  HotelBureauRoute,
  HotelDecisionTarget,
  HotelOnboardingStore,
  HotelOnboardingTransaction,
} from './hotel-onboarding-store';
import type { RegistryActor } from '../registry/registry-store';

type Row = Record<string, unknown>;
type SqlTransaction = postgres.TransactionSql;
const POLICY_VERSION = 'synthetic-hotel-onboarding-v1';
const PUBLIC_NOTICE =
  'Synthetic pilot review result; not a license or proof of authority to represent a hotel.';

const applicationSelect = `
  SELECT application.id, application.status, application.admission_status,
         application.current_version_number, application.current_submitted_version_id,
         application.draft_content, application.version, application.provider_organization_id,
         application.is_synthetic, current_version.location_snapshot,
         CASE WHEN application.status = 'draft' THEN application.draft_content
              ELSE COALESCE(current_version.content, application.draft_content) END AS response_content,
         (SELECT jsonb_build_object(
            'decision', bureau_decision.decision,
            'applicationVersion', decided_version.version_number,
            'reason', bureau_decision.reason,
            'decidedAt', bureau_decision.created_at
          )
          FROM hotel_bureau_cases bureau_case
          JOIN hotel_bureau_decisions bureau_decision ON bureau_decision.case_id = bureau_case.id
          JOIN hotel_application_versions decided_version ON decided_version.id = bureau_case.application_version_id
          WHERE bureau_case.application_id = application.id
            AND bureau_case.application_version_id = application.current_submitted_version_id
          ORDER BY decided_version.version_number DESC, bureau_decision.created_at DESC
          LIMIT 1) AS bureau_decision,
         (SELECT jsonb_build_object(
            'decision', admission_decision.decision,
            'applicationVersion', decided_version.version_number,
            'reason', admission_decision.reason,
            'decidedAt', admission_decision.created_at
          )
          FROM hotel_admission_decisions admission_decision
          JOIN hotel_application_versions decided_version ON decided_version.id = admission_decision.application_version_id
          WHERE admission_decision.application_id = application.id
            AND admission_decision.application_version_id = application.current_submitted_version_id
          ORDER BY decided_version.version_number DESC, admission_decision.created_at DESC
          LIMIT 1) AS admission_decision,
         current_version.id AS response_version_id
  FROM hotel_applications application
  LEFT JOIN hotel_application_versions current_version
    ON current_version.id = application.current_submitted_version_id
   AND current_version.application_id = application.id
`;

export class PostgresHotelOnboardingStore implements HotelOnboardingStore {
  constructor(private readonly client: DatabaseClient) {}

  async transaction<T>(work: (transaction: HotelOnboardingTransaction) => Promise<T>): Promise<T> {
    const result = await this.client.begin(async (sql) => ({
      value: await work(new PostgresHotelOnboardingTransaction(sql)),
    }));
    return result.value;
  }
}

class PostgresHotelOnboardingTransaction implements HotelOnboardingTransaction {
  // Text-to-JSONB binds work with both raw clients and Drizzle's overridden JSON serializers.
  constructor(private readonly sql: SqlTransaction) {}

  private async location(unitId: string): Promise<HotelLocation | null> {
    const rows = await this.sql.unsafe<Row[]>(
      `WITH RECURSIVE hierarchy AS (
         SELECT id, display_name, parent_id, is_synthetic, ARRAY[id] AS path, false AS cycle
         FROM administrative_units WHERE id = $1
         UNION ALL
         SELECT parent.id, parent.display_name, parent.parent_id, parent.is_synthetic,
                child.path || parent.id, parent.id = ANY(child.path)
         FROM administrative_units parent JOIN hierarchy child ON parent.id = child.parent_id
         WHERE NOT child.cycle
       ) SELECT * FROM hierarchy ORDER BY cardinality(path) DESC`,
      [unitId],
    );
    if (
      !rows.length ||
      rows[0]!.parent_id !== null ||
      rows.some((row) => row.cycle === true || row.is_synthetic !== true)
    )
      return null;
    const hierarchy = rows.map((row) => ({
      id: stringValue(row.id),
      label: stringValue(row.display_name),
      parentId: nullableString(row.parent_id),
    }));
    return { ...hierarchy[hierarchy.length - 1]!, hierarchy };
  }

  async getAdministrativeUnitAncestorIds(unitId: string): Promise<string[]> {
    const location = await this.location(unitId);
    return location ? location.hierarchy.slice(0, -1).map((node) => node.id) : [];
  }

  async listLocations(): Promise<HotelLocation[]> {
    const rows = await this.sql.unsafe<Row[]>(
      `SELECT administrative_unit_id FROM hotel_locations WHERE enabled = true ORDER BY administrative_unit_id`,
    );
    const locations = await Promise.all(
      rows.map((row) => this.location(stringValue(row.administrative_unit_id))),
    );
    return locations.filter((item): item is HotelLocation => item !== null);
  }

  private async toResponse(row: Row): Promise<HotelApplicationResponse> {
    const response = toApplicationResponse(row);
    if (row.status === 'draft' && response.content.administrativeUnitId) {
      const [enabled] = await this.sql.unsafe<Row[]>(
        `SELECT administrative_unit_id FROM hotel_locations WHERE administrative_unit_id = $1 AND enabled = true`,
        [response.content.administrativeUnitId],
      );
      response.location = enabled
        ? await this.location(response.content.administrativeUnitId)
        : null;
    }
    return response;
  }

  async getAuthorizationContext(actor: RegistryActor): Promise<AuthorizationContext> {
    await this.assertNoIssuerCollision(actor);
    await this.resolveProfile(actor, false);
    const rows = await this.sql.unsafe<Row[]>(
      `
        SELECT profile.active AS profile_active,
               membership.id AS membership_id, membership.organization_id,
               membership.active AS membership_active,
               grant_row.id AS grant_id, grant_row.capability,
               grant_row.organization_id AS grant_organization_id,
               grant_row.active AS grant_active, grant_row.demo_only,
               grant_row.production_decision_enabled,
               grant_scope.administrative_unit_id, grant_scope.include_descendants
        FROM user_profiles profile
        LEFT JOIN memberships membership ON membership.user_profile_id = profile.id
        LEFT JOIN access_grants grant_row ON grant_row.membership_id = membership.id
        LEFT JOIN grant_scopes grant_scope ON grant_scope.grant_id = grant_row.id
        WHERE profile.external_issuer = $1 AND profile.external_subject_id = $2
      `,
      [actor.issuer, actor.subjectId],
    );
    const isActive = rows.some((row) => row.profile_active === true);
    const memberships = new Map<string, AuthorizationMembership>();
    const grants = new Map<string, AuthorizationGrant>();
    if (isActive) {
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

  async createApplication(
    actor: RegistryActor,
    content: HotelApplicationContent,
  ): Promise<HotelApplicationResponse> {
    const profileId = await this.resolveProfile(actor, true);
    const [created] = await this.sql.unsafe<Row[]>(
      `INSERT INTO hotel_applications (applicant_profile_id, draft_content)
       VALUES ($1, $2::text::jsonb) RETURNING id`,
      [profileId, JSON.stringify(content)],
    );
    if (!created?.id) throw new Error('Created hotel application insert returned no row.');
    const [row] = await this.sql.unsafe<Row[]>(`${applicationSelect} WHERE application.id = $1`, [
      stringValue(created.id),
    ]);
    if (!row) throw new Error('Created hotel application could not be loaded.');
    await this.appendAudit(
      actor,
      null,
      'hotel.application.created',
      stringValue(row.id),
      null,
      null,
      { status: 'draft' },
    );
    return this.toResponse(row);
  }

  async listOwnedApplications(actor: RegistryActor): Promise<HotelApplicationResponse[]> {
    const profileId = await this.resolveProfile(actor, false);
    if (!profileId) return [];
    const rows = await this.sql.unsafe<Row[]>(
      `${applicationSelect} WHERE application.applicant_profile_id = $1 ORDER BY application.updated_at DESC, application.id`,
      [profileId],
    );
    return Promise.all(rows.map((row) => this.toResponse(row)));
  }

  async getOwnedApplication(
    actor: RegistryActor,
    applicationId: string,
  ): Promise<HotelApplicationResponse | null> {
    const profileId = await this.resolveProfile(actor, false);
    if (!profileId) return null;
    const [row] = await this.sql.unsafe<Row[]>(
      `${applicationSelect} WHERE application.id = $1 AND application.applicant_profile_id = $2`,
      [applicationId, profileId],
    );
    return row ? this.toResponse(row) : null;
  }

  async updateDraft(
    actor: RegistryActor,
    applicationId: string,
    expectedVersion: number,
    content: HotelApplicationContent,
  ): Promise<HotelApplicationResponse | null> {
    const profileId = await this.resolveProfile(actor, false);
    if (!profileId) return null;
    const row = await this.lockOwnedApplication(applicationId, profileId);
    if (!row) return null;
    assertVersion(row, expectedVersion);
    if (
      !['draft', 'changes_requested', 'approved'].includes(stringValue(row.status)) ||
      row.admission_status === 'declined'
    ) {
      throw conflict('This application is terminal and cannot be edited.');
    }
    await this.requireAdmittedWorkspaceGrant(actor, row, 'hotel:workspace:edit');
    await this.sql.unsafe(
      `UPDATE hotel_applications
       SET draft_content = $3::text::jsonb, status = 'draft',
           admission_status = CASE WHEN admission_status = 'admitted' THEN 'admitted' ELSE 'not_eligible' END,
           version = version + 1, updated_at = now()
       WHERE id = $1 AND applicant_profile_id = $2`,
      [applicationId, profileId, JSON.stringify(content)],
    );
    await this.appendAudit(
      actor,
      null,
      'hotel.application.draft_updated',
      applicationId,
      null,
      null,
      {
        expectedVersion,
      },
    );
    return this.loadApplication(applicationId);
  }

  async submitApplication(
    actor: RegistryActor,
    applicationId: string,
    expectedVersion: number,
  ): Promise<HotelApplicationResponse | null> {
    const profileId = await this.resolveProfile(actor, false);
    if (!profileId) return null;
    const row = await this.lockOwnedApplication(applicationId, profileId);
    if (!row) return null;
    assertVersion(row, expectedVersion);
    if (
      !['draft', 'changes_requested', 'approved'].includes(stringValue(row.status)) ||
      row.admission_status === 'declined'
    ) {
      throw conflict('This application is terminal and cannot be submitted.');
    }
    await this.requireAdmittedWorkspaceGrant(actor, row, 'hotel:workspace:edit');
    // SHARE blocks all route writes, including inserts that would create ambiguity.
    await this.sql.unsafe(`LOCK TABLE hotel_location_routes IN SHARE MODE`);
    await this.sql.unsafe(`LOCK TABLE administrative_units IN SHARE MODE`);
    const content = jsonValue(row.draft_content) as HotelApplicationContent;
    const unitId = content.administrativeUnitId;
    if (!unitId) throw unavailableRoute();
    const [selected] = await this.sql.unsafe<Row[]>(
      `SELECT administrative_unit_id FROM hotel_locations
       WHERE administrative_unit_id = $1 AND enabled = true FOR SHARE`,
      [unitId],
    );
    const location = selected ? await this.location(unitId) : null;
    if (!location) throw unavailableRoute();
    const routes = await this.sql.unsafe<Row[]>(
      `SELECT bureau_organization_id FROM hotel_location_routes WHERE location_unit_id = $1 AND enabled = true`,
      [unitId],
    );
    if (routes.length !== 1) throw unavailableRoute();
    const route = {
      organizationId: stringValue(routes[0]!.bureau_organization_id),
      administrativeUnitId: unitId,
    };
    const [office] = await this.sql.unsafe<Row[]>(
      `SELECT id FROM organizations WHERE id = $1 AND is_synthetic = true
       AND organization_type = 'administrative' FOR SHARE`,
      [route.organizationId],
    );
    if (!office) throw unavailableRoute();
    const nextNumber = Number(row.current_version_number) + 1;
    const [version] = await this.sql.unsafe<Row[]>(
      `INSERT INTO hotel_application_versions
         (application_id, version_number, content, submitted_by_profile_id,
          location_unit_id, location_snapshot, bureau_organization_id, scope_unit_id)
       VALUES ($1, $2, $3::text::jsonb, $4, $5, $6::text::jsonb, $7, $5)
       RETURNING id`,
      [
        applicationId,
        nextNumber,
        JSON.stringify(content),
        profileId,
        unitId,
        JSON.stringify(location),
        route.organizationId,
      ],
    );
    if (!version?.id) throw new Error('Submitted hotel version insert returned no row.');
    const versionId = stringValue(version.id);
    await this.sql.unsafe(
      `INSERT INTO hotel_bureau_cases
         (application_id, application_version_id, bureau_organization_id, scope_unit_id, status)
       VALUES ($1, $2, $3, $4, 'in_review')`,
      [applicationId, versionId, route.organizationId, route.administrativeUnitId],
    );
    await this.sql.unsafe(
      `UPDATE hotel_applications
       SET current_submitted_version_id = $2, current_version_number = $3,
           status = 'submitted',
           admission_status = CASE WHEN admission_status = 'admitted' THEN 'admitted' ELSE 'not_eligible' END,
           version = version + 1, updated_at = now()
       WHERE id = $1`,
      [applicationId, versionId, nextNumber],
    );
    await this.appendAudit(
      actor,
      null,
      'hotel.application.submitted',
      applicationId,
      versionId,
      null,
      {
        applicationVersion: nextNumber,
        bureauRoute: route.organizationId,
      },
    );
    return this.loadApplication(applicationId);
  }

  async getBureauDecisionTarget(caseId: string): Promise<HotelDecisionTarget | null> {
    const [row] = await this.sql.unsafe<Row[]>(
      `SELECT bureau_case.bureau_organization_id, bureau_case.scope_unit_id,
              bureau_org.is_synthetic AS organization_synthetic,
              bureau_org.organization_type, scope_unit.is_synthetic AS unit_synthetic,
              application.is_synthetic
       FROM hotel_bureau_cases bureau_case
       JOIN organizations bureau_org ON bureau_org.id = bureau_case.bureau_organization_id
       JOIN administrative_units scope_unit ON scope_unit.id = bureau_case.scope_unit_id
       JOIN hotel_applications application ON application.id = bureau_case.application_id
       WHERE bureau_case.id = $1`,
      [caseId],
    );
    return row &&
      row.organization_synthetic === true &&
      row.unit_synthetic === true &&
      row.is_synthetic === true &&
      row.organization_type === 'administrative'
      ? {
          organizationId: stringValue(row.bureau_organization_id),
          administrativeUnitId: stringValue(row.scope_unit_id),
          resourceIsSynthetic: true,
        }
      : null;
  }

  async listBureauCases(actor: RegistryActor): Promise<HotelBureauCaseResponse[]> {
    const rows = await this.sql.unsafe<Row[]>(
      `SELECT bureau_case.id AS case_id, bureau_case.status AS case_status, application.id AS application_id
       FROM hotel_bureau_cases bureau_case
       JOIN hotel_applications application ON application.id = bureau_case.application_id
       WHERE bureau_case.status IN ('submitted', 'in_review')
         AND application.status = 'submitted'
         AND application.current_submitted_version_id = bureau_case.application_version_id
         AND application.is_synthetic = true
         AND EXISTS (SELECT 1 FROM organizations org WHERE org.id = bureau_case.bureau_organization_id AND org.is_synthetic = true AND org.organization_type = 'administrative')
         AND EXISTS (SELECT 1 FROM administrative_units unit WHERE unit.id = bureau_case.scope_unit_id AND unit.is_synthetic = true)
       ORDER BY bureau_case.created_at, bureau_case.id`,
    );
    const results: HotelBureauCaseResponse[] = [];
    for (const row of rows) {
      const item = await this.getBureauCase(actor, stringValue(row.case_id));
      if (item) results.push(item);
    }
    return results;
  }

  async getBureauCase(
    actor: RegistryActor,
    caseId: string,
  ): Promise<HotelBureauCaseResponse | null> {
    const target = await this.getBureauDecisionTarget(caseId);
    if (!target?.organizationId || !target.administrativeUnitId) return null;
    const decision = authorize(await this.getAuthorizationContext(actor), {
      capability: 'hotel:application:bureau:read',
      organizationId: target.organizationId,
      administrativeUnitId: target.administrativeUnitId,
      administrativeUnitAncestorIds: await this.getAdministrativeUnitAncestorIds(
        target.administrativeUnitId,
      ),
      resourceIsSynthetic: target.resourceIsSynthetic,
    });
    if (!decision.allowed) return null;
    const [row] = await this.sql.unsafe<Row[]>(
      `${applicationSelect}
       JOIN hotel_bureau_cases bureau_case ON bureau_case.application_id = application.id
        AND bureau_case.application_version_id = application.current_submitted_version_id
       WHERE bureau_case.id = $1 AND application.status <> 'draft'`,
      [caseId],
    );
    if (!row) return null;
    const [caseRow] = await this.sql.unsafe<Row[]>(
      `SELECT status FROM hotel_bureau_cases WHERE id = $1`,
      [caseId],
    );
    return {
      ...(await this.toResponse(row)),
      caseId,
      caseStatus: stringValue(caseRow!.status) as HotelBureauCaseResponse['caseStatus'],
    };
  }

  async decideBureauCase(
    actor: RegistryActor,
    caseId: string,
    expectedVersion: number,
    decision: 'approve' | 'request_changes' | 'reject',
    reason: string,
    route: HotelBureauRoute,
  ): Promise<HotelApplicationResponse | null> {
    const [caseRow] = await this.sql.unsafe<Row[]>(
      `SELECT bureau_case.id, bureau_case.status AS case_status, bureau_case.application_id,
              bureau_case.application_version_id, bureau_case.bureau_organization_id,
              bureau_case.scope_unit_id, version.version_number, version.submitted_by_profile_id,
              application.is_synthetic AS application_synthetic,
              bureau_org.is_synthetic AS organization_synthetic,
              bureau_org.organization_type, bureau_unit.is_synthetic AS unit_synthetic
       FROM hotel_bureau_cases bureau_case
       JOIN hotel_application_versions version ON version.id = bureau_case.application_version_id
       JOIN hotel_applications application ON application.id = bureau_case.application_id
       JOIN organizations bureau_org ON bureau_org.id = bureau_case.bureau_organization_id
       JOIN administrative_units bureau_unit ON bureau_unit.id = bureau_case.scope_unit_id
       WHERE bureau_case.id = $1 AND bureau_case.bureau_organization_id = $2
         AND bureau_case.scope_unit_id = $3
       FOR UPDATE OF bureau_case`,
      [caseId, route.organizationId, route.administrativeUnitId],
    );
    if (!caseRow) return null;
    const application = await this.lockApplication(stringValue(caseRow.application_id));
    if (!application) return null;
    if (
      stringValue(application.current_submitted_version_id) !==
      stringValue(caseRow.application_version_id)
    ) {
      throw conflict('This Bureau case is for a superseded application version.');
    }
    assertVersion(application, expectedVersion);
    if (!['submitted', 'in_review'].includes(stringValue(caseRow.case_status)))
      throw conflict('This Bureau case already has a final decision.');
    if (
      application.is_synthetic !== true ||
      caseRow.application_synthetic !== true ||
      caseRow.organization_synthetic !== true ||
      caseRow.unit_synthetic !== true ||
      caseRow.organization_type !== 'administrative'
    )
      throw forbidden('non-synthetic-application');
    const context = await this.getAuthorizationContext(actor);
    const authorization = authorize(context, {
      capability: 'hotel:application:bureau:decide',
      organizationId: route.organizationId,
      administrativeUnitId: route.administrativeUnitId,
      administrativeUnitAncestorIds: await this.getAdministrativeUnitAncestorIds(
        route.administrativeUnitId,
      ),
      resourceIsSynthetic: true,
    });
    if (!authorization.allowed) throw forbidden(authorization.reason);
    const reviewerProfileId = await this.resolveProfile(actor, false);
    if (!reviewerProfileId) throw forbidden('missing-profile');
    if (reviewerProfileId === stringValue(caseRow.submitted_by_profile_id)) {
      throw forbidden('submitter-cannot-decide');
    }
    await this.sql.unsafe(
      `INSERT INTO hotel_bureau_decisions
         (case_id, application_version_id, reviewer_profile_id, reviewer_membership_id, decision, reason)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        caseId,
        stringValue(caseRow.application_version_id),
        reviewerProfileId,
        authorization.membershipId,
        decision,
        reason,
      ],
    );
    await this.sql.unsafe(
      'UPDATE hotel_bureau_cases SET status = $2, version = version + 1 WHERE id = $1',
      [
        caseId,
        decision === 'approve'
          ? 'approved'
          : decision === 'request_changes'
            ? 'changes_requested'
            : 'rejected',
      ],
    );
    await this.sql.unsafe(
      `UPDATE hotel_applications
       SET status = $2,
           admission_status = CASE
             WHEN admission_status = 'admitted' THEN 'admitted'
             WHEN $2 = 'approved' THEN 'pending'
             ELSE 'not_eligible'
           END,
           version = version + 1, updated_at = now()
       WHERE id = $1`,
      [
        stringValue(caseRow.application_id),
        decision === 'approve'
          ? 'approved'
          : decision === 'request_changes'
            ? 'changes_requested'
            : 'rejected',
      ],
    );
    await this.appendAudit(
      actor,
      authorization.membershipId,
      `hotel.bureau.${decision}`,
      stringValue(caseRow.application_id),
      stringValue(caseRow.application_version_id),
      null,
      {
        applicationVersion: Number(caseRow.version_number),
        reason,
      },
    );
    return this.loadApplication(stringValue(caseRow.application_id));
  }

  async getAdmissionDecisionTarget(applicationId: string): Promise<HotelDecisionTarget | null> {
    const [row] = await this.sql.unsafe<Row[]>(
      `SELECT application.is_synthetic
       FROM hotel_applications application
       JOIN hotel_application_versions version ON version.id = application.current_submitted_version_id
       JOIN hotel_bureau_cases bureau_case
         ON bureau_case.application_version_id = version.id AND bureau_case.application_id = application.id
       JOIN hotel_bureau_decisions bureau_decision
         ON bureau_decision.case_id = bureau_case.id AND bureau_decision.decision = 'approve'
       JOIN organizations bureau_org ON bureau_org.id = bureau_case.bureau_organization_id AND bureau_org.is_synthetic = true AND bureau_org.organization_type = 'administrative'
       JOIN administrative_units bureau_unit ON bureau_unit.id = bureau_case.scope_unit_id AND bureau_unit.is_synthetic = true
       WHERE application.id = $1 AND application.status = 'approved'
         AND application.admission_status = 'pending' AND application.is_synthetic = true`,
      [applicationId],
    );
    return row
      ? {
          organizationId: null,
          administrativeUnitId: null,
          resourceIsSynthetic: row.is_synthetic === true,
        }
      : null;
  }

  async listAdmissionQueue(
    administratorOrganizationId: string,
  ): Promise<HotelApplicationResponse[]> {
    const routeExists = await this.getConfiguredAdmissionRoute(administratorOrganizationId);
    if (!routeExists) return [];
    const rows = await this.sql.unsafe<Row[]>(
      `${applicationSelect}
       JOIN hotel_bureau_cases bureau_case
         ON bureau_case.application_id = application.id
        AND bureau_case.application_version_id = application.current_submitted_version_id
       JOIN hotel_bureau_decisions bureau_decision
         ON bureau_decision.case_id = bureau_case.id AND bureau_decision.decision = 'approve'
       JOIN organizations bureau_org ON bureau_org.id = bureau_case.bureau_organization_id AND bureau_org.is_synthetic = true AND bureau_org.organization_type = 'administrative'
       JOIN administrative_units bureau_unit ON bureau_unit.id = bureau_case.scope_unit_id AND bureau_unit.is_synthetic = true
       WHERE application.status = 'approved' AND application.admission_status = 'pending'
         AND application.is_synthetic = true
       ORDER BY application.updated_at, application.id`,
    );
    return Promise.all(rows.map((row) => this.toResponse(row)));
  }

  async decideAdmission(
    actor: RegistryActor,
    applicationId: string,
    expectedVersion: number,
    decision: HotelAdmissionDecision,
    reason: string,
    administratorOrganizationId: string,
  ): Promise<HotelApplicationResponse | null> {
    const application = await this.lockApplication(applicationId);
    if (!application) return null;
    assertVersion(application, expectedVersion);
    if (application.status !== 'approved' || application.admission_status !== 'pending') {
      throw conflict('Only a current Bureau-approved version can enter Administrator admission.');
    }
    if (
      application.is_synthetic !== true ||
      !(await this.getConfiguredAdmissionRoute(administratorOrganizationId))
    ) {
      throw forbidden('invalid-synthetic-administrator-organization');
    }
    const [applicant] = await this.sql.unsafe<Row[]>(
      `SELECT active FROM user_profiles WHERE id = $1 FOR SHARE`,
      [stringValue(application.applicant_profile_id)],
    );
    if (!applicant || applicant.active !== true)
      throw conflict('The applicant profile is inactive.');
    const versionId = stringValue(application.current_submitted_version_id);
    const [approved] = await this.sql.unsafe<Row[]>(
      `SELECT bureau_decision.reviewer_profile_id
       FROM hotel_bureau_cases bureau_case
       JOIN hotel_bureau_decisions bureau_decision ON bureau_decision.case_id = bureau_case.id
       WHERE bureau_case.application_id = $1 AND bureau_case.application_version_id = $2
         AND bureau_decision.decision = 'approve'`,
      [applicationId, versionId],
    );
    if (!approved) throw conflict('The current application version has no Bureau approval.');
    const context = await this.getAuthorizationContext(actor);
    const authorization = authorize(context, {
      capability: 'hotel:application:admin:decide',
      organizationId: administratorOrganizationId,
      resourceIsSynthetic: true,
    });
    if (!authorization.allowed) throw forbidden(authorization.reason);
    const administratorProfileId = await this.resolveProfile(actor, false);
    if (!administratorProfileId) throw forbidden('missing-profile');
    if (administratorProfileId === stringValue(application.applicant_profile_id)) {
      throw forbidden('applicant-cannot-admit-own-application');
    }

    await this.sql.unsafe(
      `INSERT INTO hotel_admission_decisions
         (application_id, application_version_id, administrator_profile_id, administrator_membership_id, decision, reason)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        applicationId,
        versionId,
        administratorProfileId,
        authorization.membershipId,
        decision,
        reason,
      ],
    );

    if (decision === 'admit') {
      const providerOrganizationId = `hotel-provider-${randomUUID()}`;
      const [organization] = await this.sql.unsafe<Row[]>(
        `INSERT INTO organizations (id, display_name, organization_type, level, administrative_unit_id, is_synthetic)
         VALUES ($1, 'Synthetic hotel provider workspace', 'provider', NULL, NULL, true)
         RETURNING id`,
        [providerOrganizationId],
      );
      if (!organization?.id) throw new Error('Provider organization insert returned no row.');
      const [membership] = await this.sql.unsafe<Row[]>(
        `INSERT INTO memberships (user_profile_id, organization_id, label)
         VALUES ($1, $2, 'Synthetic hotel applicant manager') RETURNING id`,
        [stringValue(application.applicant_profile_id), providerOrganizationId],
      );
      if (!membership?.id) throw new Error('Provider membership insert returned no row.');
      for (const capability of ['hotel:workspace:read', 'hotel:workspace:edit']) {
        const inserted = await this.sql.unsafe<Row[]>(
          `INSERT INTO access_grants
             (membership_id, capability, organization_id, active, demo_only, production_decision_enabled)
           VALUES ($1, $2, $3, true, true, false) RETURNING id`,
          [stringValue(membership.id), capability, providerOrganizationId],
        );
        if (inserted.length !== 1) throw new Error('Provider access grant insert returned no row.');
      }
      await this.sql.unsafe(
        `UPDATE hotel_applications
         SET admission_status = 'admitted', provider_organization_id = $2,
             version = version + 1, updated_at = now() WHERE id = $1`,
        [applicationId, providerOrganizationId],
      );
    } else {
      await this.sql.unsafe(
        `UPDATE hotel_applications SET admission_status = 'declined', version = version + 1,
         updated_at = now() WHERE id = $1`,
        [applicationId],
      );
    }
    await this.appendAudit(
      actor,
      authorization.membershipId,
      `hotel.admission.${decision}`,
      applicationId,
      versionId,
      null,
      {
        applicationVersion: Number(application.current_version_number),
        reason,
        providerOrganizationCreated: decision === 'admit',
      },
    );
    return this.loadApplication(applicationId);
  }

  async getProviderWorkspace(
    actor: RegistryActor,
    applicationId: string,
  ): Promise<HotelApplicationResponse | null> {
    const profileId = await this.resolveProfile(actor, false);
    if (!profileId) return null;
    const [row] = await this.sql.unsafe<Row[]>(
      `SELECT application.id, provider.id
       FROM hotel_applications application
       JOIN memberships provider_membership
         ON provider_membership.user_profile_id = application.applicant_profile_id
        AND provider_membership.active = true
       JOIN organizations provider
         ON provider.id = provider_membership.organization_id
        AND provider.organization_type = 'provider'
        AND provider.is_synthetic = true
       JOIN access_grants provider_grant
         ON provider_grant.membership_id = provider_membership.id
        AND provider_grant.organization_id = provider.id
        AND provider_grant.capability = 'hotel:workspace:read'
        AND provider_grant.active = true
        AND provider_grant.demo_only = true
        AND provider_grant.production_decision_enabled = false
       WHERE application.id = $1 AND application.applicant_profile_id = $2
         AND application.provider_organization_id = provider.id`,
      [applicationId, profileId],
    );
    return row ? this.loadApplication(applicationId) : null;
  }

  async appendDenial(
    actor: RegistryActor,
    action: string,
    targetId: string | null,
    reason: string,
  ): Promise<void> {
    await this.appendAudit(actor, null, action, targetId, null, reason, {}, 'denied');
  }

  private async resolveProfile(actor: RegistryActor, create: boolean): Promise<string | null> {
    await this.assertNoIssuerCollision(actor);
    const [existing] = await this.sql.unsafe<Row[]>(
      `SELECT id, active FROM user_profiles WHERE external_issuer = $1 AND external_subject_id = $2`,
      [actor.issuer, actor.subjectId],
    );
    if (existing) {
      if (existing.active !== true) throw forbidden('inactive-profile');
      return stringValue(existing.id);
    }
    if (!create) return null;
    const [created] = await this.sql.unsafe<Row[]>(
      `INSERT INTO user_profiles (external_issuer, external_subject_id)
       VALUES ($1, $2) ON CONFLICT (external_issuer, external_subject_id) DO NOTHING RETURNING id`,
      [actor.issuer, actor.subjectId],
    );
    if (created?.id) return stringValue(created.id);
    const [raced] = await this.sql.unsafe<Row[]>(
      `SELECT id, active FROM user_profiles WHERE external_issuer = $1 AND external_subject_id = $2`,
      [actor.issuer, actor.subjectId],
    );
    if (!raced || raced.active !== true)
      throw conflict('Identity profile could not be resolved safely.');
    return stringValue(raced.id);
  }

  private async assertNoIssuerCollision(actor: RegistryActor): Promise<void> {
    const aliases = [
      ...new Set((actor.issuerAliases ?? []).filter((issuer) => issuer !== actor.issuer)),
    ];
    if (!aliases.length) return;
    const [collision] = await this.sql.unsafe<Row[]>(
      `SELECT id FROM user_profiles
       WHERE external_subject_id = $1 AND external_issuer = ANY($2::text[]) LIMIT 1`,
      [actor.subjectId, aliases],
    );
    if (collision)
      throw conflict(
        'Identity issuer alias collides with an existing profile; ownership was not changed.',
      );
  }

  private async lockOwnedApplication(
    applicationId: string,
    profileId: string,
  ): Promise<Row | null> {
    const [row] = await this.sql.unsafe<Row[]>(
      `SELECT id, applicant_profile_id, status, admission_status, current_version_number,
              current_submitted_version_id, draft_content, version, provider_organization_id,
              is_synthetic
       FROM hotel_applications WHERE id = $1 AND applicant_profile_id = $2 FOR UPDATE`,
      [applicationId, profileId],
    );
    return row ?? null;
  }

  private async lockApplication(applicationId: string): Promise<Row | null> {
    const [row] = await this.sql.unsafe<Row[]>(
      `SELECT id, applicant_profile_id, status, admission_status, current_version_number,
              current_submitted_version_id, draft_content, version, provider_organization_id,
              is_synthetic
       FROM hotel_applications WHERE id = $1 FOR UPDATE`,
      [applicationId],
    );
    return row ?? null;
  }

  private async loadApplication(applicationId: string): Promise<HotelApplicationResponse | null> {
    const [row] = await this.sql.unsafe<Row[]>(`${applicationSelect} WHERE application.id = $1`, [
      applicationId,
    ]);
    return row ? this.toResponse(row) : null;
  }

  private async getConfiguredAdmissionRoute(organizationId: string): Promise<boolean> {
    const [row] = await this.sql.unsafe<Row[]>(
      `SELECT id FROM organizations WHERE id = $1 AND organization_type = 'platform' AND is_synthetic = true`,
      [organizationId],
    );
    return Boolean(row);
  }

  private async requireAdmittedWorkspaceGrant(
    actor: RegistryActor,
    application: Row,
    capability: 'hotel:workspace:edit',
  ): Promise<void> {
    if (application.admission_status !== 'admitted') return;
    if (!application.provider_organization_id)
      throw forbidden('admitted-provider-organization-missing');
    const decision = authorize(await this.getAuthorizationContext(actor), {
      capability,
      organizationId: stringValue(application.provider_organization_id),
      resourceIsSynthetic: application.is_synthetic === true,
    });
    if (!decision.allowed) throw forbidden(decision.reason);
  }

  private async appendAudit(
    actor: RegistryActor,
    membershipId: string | null,
    action: string,
    targetId: string | null,
    revisionId: string | null,
    reasonCode: string | null,
    details: Record<string, string | number | boolean | null>,
    outcome: 'allowed' | 'denied' = 'allowed',
  ): Promise<void> {
    await this.sql.unsafe(
      `INSERT INTO audit_events
         (actor_issuer, actor_subject_id, actor_membership_id, action, outcome,
          target_resource_id, target_revision_id, reason_code, policy_version, details)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::text::jsonb)`,
      [
        actor.issuer,
        actor.subjectId,
        membershipId,
        action,
        outcome,
        targetId,
        revisionId,
        reasonCode,
        POLICY_VERSION,
        JSON.stringify(details),
      ],
    );
  }
}

function toApplicationResponse(row: Row): HotelApplicationResponse {
  return {
    id: stringValue(row.id),
    status: stringValue(row.status) as HotelApplicationResponse['status'],
    admissionStatus: stringValue(
      row.admission_status,
    ) as HotelApplicationResponse['admissionStatus'],
    currentVersion: Number(row.current_version_number),
    currentVersionId: nullableString(row.response_version_id),
    content: jsonValue(row.response_content) as HotelApplicationContent,
    location:
      row.status === 'draft'
        ? null
        : ((jsonValue(row.location_snapshot) as HotelLocation | null) ?? null),
    bureauDecision: bureauDecision(row.bureau_decision),
    admissionDecision: admissionDecision(row.admission_decision),
    workspaceAccess: row.admission_status === 'admitted' ? 'private_only' : 'not_admitted',
    notice: PUBLIC_NOTICE,
    version: Number(row.version),
  };
}

function parseDecision(value: unknown): Record<string, unknown> | null {
  if (value === null || value === undefined) return null;
  return jsonValue(value) as Record<string, unknown>;
}

function bureauDecision(value: unknown): HotelBureauDecisionSummary | null {
  const record = parseDecision(value);
  if (!record) return null;
  return {
    decision: stringValue(record.decision) as HotelApplicationDecision,
    applicationVersion: Number(record.applicationVersion),
    reason: stringValue(record.reason),
    decidedAt: new Date(String(record.decidedAt)).toISOString(),
  };
}

function admissionDecision(value: unknown): HotelAdmissionDecisionSummary | null {
  const record = parseDecision(value);
  if (!record) return null;
  return {
    decision: stringValue(record.decision) as HotelAdmissionDecision,
    applicationVersion: Number(record.applicationVersion),
    reason: stringValue(record.reason),
    decidedAt: new Date(String(record.decidedAt)).toISOString(),
  };
}

function assertVersion(row: Row, expected: number): void {
  if (!Number.isInteger(expected) || Number(row.version) !== expected) {
    throw conflict('The application changed. Reload it before continuing.');
  }
}

function stringValue(value: unknown): string {
  if (value === null || value === undefined) throw new Error('Unexpected empty database value.');
  return String(value);
}

function nullableString(value: unknown): string | null {
  return value === null || value === undefined ? null : String(value);
}

function jsonValue(value: unknown): unknown {
  return typeof value === 'string' ? JSON.parse(value) : value;
}

function conflict(reason: string): HotelOnboardingError {
  return new HotelOnboardingError('conflict', reason);
}

function forbidden(reason: string): HotelOnboardingError {
  return new HotelOnboardingError('forbidden', reason);
}

function unavailableRoute(): HotelOnboardingError {
  return new HotelOnboardingError(
    'unavailable',
    'The selected synthetic location has no unique available Bureau route.',
  );
}
