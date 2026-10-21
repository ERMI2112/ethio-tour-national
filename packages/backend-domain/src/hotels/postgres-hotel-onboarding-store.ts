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
  HotelLocationSearchQuery,
  HotelLocationSearchResponse,
  HotelLocationSearchResult,
  HotelSubmittedLocation,
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
         current_version.submitted_location_snapshot, current_version.geography_release_id,
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
         (SELECT decided_version.version_number
          FROM hotel_admission_decisions admission_decision
          JOIN hotel_application_versions decided_version
            ON decided_version.id = admission_decision.application_version_id
          WHERE admission_decision.application_id = application.id
            AND admission_decision.decision = 'admit'
          ORDER BY admission_decision.created_at DESC LIMIT 1) AS admitted_version,
         COALESCE((
           SELECT jsonb_agg(jsonb_build_object(
             'decision', bureau_decision.decision,
             'applicationVersion', decided_version.version_number,
             'reason', bureau_decision.reason,
             'decidedAt', bureau_decision.created_at
           ) ORDER BY decided_version.version_number DESC, bureau_decision.created_at DESC)
           FROM hotel_bureau_cases bureau_case
           JOIN hotel_bureau_decisions bureau_decision ON bureau_decision.case_id = bureau_case.id
           JOIN hotel_application_versions decided_version
             ON decided_version.id = bureau_case.application_version_id
           WHERE bureau_case.application_id = application.id
             AND bureau_case.application_version_id IS DISTINCT FROM application.current_submitted_version_id
         ), '[]'::jsonb) AS historical_bureau_decisions,
         COALESCE((
           SELECT jsonb_agg(jsonb_build_object(
             'decision', admission_decision.decision,
             'applicationVersion', decided_version.version_number,
             'reason', admission_decision.reason,
             'decidedAt', admission_decision.created_at
           ) ORDER BY decided_version.version_number DESC, admission_decision.created_at DESC)
           FROM hotel_admission_decisions admission_decision
           JOIN hotel_application_versions decided_version
             ON decided_version.id = admission_decision.application_version_id
           WHERE admission_decision.application_id = application.id
             AND admission_decision.application_version_id IS DISTINCT FROM application.current_submitted_version_id
         ), '[]'::jsonb) AS historical_admission_decisions,
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

  async getAdministrativeUnitAncestorIds(unitId: string): Promise<string[]> {
    // Legacy case authorization is exact-scope only; current ancestry is not historical evidence.
    void unitId;
    return [];
  }

  async getHotelGeographyAncestorUnitIds(
    geographyReleaseId: string,
    unitId: string,
  ): Promise<string[]> {
    const rows = await this.sql.unsafe<Row[]>(
      `WITH RECURSIVE chain AS (
         SELECT revision.id, revision.unit_id, revision.parent_revision_id,
                ARRAY[revision.id] AS path
         FROM hotel_geography_unit_revisions revision
         WHERE revision.geography_release_id = $1 AND revision.unit_id = $2
         UNION ALL
         SELECT parent.id, parent.unit_id, parent.parent_revision_id, chain.path || parent.id
         FROM hotel_geography_unit_revisions parent
         JOIN chain ON parent.id = chain.parent_revision_id
         WHERE parent.geography_release_id = $1 AND NOT parent.id = ANY(chain.path)
       ) SELECT unit_id FROM chain WHERE unit_id <> $2 ORDER BY cardinality(path) DESC`,
      [geographyReleaseId, unitId],
    );
    return rows.map((row) => stringValue(row.unit_id));
  }

  private async versionedLocation(
    geographyReleaseId: string,
    unitId: string,
    unitRevisionId: string,
  ): Promise<HotelSubmittedLocation | null> {
    const rows = await this.sql.unsafe<Row[]>(
      `WITH RECURSIVE chain AS (
         SELECT revision.id, revision.unit_id, revision.unit_type, revision.parent_revision_id,
                ARRAY[revision.id] AS path, 0 AS depth
         FROM hotel_geography_unit_revisions revision
         WHERE revision.geography_release_id = $1
           AND revision.unit_id = $2 AND revision.id = $3
         UNION ALL
         SELECT parent.id, parent.unit_id, parent.unit_type, parent.parent_revision_id,
                chain.path || parent.id, chain.depth + 1
         FROM hotel_geography_unit_revisions parent
         JOIN chain ON parent.id = chain.parent_revision_id
         WHERE parent.geography_release_id = $1 AND NOT parent.id = ANY(chain.path)
       )
       SELECT chain.id AS unit_revision_id, chain.unit_id, chain.unit_type,
              display_name.value AS display_name
       FROM chain
       JOIN LATERAL (
         SELECT name.value FROM hotel_geography_names name
         WHERE name.geography_release_id = $1 AND name.unit_revision_id = chain.id
           AND name.name_kind = 'display'
         ORDER BY CASE WHEN lower(name.language_tag) = 'en' THEN 0 ELSE 1 END,
                  name.language_tag COLLATE "C", COALESCE(name.script, '') COLLATE "C",
                  name.normalized_value COLLATE "C", name.id
         LIMIT 1
       ) display_name ON true
       ORDER BY chain.depth DESC`,
      [geographyReleaseId, unitId, unitRevisionId],
    );
    if (!rows.length || rows.some((row) => !row.display_name)) return null;
    const hierarchy = rows.map((row) => ({
      unitId: stringValue(row.unit_id),
      unitRevisionId: stringValue(row.unit_revision_id),
      unitType: stringValue(row.unit_type),
      displayName: stringValue(row.display_name),
    }));
    const selected = hierarchy[hierarchy.length - 1];
    if (!selected || selected.unitId !== unitId || selected.unitRevisionId !== unitRevisionId) {
      return null;
    }
    return {
      geographyReleaseId,
      unitId,
      unitRevisionId,
      unitType: selected.unitType,
      displayName: selected.displayName,
      hierarchy,
    };
  }

  async listLocations(query: HotelLocationSearchQuery): Promise<HotelLocationSearchResponse> {
    const [active] = await this.sql.unsafe<Row[]>(
      `SELECT geography.id AS geography_release_id, geography.source_edition,
              geography.effective_from, geography.synthetic AS geography_synthetic,
              geography.validation_status, geography.activated_at AS geography_activated_at,
              routing.id AS routing_release_id, routing.synthetic AS routing_synthetic,
              routing.activated_at AS routing_activated_at
       FROM hotel_active_release_pair active_pair
       JOIN hotel_geography_releases geography ON geography.id = active_pair.geography_release_id
       JOIN hotel_routing_releases routing
         ON routing.id = active_pair.routing_release_id
        AND routing.geography_release_id = active_pair.geography_release_id
       WHERE active_pair.singleton = 1`,
    );
    if (
      !active ||
      active.geography_synthetic !== true ||
      active.routing_synthetic !== true ||
      active.validation_status !== 'valid' ||
      !active.geography_activated_at ||
      !active.routing_activated_at
    ) {
      throw new HotelOnboardingError(
        'unavailable',
        'The location directory is unavailable.',
        'LOCATION_DIRECTORY_UNAVAILABLE',
      );
    }
    const releaseId = stringValue(active.geography_release_id);
    const normalizedQuery = (query.query ?? '').normalize('NFKC').trim().toLowerCase();
    const language = query.language ?? '';
    const cursor = query.cursor
      ? parseLocationCursor(query.cursor, releaseId, normalizedQuery, language)
      : null;
    const limit = query.limit ?? 20;
    const rows = await this.sql.unsafe<Row[]>(
      `WITH display_names AS (
         SELECT name.unit_revision_id, name.value, name.normalized_value,
                row_number() OVER (
                  PARTITION BY name.unit_revision_id
                  ORDER BY CASE
                    WHEN $3 = '' AND lower(name.language_tag) = 'en' THEN 0
                    WHEN lower(name.language_tag) = lower($3) THEN 0
                    WHEN lower(split_part(name.language_tag, '-', 1)) = lower(split_part($3, '-', 1)) THEN 1
                    WHEN lower(name.language_tag) = 'en' THEN 2 ELSE 3 END,
                    name.language_tag COLLATE "C", COALESCE(name.script, '') COLLATE "C",
                    name.normalized_value COLLATE "C", name.id
                ) AS label_rank
         FROM hotel_geography_names name
         WHERE name.geography_release_id = $1 AND name.name_kind = 'display'
       ), matched AS (
         SELECT revision.id AS unit_revision_id, revision.unit_id, revision.unit_type,
                display_names.value AS display_name,
                display_names.normalized_value AS sort_name,
                candidate.value AS matched_value,
                candidate.language_tag AS matched_language,
                candidate.script AS matched_script,
                row_number() OVER (
                  PARTITION BY revision.id
                  ORDER BY CASE
                    WHEN $3 = '' AND lower(candidate.language_tag) = 'en' THEN 0
                    WHEN lower(candidate.language_tag) = lower($3) THEN 0
                    WHEN lower(split_part(candidate.language_tag, '-', 1)) = lower(split_part($3, '-', 1)) THEN 1
                    WHEN lower(candidate.language_tag) = 'en' THEN 2 ELSE 3 END,
                    candidate.normalized_value COLLATE "C", candidate.id
                ) AS match_rank
         FROM hotel_geography_unit_revisions revision
         JOIN display_names ON display_names.unit_revision_id = revision.id
                           AND display_names.label_rank = 1
         JOIN hotel_geography_names candidate ON candidate.unit_revision_id = revision.id
         WHERE revision.geography_release_id = $1
           AND candidate.geography_release_id = $1
           AND (($2 = '' AND candidate.name_kind = 'display')
             OR ($2 <> '' AND position($2 in candidate.normalized_value) > 0))
       )
       SELECT * FROM matched
       WHERE match_rank = 1
         AND ($4::boolean = false OR
              (sort_name COLLATE "C", unit_id COLLATE "C", unit_revision_id::text COLLATE "C") >
              ($5::text COLLATE "C", $6::text COLLATE "C", $7::text COLLATE "C"))
       ORDER BY sort_name COLLATE "C", unit_id COLLATE "C", unit_revision_id::text COLLATE "C"
       LIMIT $8`,
      [
        releaseId,
        normalizedQuery,
        language,
        cursor !== null,
        cursor?.sortName ?? '',
        cursor?.unitId ?? '',
        cursor?.unitRevisionId ?? '',
        limit + 1,
      ],
    );
    const hasMore = rows.length > limit;
    const page = rows.slice(0, limit);
    const items: HotelLocationSearchResult[] = [];
    for (const row of page) {
      const unitId = stringValue(row.unit_id);
      const unitRevisionId = stringValue(row.unit_revision_id);
      const location = await this.versionedLocation(releaseId, unitId, unitRevisionId);
      if (!location) continue;
      items.push({
        unitId,
        unitRevisionId,
        unitType: stringValue(row.unit_type),
        displayName: stringValue(row.display_name),
        hierarchy: location.hierarchy,
        matchedName: {
          value: stringValue(row.matched_value),
          language: stringValue(row.matched_language),
          script: nullableString(row.matched_script),
        },
      });
    }
    const last = page.at(-1);
    return {
      directoryRelease: {
        id: releaseId,
        sourceEdition: stringValue(active.source_edition),
        effectiveFrom: active.effective_from
          ? new Date(String(active.effective_from)).toISOString()
          : null,
        synthetic: true,
      },
      items,
      nextCursor:
        hasMore && last
          ? encodeLocationCursor({
              releaseId,
              query: normalizedQuery,
              language,
              sortName: stringValue(last.sort_name),
              unitId: stringValue(last.unit_id),
              unitRevisionId: stringValue(last.unit_revision_id),
            })
          : null,
    };
  }

  private async toResponse(
    row: Row,
    includeDecisionHistory = false,
  ): Promise<HotelApplicationResponse> {
    const response = toApplicationResponse(row, includeDecisionHistory);
    if (row.status === 'draft') {
      const selection = response.content.locationSelection;
      if (selection) {
        response.location = await this.versionedLocation(
          selection.geographyReleaseId,
          selection.unitId,
          selection.unitRevisionId,
        );
        const [active] = await this.sql.unsafe<Row[]>(
          'SELECT geography_release_id FROM hotel_active_release_pair WHERE singleton = 1',
        );
        response.locationState =
          response.location && active?.geography_release_id === selection.geographyReleaseId
            ? 'current'
            : 'stale';
      } else if (response.content.administrativeUnitId) {
        // Do not reconstruct legacy draft hierarchy from mutable administrative units.
        response.location = null;
        response.locationState = 'legacy';
      }
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
               grant_scope.administrative_unit_id, grant_scope.include_descendants,
               grant_scope.hotel_geography_release_id, grant_scope.hotel_geography_unit_id
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
        } else if (row.hotel_geography_release_id && row.hotel_geography_unit_id) {
          grant.scopes = [
            ...grant.scopes,
            {
              hotelGeographyReleaseId: stringValue(row.hotel_geography_release_id),
              hotelGeographyUnitId: stringValue(row.hotel_geography_unit_id),
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
    return Promise.all(rows.map((row) => this.toResponse(row, true)));
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
    return row ? this.toResponse(row, true) : null;
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
    return this.loadApplication(applicationId, true);
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
    const content = jsonValue(row.draft_content) as HotelApplicationContent;
    const selection = content.locationSelection;
    if (!selection) throw unavailableRoute();
    // A single locked pointer keeps geography and routing releases in one snapshot.
    const [active] = await this.sql.unsafe<Row[]>(
      `SELECT active_pair.geography_release_id, active_pair.routing_release_id,
              geography.synthetic AS geography_synthetic, geography.validation_status,
              geography.activated_at AS geography_activated_at,
              routing.synthetic AS routing_synthetic, routing.activated_at AS routing_activated_at
       FROM hotel_active_release_pair active_pair
       JOIN hotel_geography_releases geography ON geography.id = active_pair.geography_release_id
       JOIN hotel_routing_releases routing
         ON routing.id = active_pair.routing_release_id
        AND routing.geography_release_id = active_pair.geography_release_id
       WHERE active_pair.singleton = 1
       FOR SHARE OF active_pair`,
    );
    if (
      !active ||
      active.geography_synthetic !== true ||
      active.routing_synthetic !== true ||
      active.validation_status !== 'valid' ||
      !active.geography_activated_at ||
      !active.routing_activated_at
    ) {
      throw unavailableRoute();
    }
    const geographyReleaseId = stringValue(active.geography_release_id);
    const routingReleaseId = stringValue(active.routing_release_id);
    if (selection.geographyReleaseId !== geographyReleaseId) {
      throw new HotelOnboardingError(
        'conflict',
        'The location directory changed. Search again and confirm the location before submitting.',
        'LOCATION_RELEASE_STALE',
      );
    }
    const submittedLocation = await this.versionedLocation(
      geographyReleaseId,
      selection.unitId,
      selection.unitRevisionId,
    );
    if (!submittedLocation) {
      throw new HotelOnboardingError(
        'conflict',
        'The selected location revision is stale or unavailable. Search again before submitting.',
        'LOCATION_RELEASE_STALE',
      );
    }
    const pathUnitIds = [
      ...(await this.getHotelGeographyAncestorUnitIds(geographyReleaseId, selection.unitId)),
      selection.unitId,
    ];
    const routes = await this.sql.unsafe<Row[]>(
      `SELECT rule.id AS routing_rule_id, rule.match_unit_id, rule.match_mode,
              rule.bureau_organization_id, rule.scope_unit_id,
              organization.is_synthetic AS organization_synthetic,
              organization.organization_type
       FROM hotel_routing_rules rule
       JOIN organizations organization ON organization.id = rule.bureau_organization_id
       WHERE rule.routing_release_id = $1 AND rule.geography_release_id = $2
         AND rule.enabled = true
         AND ((rule.match_mode = 'exact' AND rule.match_unit_id = $3)
           OR (rule.match_mode = 'descendants' AND rule.match_unit_id = ANY($4::text[])))`,
      [routingReleaseId, geographyReleaseId, selection.unitId, pathUnitIds],
    );
    if (
      routes.length !== 1 ||
      routes[0]!.organization_synthetic !== true ||
      routes[0]!.organization_type !== 'administrative' ||
      !pathUnitIds.includes(stringValue(routes[0]!.scope_unit_id))
    ) {
      throw unavailableRoute();
    }
    const route = {
      organizationId: stringValue(routes[0]!.bureau_organization_id),
      routingReleaseId,
      routingRuleId: stringValue(routes[0]!.routing_rule_id),
      geographyReleaseId,
      scopeUnitId: stringValue(routes[0]!.scope_unit_id),
    };
    const nextNumber = Number(row.current_version_number) + 1;
    const [version] = await this.sql.unsafe<Row[]>(
      `INSERT INTO hotel_application_versions
         (application_id, version_number, content, submitted_by_profile_id,
          bureau_organization_id, geography_release_id, location_revision_id,
          submitted_location_snapshot, routing_release_id, routing_rule_id, resolved_scope_unit_id)
       VALUES ($1, $2, $3::text::jsonb, $4, $5, $6, $7, $8::text::jsonb, $9, $10, $11)
       RETURNING id`,
      [
        applicationId,
        nextNumber,
        JSON.stringify(content),
        profileId,
        route.organizationId,
        geographyReleaseId,
        selection.unitRevisionId,
        JSON.stringify(submittedLocation),
        routingReleaseId,
        route.routingRuleId,
        route.scopeUnitId,
      ],
    );
    if (!version?.id) throw new Error('Submitted hotel version insert returned no row.');
    const versionId = stringValue(version.id);
    await this.sql.unsafe(
      `INSERT INTO hotel_bureau_cases
         (application_id, application_version_id, bureau_organization_id, scope_unit_id,
          geography_release_id, location_revision_id, routing_release_id, routing_rule_id,
          scope_geography_unit_id, status)
       VALUES ($1, $2, $3, NULL, $4, $5, $6, $7, $8, 'in_review')`,
      [
        applicationId,
        versionId,
        route.organizationId,
        geographyReleaseId,
        selection.unitRevisionId,
        routingReleaseId,
        route.routingRuleId,
        route.scopeUnitId,
      ],
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
        geographyReleaseId,
        routingReleaseId,
        routingRuleId: route.routingRuleId,
        scopeUnitId: route.scopeUnitId,
      },
    );
    return this.loadApplication(applicationId, true);
  }

  async getBureauDecisionTarget(caseId: string): Promise<HotelDecisionTarget | null> {
    const [row] = await this.sql.unsafe<Row[]>(
      `SELECT bureau_case.bureau_organization_id, bureau_case.scope_unit_id,
              bureau_case.geography_release_id, bureau_case.scope_geography_unit_id,
              bureau_case.routing_release_id, bureau_case.routing_rule_id,
              bureau_org.is_synthetic AS organization_synthetic,
              bureau_org.organization_type, scope_unit.is_synthetic AS unit_synthetic,
              geography.synthetic AS geography_synthetic,
              application.is_synthetic
       FROM hotel_bureau_cases bureau_case
       JOIN hotel_application_versions version
         ON version.id = bureau_case.application_version_id
        AND version.application_id = bureau_case.application_id
        AND version.bureau_organization_id = bureau_case.bureau_organization_id
        AND version.scope_unit_id IS NOT DISTINCT FROM bureau_case.scope_unit_id
        AND version.location_unit_id IS NOT DISTINCT FROM bureau_case.scope_unit_id
        AND version.geography_release_id IS NOT DISTINCT FROM bureau_case.geography_release_id
        AND version.location_revision_id IS NOT DISTINCT FROM bureau_case.location_revision_id
        AND version.routing_release_id IS NOT DISTINCT FROM bureau_case.routing_release_id
        AND version.routing_rule_id IS NOT DISTINCT FROM bureau_case.routing_rule_id
        AND version.resolved_scope_unit_id IS NOT DISTINCT FROM bureau_case.scope_geography_unit_id
       JOIN organizations bureau_org ON bureau_org.id = bureau_case.bureau_organization_id
       LEFT JOIN administrative_units scope_unit ON scope_unit.id = bureau_case.scope_unit_id
       LEFT JOIN hotel_geography_releases geography
         ON geography.id = bureau_case.geography_release_id
       JOIN hotel_applications application ON application.id = bureau_case.application_id
       WHERE bureau_case.id = $1`,
      [caseId],
    );
    return row &&
      row.organization_synthetic === true &&
      row.is_synthetic === true &&
      row.organization_type === 'administrative' &&
      ((row.geography_release_id && row.geography_synthetic === true) ||
        (!row.geography_release_id && row.unit_synthetic === true && row.scope_unit_id))
      ? {
          organizationId: stringValue(row.bureau_organization_id),
          administrativeUnitId: nullableString(row.scope_unit_id),
          geographyReleaseId: nullableString(row.geography_release_id),
          geographyUnitId: nullableString(row.scope_geography_unit_id),
          routingReleaseId: nullableString(row.routing_release_id),
          routingRuleId: nullableString(row.routing_rule_id),
          resourceIsSynthetic: true,
        }
      : null;
  }

  async listBureauCases(actor: RegistryActor): Promise<HotelBureauCaseResponse[]> {
    const rows = await this.sql.unsafe<Row[]>(
      `SELECT bureau_case.id AS case_id, bureau_case.status AS case_status, application.id AS application_id
       FROM hotel_bureau_cases bureau_case
       JOIN hotel_applications application ON application.id = bureau_case.application_id
       JOIN hotel_application_versions version
         ON version.id = bureau_case.application_version_id
        AND version.application_id = bureau_case.application_id
        AND version.bureau_organization_id = bureau_case.bureau_organization_id
        AND version.scope_unit_id IS NOT DISTINCT FROM bureau_case.scope_unit_id
        AND version.location_unit_id IS NOT DISTINCT FROM bureau_case.scope_unit_id
        AND version.geography_release_id IS NOT DISTINCT FROM bureau_case.geography_release_id
        AND version.location_revision_id IS NOT DISTINCT FROM bureau_case.location_revision_id
        AND version.routing_release_id IS NOT DISTINCT FROM bureau_case.routing_release_id
        AND version.routing_rule_id IS NOT DISTINCT FROM bureau_case.routing_rule_id
        AND version.resolved_scope_unit_id IS NOT DISTINCT FROM bureau_case.scope_geography_unit_id
       WHERE bureau_case.status IN ('submitted', 'in_review')
         AND application.status = 'submitted'
         AND application.current_submitted_version_id = bureau_case.application_version_id
         AND application.is_synthetic = true
         AND EXISTS (SELECT 1 FROM organizations org WHERE org.id = bureau_case.bureau_organization_id AND org.is_synthetic = true AND org.organization_type = 'administrative')
         AND ((bureau_case.geography_release_id IS NULL AND EXISTS (
                SELECT 1 FROM administrative_units unit
                WHERE unit.id = bureau_case.scope_unit_id AND unit.is_synthetic = true
              )) OR (bureau_case.geography_release_id IS NOT NULL AND EXISTS (
                SELECT 1 FROM hotel_geography_releases geography
                WHERE geography.id = bureau_case.geography_release_id
                  AND geography.synthetic = true AND geography.validation_status = 'valid'
              )))
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
    if (
      !target?.organizationId ||
      (!target.administrativeUnitId && !(target.geographyReleaseId && target.geographyUnitId))
    )
      return null;
    const decision = authorize(await this.getAuthorizationContext(actor), {
      capability: 'hotel:application:bureau:read',
      organizationId: target.organizationId,
      ...(target.administrativeUnitId
        ? { administrativeUnitId: target.administrativeUnitId, administrativeUnitAncestorIds: [] }
        : {
            hotelGeographyReleaseId: target.geographyReleaseId!,
            hotelGeographyUnitId: target.geographyUnitId!,
            hotelGeographyAncestorUnitIds: await this.getHotelGeographyAncestorUnitIds(
              target.geographyReleaseId!,
              target.geographyUnitId!,
            ),
          }),
      resourceIsSynthetic: target.resourceIsSynthetic,
    });
    if (!decision.allowed) return null;
    const [row] = await this.sql.unsafe<Row[]>(
      `${applicationSelect}
       JOIN hotel_bureau_cases bureau_case ON bureau_case.application_id = application.id
        AND bureau_case.application_version_id = application.current_submitted_version_id
       JOIN hotel_application_versions version
         ON version.id = bureau_case.application_version_id
        AND version.application_id = bureau_case.application_id
        AND version.bureau_organization_id = bureau_case.bureau_organization_id
        AND version.scope_unit_id IS NOT DISTINCT FROM bureau_case.scope_unit_id
        AND version.location_unit_id IS NOT DISTINCT FROM bureau_case.scope_unit_id
        AND version.geography_release_id IS NOT DISTINCT FROM bureau_case.geography_release_id
        AND version.location_revision_id IS NOT DISTINCT FROM bureau_case.location_revision_id
        AND version.routing_release_id IS NOT DISTINCT FROM bureau_case.routing_release_id
        AND version.routing_rule_id IS NOT DISTINCT FROM bureau_case.routing_rule_id
        AND version.resolved_scope_unit_id IS NOT DISTINCT FROM bureau_case.scope_geography_unit_id
       WHERE bureau_case.id = $1 AND application.status <> 'draft'`,
      [caseId],
    );
    if (!row) return null;
    const [caseRow] = await this.sql.unsafe<Row[]>(
      `SELECT status, geography_release_id, routing_release_id, routing_rule_id,
              bureau_organization_id, scope_geography_unit_id
       FROM hotel_bureau_cases WHERE id = $1`,
      [caseId],
    );
    const response = await this.toResponse(row);
    return {
      ...response,
      caseId,
      caseStatus: stringValue(caseRow!.status) as HotelBureauCaseResponse['caseStatus'],
      submittedLocation: response.location,
      assignment: caseRow!.geography_release_id
        ? {
            routingReleaseId: stringValue(caseRow!.routing_release_id),
            routingRuleId: stringValue(caseRow!.routing_rule_id),
            organizationId: stringValue(caseRow!.bureau_organization_id),
            scopeUnitId: stringValue(caseRow!.scope_geography_unit_id),
          }
        : null,
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
    const legacyScopeUnitId = route.administrativeUnitId ?? null;
    const [caseRow] = await this.sql.unsafe<Row[]>(
      `SELECT bureau_case.id, bureau_case.status AS case_status, bureau_case.application_id,
              bureau_case.application_version_id, bureau_case.bureau_organization_id,
              bureau_case.scope_unit_id, bureau_case.geography_release_id,
              bureau_case.scope_geography_unit_id, bureau_case.routing_release_id,
              bureau_case.routing_rule_id,
              version.version_number, version.submitted_by_profile_id,
              application.is_synthetic AS application_synthetic,
              bureau_org.is_synthetic AS organization_synthetic,
              bureau_org.organization_type,
              CASE WHEN bureau_case.geography_release_id IS NULL
                   THEN bureau_unit.is_synthetic ELSE geography.synthetic END AS unit_synthetic
       FROM hotel_bureau_cases bureau_case
       JOIN hotel_application_versions version
         ON version.id = bureau_case.application_version_id
        AND version.application_id = bureau_case.application_id
        AND version.bureau_organization_id = bureau_case.bureau_organization_id
        AND version.scope_unit_id IS NOT DISTINCT FROM bureau_case.scope_unit_id
        AND version.location_unit_id IS NOT DISTINCT FROM bureau_case.scope_unit_id
        AND version.geography_release_id IS NOT DISTINCT FROM bureau_case.geography_release_id
        AND version.location_revision_id IS NOT DISTINCT FROM bureau_case.location_revision_id
        AND version.routing_release_id IS NOT DISTINCT FROM bureau_case.routing_release_id
        AND version.routing_rule_id IS NOT DISTINCT FROM bureau_case.routing_rule_id
        AND version.resolved_scope_unit_id IS NOT DISTINCT FROM bureau_case.scope_geography_unit_id
       JOIN hotel_applications application ON application.id = bureau_case.application_id
       JOIN organizations bureau_org ON bureau_org.id = bureau_case.bureau_organization_id
       LEFT JOIN administrative_units bureau_unit ON bureau_unit.id = bureau_case.scope_unit_id
       LEFT JOIN hotel_geography_releases geography
         ON geography.id = bureau_case.geography_release_id
       WHERE bureau_case.id = $1 AND bureau_case.bureau_organization_id = $2
         AND (($3::text IS NOT NULL AND bureau_case.geography_release_id IS NULL
               AND bureau_case.scope_unit_id = $3)
           OR ($3::text IS NULL AND bureau_case.geography_release_id = $4
               AND bureau_case.routing_release_id = $5 AND bureau_case.routing_rule_id = $6
               AND bureau_case.scope_geography_unit_id = $7))
       FOR UPDATE OF bureau_case`,
      [
        caseId,
        route.organizationId,
        legacyScopeUnitId,
        route.geographyReleaseId ?? null,
        route.routingReleaseId ?? null,
        route.routingRuleId ?? null,
        route.geographyUnitId ?? null,
      ],
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
      ...(route.administrativeUnitId
        ? { administrativeUnitId: route.administrativeUnitId, administrativeUnitAncestorIds: [] }
        : {
            hotelGeographyReleaseId: route.geographyReleaseId!,
            hotelGeographyUnitId: route.geographyUnitId!,
            hotelGeographyAncestorUnitIds: await this.getHotelGeographyAncestorUnitIds(
              route.geographyReleaseId!,
              route.geographyUnitId!,
            ),
          }),
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
        AND bureau_case.bureau_organization_id = version.bureau_organization_id
        AND bureau_case.scope_unit_id IS NOT DISTINCT FROM version.scope_unit_id
        AND bureau_case.geography_release_id IS NOT DISTINCT FROM version.geography_release_id
        AND bureau_case.location_revision_id IS NOT DISTINCT FROM version.location_revision_id
        AND bureau_case.routing_release_id IS NOT DISTINCT FROM version.routing_release_id
        AND bureau_case.routing_rule_id IS NOT DISTINCT FROM version.routing_rule_id
        AND bureau_case.scope_geography_unit_id IS NOT DISTINCT FROM version.resolved_scope_unit_id
       JOIN hotel_bureau_decisions bureau_decision
         ON bureau_decision.case_id = bureau_case.id AND bureau_decision.decision = 'approve'
       JOIN organizations bureau_org ON bureau_org.id = bureau_case.bureau_organization_id AND bureau_org.is_synthetic = true AND bureau_org.organization_type = 'administrative'
       LEFT JOIN administrative_units bureau_unit ON bureau_unit.id = bureau_case.scope_unit_id
       LEFT JOIN hotel_geography_releases geography ON geography.id = bureau_case.geography_release_id
       WHERE application.id = $1 AND application.status = 'approved'
         AND application.admission_status = 'pending' AND application.is_synthetic = true
         AND ((bureau_case.geography_release_id IS NULL AND bureau_unit.is_synthetic = true)
           OR (bureau_case.geography_release_id IS NOT NULL AND geography.synthetic = true
               AND geography.validation_status = 'valid'))`,
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
       JOIN hotel_application_versions version
         ON version.id = bureau_case.application_version_id
        AND version.application_id = bureau_case.application_id
        AND version.bureau_organization_id = bureau_case.bureau_organization_id
        AND version.scope_unit_id IS NOT DISTINCT FROM bureau_case.scope_unit_id
        AND version.location_unit_id IS NOT DISTINCT FROM bureau_case.scope_unit_id
        AND version.geography_release_id IS NOT DISTINCT FROM bureau_case.geography_release_id
        AND version.location_revision_id IS NOT DISTINCT FROM bureau_case.location_revision_id
        AND version.routing_release_id IS NOT DISTINCT FROM bureau_case.routing_release_id
        AND version.routing_rule_id IS NOT DISTINCT FROM bureau_case.routing_rule_id
        AND version.resolved_scope_unit_id IS NOT DISTINCT FROM bureau_case.scope_geography_unit_id
       JOIN hotel_bureau_decisions bureau_decision
         ON bureau_decision.case_id = bureau_case.id AND bureau_decision.decision = 'approve'
       JOIN organizations bureau_org ON bureau_org.id = bureau_case.bureau_organization_id AND bureau_org.is_synthetic = true AND bureau_org.organization_type = 'administrative'
       LEFT JOIN administrative_units bureau_unit ON bureau_unit.id = bureau_case.scope_unit_id
       LEFT JOIN hotel_geography_releases geography ON geography.id = bureau_case.geography_release_id
       WHERE application.status = 'approved' AND application.admission_status = 'pending'
         AND application.is_synthetic = true
         AND ((bureau_case.geography_release_id IS NULL AND bureau_unit.is_synthetic = true)
           OR (bureau_case.geography_release_id IS NOT NULL AND geography.synthetic = true
               AND geography.validation_status = 'valid'))
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
       JOIN hotel_application_versions version
         ON version.id = bureau_case.application_version_id
        AND version.application_id = bureau_case.application_id
        AND version.bureau_organization_id = bureau_case.bureau_organization_id
        AND version.scope_unit_id IS NOT DISTINCT FROM bureau_case.scope_unit_id
        AND version.location_unit_id IS NOT DISTINCT FROM bureau_case.scope_unit_id
        AND version.geography_release_id IS NOT DISTINCT FROM bureau_case.geography_release_id
        AND version.location_revision_id IS NOT DISTINCT FROM bureau_case.location_revision_id
        AND version.routing_release_id IS NOT DISTINCT FROM bureau_case.routing_release_id
        AND version.routing_rule_id IS NOT DISTINCT FROM bureau_case.routing_rule_id
        AND version.resolved_scope_unit_id IS NOT DISTINCT FROM bureau_case.scope_geography_unit_id
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
    return row ? this.loadApplication(applicationId, true) : null;
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

  private async loadApplication(
    applicationId: string,
    includeDecisionHistory = false,
  ): Promise<HotelApplicationResponse | null> {
    const [row] = await this.sql.unsafe<Row[]>(`${applicationSelect} WHERE application.id = $1`, [
      applicationId,
    ]);
    return row ? this.toResponse(row, includeDecisionHistory) : null;
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

function toApplicationResponse(row: Row, includeDecisionHistory = false): HotelApplicationResponse {
  return {
    id: stringValue(row.id),
    status: stringValue(row.status) as HotelApplicationResponse['status'],
    admissionStatus: stringValue(
      row.admission_status,
    ) as HotelApplicationResponse['admissionStatus'],
    currentVersion: Number(row.current_version_number),
    currentVersionId: nullableString(row.response_version_id),
    admittedVersion:
      row.admitted_version === null || row.admitted_version === undefined
        ? null
        : Number(row.admitted_version),
    content: jsonValue(row.response_content) as HotelApplicationContent,
    location:
      row.status === 'draft'
        ? null
        : ((jsonValue(row.submitted_location_snapshot) as HotelSubmittedLocation | null) ??
          (jsonValue(row.location_snapshot) as HotelLocation | null) ??
          null),
    locationState:
      row.status === 'draft'
        ? 'unselected'
        : row.submitted_location_snapshot
          ? 'submitted_snapshot'
          : row.location_snapshot
            ? 'legacy'
            : 'unselected',
    bureauDecision: bureauDecision(row.bureau_decision),
    admissionDecision: admissionDecision(row.admission_decision),
    historicalBureauDecisions: includeDecisionHistory
      ? decisionList(row.historical_bureau_decisions, bureauDecision)
      : [],
    historicalAdmissionDecisions: includeDecisionHistory
      ? decisionList(row.historical_admission_decisions, admissionDecision)
      : [],
    workspaceAccess: row.admission_status === 'admitted' ? 'private_only' : 'not_admitted',
    notice: PUBLIC_NOTICE,
    version: Number(row.version),
  };
}

function decisionList<T>(value: unknown, parse: (item: unknown) => T | null): T[] {
  const parsed = value === null || value === undefined ? [] : jsonValue(value);
  if (!Array.isArray(parsed)) return [];
  return parsed.map(parse).filter((item): item is T => item !== null);
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

interface HotelLocationCursor {
  releaseId: string;
  query: string;
  language: string;
  sortName: string;
  unitId: string;
  unitRevisionId: string;
}

function encodeLocationCursor(cursor: HotelLocationCursor): string {
  return Buffer.from(JSON.stringify(cursor), 'utf8').toString('base64url');
}

function parseLocationCursor(
  token: string,
  releaseId: string,
  query: string,
  language: string,
): HotelLocationCursor {
  try {
    const parsed: unknown = JSON.parse(Buffer.from(token, 'base64url').toString('utf8'));
    if (
      !parsed ||
      typeof parsed !== 'object' ||
      Array.isArray(parsed) ||
      typeof (parsed as HotelLocationCursor).releaseId !== 'string' ||
      (parsed as HotelLocationCursor).query !== query ||
      (parsed as HotelLocationCursor).language !== language ||
      typeof (parsed as HotelLocationCursor).sortName !== 'string' ||
      typeof (parsed as HotelLocationCursor).unitId !== 'string' ||
      typeof (parsed as HotelLocationCursor).unitRevisionId !== 'string'
    ) {
      throw new Error('invalid');
    }
    if ((parsed as HotelLocationCursor).releaseId !== releaseId) {
      throw new HotelOnboardingError(
        'conflict',
        'The location directory changed. Restart the search.',
        'LOCATION_RELEASE_STALE',
      );
    }
    return parsed as HotelLocationCursor;
  } catch (error) {
    if (error instanceof HotelOnboardingError) throw error;
    throw new HotelOnboardingError(
      'invalid',
      'The location search cursor is invalid.',
      'INVALID_QUERY',
    );
  }
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
    'Review routing is unavailable for this location. Your draft is saved; submission has not occurred.',
    'HOTEL_ROUTING_UNAVAILABLE',
  );
}
