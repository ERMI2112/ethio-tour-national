export type Capability =
  | 'platform:health:read'
  | 'hotel:application:bureau:read'
  | 'hotel:application:bureau:decide'
  | 'hotel:application:admin:read'
  | 'hotel:application:admin:decide'
  | 'hotel:workspace:read'
  | 'hotel:workspace:edit'
  | 'registry:resource:read'
  | 'registry:resource:create'
  | 'registry:resource:edit'
  | 'registry:submission:submit'
  | 'registry:submission:review'
  | 'registry:publication:publish'
  | 'registry:publication:withdraw';

export interface AuthorizationMembership {
  id: string;
  organizationId: string;
  active: boolean;
}

export interface GrantScope {
  administrativeUnitId: string;
  includeDescendants: boolean;
}

export interface AuthorizationGrant {
  id: string;
  membershipId: string;
  capability: Capability;
  organizationId: string;
  scopes: readonly GrantScope[];
  active: boolean;
  demoOnly: boolean;
  productionDecisionEnabled: boolean;
}

export interface AuthorizationContext {
  authenticated: boolean;
  subjectId: string | null;
  memberships: readonly AuthorizationMembership[];
  grants: readonly AuthorizationGrant[];
}

export interface AuthorizationRequirement {
  capability: Capability;
  organizationId?: string;
  administrativeUnitId?: string;
  administrativeUnitAncestorIds?: readonly string[];
  resourceIsSynthetic?: boolean;
}

export type DenialReason =
  | 'unauthenticated'
  | 'no-membership'
  | 'missing-capability'
  | 'missing-scope'
  | 'inactive-membership'
  | 'inactive-grant'
  | 'production-decision-disabled'
  | 'non-synthetic-resource';

export type PolicyDecision =
  | {
      allowed: true;
      reason: 'allowed';
      grantId: string;
      membershipId: string;
      organizationId: string;
    }
  | { allowed: false; reason: DenialReason };

const decisionCapabilities = new Set<Capability>([
  'hotel:application:bureau:decide',
  'hotel:application:admin:decide',
  'registry:submission:review',
  'registry:publication:publish',
  'registry:publication:withdraw',
]);

const syntheticHotelCapabilities = new Set<Capability>([
  'hotel:application:bureau:read',
  'hotel:application:bureau:decide',
  'hotel:application:admin:read',
  'hotel:application:admin:decide',
  'hotel:workspace:read',
  'hotel:workspace:edit',
]);

export function authorize(
  context: AuthorizationContext | null,
  requirement: AuthorizationRequirement,
): PolicyDecision {
  if (!context?.authenticated || !context.subjectId) {
    return { allowed: false, reason: 'unauthenticated' };
  }

  if (context.memberships.length === 0) {
    return { allowed: false, reason: 'no-membership' };
  }

  const membershipsById = new Map(
    context.memberships.map((membership) => [membership.id, membership]),
  );
  const candidateGrants = context.grants.filter(
    (grant) =>
      grant.capability === requirement.capability &&
      (requirement.organizationId === undefined ||
        grant.organizationId === requirement.organizationId) &&
      membershipsById.get(grant.membershipId)?.organizationId === grant.organizationId,
  );

  if (candidateGrants.length === 0) {
    return { allowed: false, reason: 'missing-capability' };
  }

  let sawInactiveMembership = false;
  let sawInactiveGrant = false;
  let sawProductionDisabled = false;
  let sawNonSyntheticResource = false;
  let sawMatchingScope = false;

  for (const grant of candidateGrants) {
    const membership = membershipsById.get(grant.membershipId);
    if (!membership?.active) {
      sawInactiveMembership = true;
      continue;
    }
    if (!grant.active) {
      sawInactiveGrant = true;
      continue;
    }

    if (
      decisionCapabilities.has(requirement.capability) &&
      (grant.productionDecisionEnabled || !grant.demoOnly)
    ) {
      sawProductionDisabled = true;
      continue;
    }

    if (
      (grant.demoOnly && requirement.resourceIsSynthetic !== true) ||
      (syntheticHotelCapabilities.has(requirement.capability) && !grant.demoOnly)
    ) {
      sawNonSyntheticResource = true;
      continue;
    }

    if (requirement.administrativeUnitId) {
      const ancestors = new Set(requirement.administrativeUnitAncestorIds ?? []);
      const coversUnit = grant.scopes.some(
        (scope) =>
          scope.administrativeUnitId === requirement.administrativeUnitId ||
          (scope.includeDescendants && ancestors.has(scope.administrativeUnitId)),
      );
      if (!coversUnit) {
        continue;
      }
    }

    sawMatchingScope = true;
    return {
      allowed: true,
      reason: 'allowed',
      grantId: grant.id,
      membershipId: membership.id,
      organizationId: membership.organizationId,
    };
  }

  if (sawProductionDisabled) {
    return { allowed: false, reason: 'production-decision-disabled' };
  }
  if (sawNonSyntheticResource) {
    return { allowed: false, reason: 'non-synthetic-resource' };
  }
  if (sawInactiveMembership) {
    return { allowed: false, reason: 'inactive-membership' };
  }
  if (sawInactiveGrant) {
    return { allowed: false, reason: 'inactive-grant' };
  }
  return { allowed: false, reason: sawMatchingScope ? 'missing-capability' : 'missing-scope' };
}
