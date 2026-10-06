import { describe, expect, it } from 'vitest';

import { authorize, type AuthorizationContext, type Capability } from './index';

const membership = { id: 'membership-gondar', organizationId: 'org-gondar', active: true };

function grant(
  capability: Capability,
  overrides: Partial<AuthorizationContext['grants'][number]> = {},
) {
  return {
    id: `grant-${capability}`,
    membershipId: membership.id,
    capability,
    organizationId: membership.organizationId,
    scopes: [{ administrativeUnitId: 'unit-gondar', includeDescendants: false }],
    active: true,
    demoOnly: true,
    productionDecisionEnabled: false,
    ...overrides,
  };
}

function context(grants: AuthorizationContext['grants']): AuthorizationContext {
  return {
    authenticated: true,
    subjectId: 'subject-editor',
    memberships: [membership],
    grants,
  };
}

describe('registry authorization', () => {
  it('fails closed without an authenticated subject or an assigned membership', () => {
    expect(
      authorize(null, { capability: 'registry:resource:read', organizationId: 'org-gondar' }),
    ).toEqual({ allowed: false, reason: 'unauthenticated' });

    expect(
      authorize(
        { authenticated: true, subjectId: 'subject-unassigned', memberships: [], grants: [] },
        { capability: 'registry:resource:read', organizationId: 'org-gondar' },
      ),
    ).toEqual({ allowed: false, reason: 'no-membership' });
  });

  it('requires membership, capability, organization and geographic scope on one grant', () => {
    const decision = authorize(
      context([
        grant('registry:submission:review', {
          scopes: [{ administrativeUnitId: 'unit-gondar', includeDescendants: false }],
        }),
        grant('registry:resource:read', {
          id: 'grant-lalibela-read',
          organizationId: 'org-gondar',
          scopes: [{ administrativeUnitId: 'unit-lalibela', includeDescendants: false }],
        }),
      ]),
      {
        capability: 'registry:submission:review',
        organizationId: 'org-gondar',
        administrativeUnitId: 'unit-lalibela',
        resourceIsSynthetic: true,
      },
    );

    expect(decision).toEqual({ allowed: false, reason: 'missing-scope' });
  });

  it('does not combine a capability grant with another membership scope', () => {
    const secondMembership = {
      id: 'membership-lalibela',
      organizationId: 'org-lalibela',
      active: true,
    };
    const decision = authorize(
      {
        authenticated: true,
        subjectId: 'subject-multi-org',
        memberships: [membership, secondMembership],
        grants: [
          grant('registry:submission:review', {
            scopes: [{ administrativeUnitId: 'unit-gondar', includeDescendants: false }],
          }),
          {
            ...grant('registry:resource:read', {
              id: 'grant-lalibela-scope',
              membershipId: secondMembership.id,
              organizationId: secondMembership.organizationId,
              scopes: [{ administrativeUnitId: 'unit-lalibela', includeDescendants: false }],
            }),
          },
        ],
      },
      {
        capability: 'registry:submission:review',
        organizationId: 'org-lalibela',
        administrativeUnitId: 'unit-lalibela',
        resourceIsSynthetic: true,
      },
    );

    expect(decision).toEqual({ allowed: false, reason: 'missing-capability' });
  });

  it('checks the resource scope rather than a forged request scope', () => {
    const decision = authorize(context([grant('registry:resource:edit')]), {
      capability: 'registry:resource:edit',
      organizationId: 'org-gondar',
      administrativeUnitId: 'unit-lalibela',
      administrativeUnitAncestorIds: ['unit-region-b', 'unit-federal'],
      resourceIsSynthetic: true,
    });

    expect(decision).toEqual({ allowed: false, reason: 'missing-scope' });
  });

  it('does not treat an empty organization selection as an omitted constraint', () => {
    const decision = authorize(context([grant('registry:resource:create')]), {
      capability: 'registry:resource:create',
      organizationId: '',
      administrativeUnitId: 'unit-gondar',
      resourceIsSynthetic: true,
    });

    expect(decision).toEqual({ allowed: false, reason: 'missing-capability' });
  });

  it('allows explicitly assigned descendant scope without combining grants', () => {
    const decision = authorize(
      context([
        grant('registry:resource:edit', {
          scopes: [{ administrativeUnitId: 'unit-region-a', includeDescendants: true }],
        }),
      ]),
      {
        capability: 'registry:resource:edit',
        organizationId: 'org-gondar',
        administrativeUnitId: 'unit-gondar-kebele',
        administrativeUnitAncestorIds: ['unit-gondar', 'unit-region-a', 'unit-federal'],
        resourceIsSynthetic: true,
      },
    );

    expect(decision.allowed).toBe(true);
  });

  it('keeps production decision authority disabled and demo grants synthetic-only', () => {
    expect(
      authorize(
        context([
          grant('registry:publication:publish', {
            demoOnly: false,
            productionDecisionEnabled: true,
          }),
        ]),
        {
          capability: 'registry:publication:publish',
          organizationId: 'org-gondar',
          administrativeUnitId: 'unit-gondar',
          resourceIsSynthetic: true,
        },
      ),
    ).toEqual({ allowed: false, reason: 'production-decision-disabled' });

    expect(
      authorize(context([grant('registry:resource:read')]), {
        capability: 'registry:resource:read',
        organizationId: 'org-gondar',
        administrativeUnitId: 'unit-gondar',
        resourceIsSynthetic: false,
      }),
    ).toEqual({ allowed: false, reason: 'non-synthetic-resource' });
  });
});
