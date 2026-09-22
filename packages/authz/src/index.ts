export type Capability = 'platform:health:read';

export interface AuthorizationGrant {
  capability: Capability;
  organizationId: string;
  administrativeUnitIds: readonly string[];
  active: boolean;
}

export interface AuthorizationContext {
  authenticated: boolean;
  subjectId: string | null;
  grants: readonly AuthorizationGrant[];
}

export interface AuthorizationRequirement {
  capability: Capability;
  organizationId: string;
  administrativeUnitId?: string;
}

export interface PolicyDecision {
  allowed: boolean;
  reason: 'allowed' | 'unauthenticated' | 'missing-capability' | 'missing-scope' | 'inactive-grant';
}

export function authorize(
  context: AuthorizationContext | null,
  requirement: AuthorizationRequirement,
): PolicyDecision {
  if (!context?.authenticated || !context.subjectId) {
    return { allowed: false, reason: 'unauthenticated' };
  }

  const matchingGrant = context.grants.find(
    (grant) =>
      grant.capability === requirement.capability &&
      grant.organizationId === requirement.organizationId,
  );

  if (!matchingGrant) {
    return { allowed: false, reason: 'missing-capability' };
  }

  if (!matchingGrant.active) {
    return { allowed: false, reason: 'inactive-grant' };
  }

  if (
    requirement.administrativeUnitId &&
    !matchingGrant.administrativeUnitIds.includes(requirement.administrativeUnitId)
  ) {
    return { allowed: false, reason: 'missing-scope' };
  }

  return { allowed: true, reason: 'allowed' };
}
