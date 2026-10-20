import type { DatabaseClient } from './client';

type UnitLevel = 'federal' | 'regional' | 'woreda' | 'kebele';
type DemoRole = 'editor' | 'reviewer' | 'publisher';

export type DemoActorKey =
  | `federal.${DemoRole}`
  | `regional-a.${DemoRole}`
  | `regional-b.${DemoRole}`
  | `woreda-gondar.${DemoRole}`
  | `woreda-lalibela.${DemoRole}`
  | `kebele-gondar.${DemoRole}`
  | `kebele-lalibela.${DemoRole}`
  | 'hotel-bureau.reviewer'
  | 'platform.hotel-admin';

interface UnitDefinition {
  id: string;
  displayName: string;
  level: UnitLevel;
  parentId: string | null;
}

interface ScopeDefinition {
  key: string;
  unitId: string | null;
  organizationId: string;
  organizationName: string;
  level: UnitLevel | null;
  includeDescendants: boolean;
  organizationType?: 'administrative' | 'platform';
}

const units: UnitDefinition[] = [
  {
    id: 'demo-unit-federal',
    displayName: 'Synthetic Federal Demo Unit',
    level: 'federal',
    parentId: null,
  },
  {
    id: 'demo-unit-region-a',
    displayName: 'Synthetic Region A Demo Unit',
    level: 'regional',
    parentId: 'demo-unit-federal',
  },
  {
    id: 'demo-unit-region-b',
    displayName: 'Synthetic Region B Demo Unit',
    level: 'regional',
    parentId: 'demo-unit-federal',
  },
  {
    id: 'demo-unit-woreda-gondar',
    displayName: 'Synthetic Gondar Demo Woreda',
    level: 'woreda',
    parentId: 'demo-unit-region-a',
  },
  {
    id: 'demo-unit-woreda-lalibela',
    displayName: 'Synthetic Lalibela Demo Woreda',
    level: 'woreda',
    parentId: 'demo-unit-region-b',
  },
  {
    id: 'demo-unit-kebele-gondar',
    displayName: 'Synthetic Gondar Demo Kebele',
    level: 'kebele',
    parentId: 'demo-unit-woreda-gondar',
  },
  {
    id: 'demo-unit-kebele-lalibela',
    displayName: 'Synthetic Lalibela Demo Kebele',
    level: 'kebele',
    parentId: 'demo-unit-woreda-lalibela',
  },
];

const scopes: ScopeDefinition[] = [
  {
    key: 'federal',
    unitId: 'demo-unit-federal',
    organizationId: 'demo-org-federal',
    organizationName: 'Synthetic Federal Demo Organization',
    level: 'federal',
    includeDescendants: true,
  },
  {
    key: 'regional-a',
    unitId: 'demo-unit-region-a',
    organizationId: 'demo-org-region-a',
    organizationName: 'Synthetic Region A Demo Organization',
    level: 'regional',
    includeDescendants: true,
  },
  {
    key: 'regional-b',
    unitId: 'demo-unit-region-b',
    organizationId: 'demo-org-region-b',
    organizationName: 'Synthetic Region B Demo Organization',
    level: 'regional',
    includeDescendants: true,
  },
  {
    key: 'woreda-gondar',
    unitId: 'demo-unit-woreda-gondar',
    organizationId: 'demo-org-woreda-gondar',
    organizationName: 'Synthetic Gondar Demo Woreda Organization',
    level: 'woreda',
    includeDescendants: true,
  },
  {
    key: 'woreda-lalibela',
    unitId: 'demo-unit-woreda-lalibela',
    organizationId: 'demo-org-woreda-lalibela',
    organizationName: 'Synthetic Lalibela Demo Woreda Organization',
    level: 'woreda',
    includeDescendants: true,
  },
  {
    key: 'kebele-gondar',
    unitId: 'demo-unit-kebele-gondar',
    organizationId: 'demo-org-kebele-gondar',
    organizationName: 'Synthetic Gondar Demo Kebele Organization',
    level: 'kebele',
    includeDescendants: false,
  },
  {
    key: 'kebele-lalibela',
    unitId: 'demo-unit-kebele-lalibela',
    organizationId: 'demo-org-kebele-lalibela',
    organizationName: 'Synthetic Lalibela Demo Kebele Organization',
    level: 'kebele',
    includeDescendants: false,
  },
];

const hotelPilotScopes: ScopeDefinition[] = [
  {
    key: 'hotel-bureau',
    unitId: 'demo-unit-federal',
    organizationId: 'demo-org-hotel-bureau',
    organizationName: 'Synthetic Hotel Pilot Bureau Review Organization',
    level: 'federal',
    includeDescendants: true,
    organizationType: 'administrative',
  },
  {
    key: 'platform',
    unitId: null,
    organizationId: 'demo-org-platform-admin',
    organizationName: 'Synthetic EthioTour Platform Administration',
    level: null,
    includeDescendants: false,
    organizationType: 'platform',
  },
];

const capabilitiesByRole: Record<DemoRole, readonly string[]> = {
  editor: [
    'registry:resource:read',
    'registry:resource:create',
    'registry:resource:edit',
    'registry:submission:submit',
  ],
  reviewer: ['registry:resource:read', 'registry:submission:review'],
  publisher: [
    'registry:resource:read',
    'registry:publication:publish',
    'registry:publication:withdraw',
  ],
};

const demoRoles: readonly DemoRole[] = ['editor', 'reviewer', 'publisher'];
export const demoActorKeys: readonly DemoActorKey[] = scopes
  .flatMap((scope) => demoRoles.map((role) => `${scope.key}.${role}` as DemoActorKey))
  .concat(['hotel-bureau.reviewer', 'platform.hotel-admin']);

export async function seedSyntheticRegistryDemo(
  client: DatabaseClient,
  externalIssuer: string,
  actorSubjects: Partial<Record<DemoActorKey, string>> = {},
): Promise<number> {
  const issuer = normalizeIssuer(externalIssuer);
  const scopeByUnitId = new Map(units.map((unit) => [unit.id, unit]));
  const assignedActors = Object.entries(actorSubjects) as [DemoActorKey, string][];
  validateActorAssignments(assignedActors);

  await client.begin(async (transaction) => {
    for (const unit of units) {
      await transaction.unsafe(
        `
          INSERT INTO administrative_units (id, display_name, level, parent_id, is_synthetic)
          VALUES ($1, $2, $3, $4, true)
          ON CONFLICT (id) DO NOTHING
        `,
        [unit.id, unit.displayName, unit.level, unit.parentId],
      );
      const [existing] = await transaction.unsafe<Record<string, unknown>[]>(
        'SELECT display_name, level, parent_id, is_synthetic FROM administrative_units WHERE id = $1',
        [unit.id],
      );
      if (
        existing?.display_name !== unit.displayName ||
        existing.level !== unit.level ||
        nullableString(existing.parent_id) !== unit.parentId ||
        existing.is_synthetic !== true
      ) {
        throw new Error('A demo administrative unit conflicts with existing data.');
      }
    }

    for (const unit of units) {
      let ancestorId: string | null = unit.id;
      let depth = 0;
      while (ancestorId) {
        await transaction.unsafe(
          `
            INSERT INTO administrative_unit_paths (ancestor_unit_id, descendant_unit_id, depth)
            VALUES ($1, $2, $3)
            ON CONFLICT (ancestor_unit_id, descendant_unit_id) DO NOTHING
          `,
          [ancestorId, unit.id, depth],
        );
        const [storedPath] = await transaction.unsafe<Record<string, unknown>[]>(
          'SELECT depth FROM administrative_unit_paths WHERE ancestor_unit_id = $1 AND descendant_unit_id = $2',
          [ancestorId, unit.id],
        );
        if (Number(storedPath?.depth) !== depth) {
          throw new Error('A synthetic administrative unit path conflicts with existing data.');
        }
        ancestorId = scopeByUnitId.get(ancestorId)?.parentId ?? null;
        depth += 1;
      }
    }

    for (const scope of [...scopes, ...hotelPilotScopes]) {
      await transaction.unsafe(
        `
          INSERT INTO organizations (id, display_name, organization_type, level, administrative_unit_id, is_synthetic)
          VALUES ($1, $2, $3, $4, $5, true)
          ON CONFLICT (id) DO NOTHING
        `,
        [
          scope.organizationId,
          scope.organizationName,
          scope.organizationType ?? 'administrative',
          scope.level,
          scope.unitId,
        ],
      );
      const [existing] = await transaction.unsafe<Record<string, unknown>[]>(
        'SELECT display_name, organization_type, level, administrative_unit_id, is_synthetic FROM organizations WHERE id = $1',
        [scope.organizationId],
      );
      if (
        existing?.display_name !== scope.organizationName ||
        existing.organization_type !== (scope.organizationType ?? 'administrative') ||
        nullableString(existing.level) !== scope.level ||
        existing.administrative_unit_id !== scope.unitId ||
        existing.is_synthetic !== true
      ) {
        throw new Error('A demo organization conflicts with existing data.');
      }
    }

    for (const [actorKey, subjectId] of assignedActors) {
      const [scopeKey, roleValue] = actorKey.split('.') as [string, string];
      const scope = [...scopes, ...hotelPilotScopes].find(
        (candidate) => candidate.key === scopeKey,
      );
      if (!scope) throw new Error('A demo actor assignment is not recognized.');
      const isHotelBureauReviewer = actorKey === 'hotel-bureau.reviewer';
      const isHotelAdministrator = actorKey === 'platform.hotel-admin';
      if (
        !isHotelBureauReviewer &&
        !isHotelAdministrator &&
        !demoRoles.includes(roleValue as DemoRole)
      ) {
        throw new Error('A demo actor role is not recognized.');
      }
      const role = roleValue as DemoRole;
      const [profile] = await transaction.unsafe<Record<string, unknown>[]>(
        `
          INSERT INTO user_profiles (external_issuer, external_subject_id)
          VALUES ($1, $2)
          ON CONFLICT (external_issuer, external_subject_id) DO NOTHING
          RETURNING id
        `,
        [issuer, subjectId],
      );
      const [existingProfile] = profile
        ? [profile]
        : await transaction.unsafe<Record<string, unknown>[]>(
            'SELECT id FROM user_profiles WHERE external_issuer = $1 AND external_subject_id = $2',
            [issuer, subjectId],
          );
      if (!existingProfile?.id) throw new Error('A demo user profile could not be resolved.');
      const profileId = stringValue(existingProfile.id);

      const [membership] = await transaction.unsafe<Record<string, unknown>[]>(
        `
          INSERT INTO memberships (user_profile_id, organization_id, label)
          VALUES ($1, $2, $3)
          ON CONFLICT (user_profile_id, organization_id) DO NOTHING
          RETURNING id
        `,
        [profileId, scope.organizationId, `Synthetic demo ${role}`],
      );
      const [existingMembership] = membership
        ? [membership]
        : await transaction.unsafe<Record<string, unknown>[]>(
            'SELECT id FROM memberships WHERE user_profile_id = $1 AND organization_id = $2',
            [profileId, scope.organizationId],
          );
      if (!existingMembership?.id) throw new Error('A demo membership could not be resolved.');
      const membershipId = stringValue(existingMembership.id);

      const capabilities = isHotelBureauReviewer
        ? ['hotel:application:bureau:read', 'hotel:application:bureau:decide']
        : isHotelAdministrator
          ? ['hotel:application:admin:read', 'hotel:application:admin:decide']
          : capabilitiesByRole[role];
      for (const capability of capabilities) {
        const [grant] = await transaction.unsafe<Record<string, unknown>[]>(
          `
            INSERT INTO access_grants (
              membership_id, capability, organization_id, active, demo_only, production_decision_enabled
            ) VALUES ($1, $2, $3, true, true, false)
            ON CONFLICT (membership_id, capability, organization_id) DO NOTHING
            RETURNING id
          `,
          [membershipId, capability, scope.organizationId],
        );
        const [existingGrant] = grant
          ? [grant]
          : await transaction.unsafe<Record<string, unknown>[]>(
              'SELECT id, demo_only, production_decision_enabled FROM access_grants WHERE membership_id = $1 AND capability = $2 AND organization_id = $3',
              [membershipId, capability, scope.organizationId],
            );
        if (
          !existingGrant?.id ||
          existingGrant.demo_only !== true ||
          existingGrant.production_decision_enabled !== false
        ) {
          throw new Error('A demo authorization grant conflicts with existing data.');
        }
        const grantId = stringValue(existingGrant.id);
        const [unexpectedScope] = scope.unitId
          ? await transaction.unsafe<Record<string, unknown>[]>(
              'SELECT 1 FROM grant_scopes WHERE grant_id = $1 AND administrative_unit_id <> $2 LIMIT 1',
              [grantId, scope.unitId],
            )
          : await transaction.unsafe<Record<string, unknown>[]>(
              'SELECT 1 FROM grant_scopes WHERE grant_id = $1 LIMIT 1',
              [grantId],
            );
        if (unexpectedScope) throw new Error('A demo grant has an unexpected geographic scope.');
        if (scope.unitId) {
          await transaction.unsafe(
            `
              INSERT INTO grant_scopes (grant_id, administrative_unit_id, include_descendants)
              VALUES ($1, $2, $3)
              ON CONFLICT (grant_id, administrative_unit_id) DO NOTHING
            `,
            [grantId, scope.unitId, scope.includeDescendants],
          );
          const [savedScope] = await transaction.unsafe<Record<string, unknown>[]>(
            'SELECT include_descendants FROM grant_scopes WHERE grant_id = $1 AND administrative_unit_id = $2',
            [grantId, scope.unitId],
          );
          if (savedScope?.include_descendants !== scope.includeDescendants) {
            throw new Error('A demo grant scope conflicts with existing data.');
          }
        }
      }
    }
  });

  return assignedActors.length;
}

function validateActorAssignments(assignments: readonly [DemoActorKey, string][]): void {
  const subjectsByScope = new Map<string, Set<string>>();
  for (const [key, subjectId] of assignments) {
    if (!demoActorKeys.includes(key)) throw new Error('A demo actor role is not recognized.');
    if (!subjectId.trim()) throw new Error('Demo actor subject IDs must be non-empty.');
    const scopeKey = key.slice(0, key.lastIndexOf('.'));
    const subjects = subjectsByScope.get(scopeKey) ?? new Set<string>();
    if (subjects.has(subjectId)) {
      throw new Error('Editor, reviewer and publisher demo actors must be distinct per scope.');
    }
    subjects.add(subjectId);
    subjectsByScope.set(scopeKey, subjects);
  }
  const bureauReviewer = assignments.find(([key]) => key === 'hotel-bureau.reviewer')?.[1];
  const platformAdmin = assignments.find(([key]) => key === 'platform.hotel-admin')?.[1];
  if (bureauReviewer && platformAdmin && bureauReviewer === platformAdmin) {
    throw new Error(
      'The synthetic Bureau reviewer and platform Administrator must be distinct actors.',
    );
  }
}

function normalizeIssuer(value: string): string {
  const issuer = value.trim().replace(/\/+$/, '');
  try {
    const url = new URL(issuer);
    if (
      (url.protocol !== 'http:' && url.protocol !== 'https:') ||
      url.username ||
      url.password ||
      url.search ||
      url.hash
    ) {
      throw new Error('Invalid issuer URL.');
    }
  } catch {
    throw new Error('DEMO_ISSUER must be an absolute identity-provider issuer URL.');
  }
  return issuer;
}

function nullableString(value: unknown): string | null {
  return value === null || value === undefined ? null : String(value);
}

function stringValue(value: unknown): string {
  if (value === null || value === undefined) throw new Error('Unexpected empty database value.');
  return String(value);
}
