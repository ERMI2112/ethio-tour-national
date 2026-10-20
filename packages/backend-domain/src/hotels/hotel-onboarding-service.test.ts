import { describe, expect, it, vi } from 'vitest';

import type { AuthorizationContext } from '@ethio-tour/authz';
import type { HotelApplicationResponse } from '@ethio-tour/contracts';

import {
  HotelOnboardingError,
  HotelOnboardingService,
  hotelPilotSettings,
} from './hotel-onboarding-service';
import type {
  HotelBureauRoute,
  HotelBureauRoutingPolicy,
  HotelOnboardingStore,
  HotelOnboardingTransaction,
} from './hotel-onboarding-store';
import type { RegistryActor } from '../registry/registry-store';

const actor: RegistryActor = {
  issuer: 'https://identity.example.test/realms/synthetic',
  subjectId: 'applicant-subject',
  issuerAliases: ['http://keycloak:8080/realms/synthetic'],
};

const content = { claimedHotelName: 'Synthetic test hotel', applicantNotes: 'Pilot-only content.' };
const application: HotelApplicationResponse = {
  id: 'app-1',
  status: 'draft',
  admissionStatus: 'not_eligible',
  currentVersion: 0,
  currentVersionId: null,
  content,
  bureauDecision: null,
  admissionDecision: null,
  workspaceAccess: 'not_admitted',
  notice:
    'Synthetic pilot review result; not a license or proof of authority to represent a hotel.',
  version: 1,
};

const noMembershipContext: AuthorizationContext = {
  authenticated: true,
  subjectId: actor.subjectId,
  memberships: [],
  grants: [],
};

function fakeStore(context = noMembershipContext) {
  const tx = {
    getAuthorizationContext: vi.fn(async () => context),
    createApplication: vi.fn(async () => application),
    listOwnedApplications: vi.fn(async () => [application]),
    getOwnedApplication: vi.fn(async () => application),
    updateDraft: vi.fn(async () => application),
    submitApplication: vi.fn(async () => application),
    getBureauDecisionTarget: vi.fn(async () => ({
      organizationId: 'bureau-synthetic',
      administrativeUnitId: 'unit-synthetic',
      resourceIsSynthetic: true,
    })),
    listBureauCases: vi.fn(async () => []),
    decideBureauCase: vi.fn(async () => application),
    getAdmissionDecisionTarget: vi.fn(async () => ({
      organizationId: 'platform-synthetic',
      administrativeUnitId: null,
      resourceIsSynthetic: true,
    })),
    listAdmissionQueue: vi.fn(async () => []),
    decideAdmission: vi.fn(async () => application),
    getProviderWorkspace: vi.fn(async () => application),
    appendDenial: vi.fn(async () => undefined),
  } as unknown as HotelOnboardingTransaction;

  const store = {
    transaction: vi.fn(
      async (work: (transaction: HotelOnboardingTransaction) => Promise<unknown>) => work(tx),
    ),
  } as unknown as HotelOnboardingStore;

  return { store, tx };
}

const enabledSettings = {
  enabled: true,
  production: false,
  bureauRouting: routingPolicy([
    { organizationId: 'bureau-synthetic', administrativeUnitId: 'unit-synthetic' },
  ]),
  administratorOrganizationId: 'platform-synthetic',
};

describe('synthetic hotel onboarding service', () => {
  it('creates only an applicant-owned private draft without adding memberships or provider access', async () => {
    const { store, tx } = fakeStore();
    const service = new HotelOnboardingService(store, enabledSettings);

    const result = await service.createApplication(actor, { content });

    expect(result).toMatchObject({
      status: 'draft',
      admissionStatus: 'not_eligible',
      workspaceAccess: 'not_admitted',
    });
    expect(tx.createApplication).toHaveBeenCalledWith(actor, content);
    expect(tx.getAuthorizationContext).toHaveBeenCalledWith(actor);
    expect('providerOrganizationId' in result).toBe(false);
  });

  it('does not treat an unauthenticated authorization context as a signed-in applicant', async () => {
    const context: AuthorizationContext = {
      ...noMembershipContext,
      authenticated: false,
    };
    const { store, tx } = fakeStore(context);
    const service = new HotelOnboardingService(store, enabledSettings);

    await expect(service.createApplication(actor, { content })).rejects.toMatchObject({
      code: 'unauthenticated',
    });
    expect(tx.createApplication).not.toHaveBeenCalled();
  });

  it('fails closed when the configured Bureau route is missing', async () => {
    const { store, tx } = fakeStore();
    const service = new HotelOnboardingService(store, {
      ...enabledSettings,
      bureauRouting: routingPolicy([], 'missing'),
    });

    await expect(service.submitApplication(actor, 'app-1', 1)).rejects.toMatchObject({
      code: 'unavailable',
    });
    expect(tx.submitApplication).not.toHaveBeenCalled();
  });

  it('fails closed when a future routing table resolves an application ambiguously', async () => {
    const { store, tx } = fakeStore();
    const service = new HotelOnboardingService(store, {
      ...enabledSettings,
      bureauRouting: routingPolicy([], 'ambiguous'),
    });

    await expect(service.submitApplication(actor, 'app-1', 1)).rejects.toMatchObject({
      code: 'unavailable',
    });
    expect(tx.submitApplication).not.toHaveBeenCalled();
  });

  it('resolves multiple offices through a server-owned routing policy, never request fields', async () => {
    const routeA = { organizationId: 'bureau-a', administrativeUnitId: 'unit-a' };
    const routeB = { organizationId: 'bureau-b', administrativeUnitId: 'unit-b' };
    const resolveApplicationRoute = vi.fn(async (applicationId: string) => ({
      kind: 'routed' as const,
      route: applicationId === 'app-a' ? routeA : routeB,
    }));
    const { store, tx } = fakeStore();
    const service = new HotelOnboardingService(store, {
      ...enabledSettings,
      bureauRouting: {
        resolveApplicationRoute,
        routesForReview: async () => [routeA, routeB],
      },
    });

    await service.submitApplication(actor, 'app-a', 1);
    await service.submitApplication(actor, 'app-b', 1);

    expect(resolveApplicationRoute).toHaveBeenCalledWith('app-a');
    expect(resolveApplicationRoute).toHaveBeenCalledWith('app-b');
    expect(tx.submitApplication).toHaveBeenNthCalledWith(1, actor, 'app-a', 1, routeA);
    expect(tx.submitApplication).toHaveBeenNthCalledWith(2, actor, 'app-b', 1, routeB);
  });

  it('lists only office queues authorized by a complete grant for that route', async () => {
    const routeA = { organizationId: 'bureau-a', administrativeUnitId: 'unit-a' };
    const routeB = { organizationId: 'bureau-b', administrativeUnitId: 'unit-b' };
    const context: AuthorizationContext = {
      authenticated: true,
      subjectId: 'reviewer',
      memberships: [{ id: 'member-a', organizationId: routeA.organizationId, active: true }],
      grants: [
        {
          id: 'grant-a',
          membershipId: 'member-a',
          capability: 'hotel:application:bureau:read',
          organizationId: routeA.organizationId,
          scopes: [
            { administrativeUnitId: routeA.administrativeUnitId, includeDescendants: false },
          ],
          active: true,
          demoOnly: true,
          productionDecisionEnabled: false,
        },
      ],
    };
    const { store, tx } = fakeStore(context);
    const service = new HotelOnboardingService(store, {
      ...enabledSettings,
      bureauRouting: routingPolicy([routeA, routeB]),
    });

    await service.listBureauCases(actor);

    expect(tx.listBureauCases).toHaveBeenCalledTimes(1);
    expect(tx.listBureauCases).toHaveBeenCalledWith(routeA);
  });

  it('does not combine Bureau decision capability and scope from separate grants', async () => {
    const context: AuthorizationContext = {
      authenticated: true,
      subjectId: 'reviewer',
      memberships: [{ id: 'bureau-member', organizationId: 'bureau-synthetic', active: true }],
      grants: [
        {
          id: 'decision-wrong-scope',
          membershipId: 'bureau-member',
          capability: 'hotel:application:bureau:decide',
          organizationId: 'bureau-synthetic',
          scopes: [{ administrativeUnitId: 'other-unit', includeDescendants: false }],
          active: true,
          demoOnly: true,
          productionDecisionEnabled: false,
        },
        {
          id: 'read-right-scope',
          membershipId: 'bureau-member',
          capability: 'hotel:application:bureau:read',
          organizationId: 'bureau-synthetic',
          scopes: [{ administrativeUnitId: 'unit-synthetic', includeDescendants: false }],
          active: true,
          demoOnly: true,
          productionDecisionEnabled: false,
        },
      ],
    };
    const { store, tx } = fakeStore(context);
    const service = new HotelOnboardingService(store, enabledSettings);

    await expect(
      service.decideBureauCase(actor, 'case-1', {
        expectedVersion: 1,
        decision: 'approve',
        reason: 'Synthetic pilot review.',
      }),
    ).rejects.toBeInstanceOf(HotelOnboardingError);
    expect(tx.decideBureauCase).not.toHaveBeenCalled();
    expect(tx.appendDenial).toHaveBeenCalledWith(
      actor,
      'hotel.application.bureau.decide',
      'case-1',
      'missing-scope',
    );
  });

  it('denies admission without one active Administrator grant', async () => {
    const { store, tx } = fakeStore();
    const service = new HotelOnboardingService(store, enabledSettings);

    await expect(service.listAdmissionQueue(actor)).rejects.toMatchObject({ code: 'forbidden' });
    expect(tx.listAdmissionQueue).not.toHaveBeenCalled();
  });

  it('does not enable the pilot in production even when the opt-in flag is supplied', async () => {
    const { store, tx } = fakeStore();
    const service = new HotelOnboardingService(store, {
      ...enabledSettings,
      enabled: false,
      production: true,
    });

    await expect(service.createApplication(actor, { content })).rejects.toMatchObject({
      code: 'unavailable',
    });
    expect(tx.createApplication).not.toHaveBeenCalled();
  });

  it('requires a complete configured synthetic route and refuses an opt-in production runtime', async () => {
    await expect(
      hotelPilotSettings({
        NODE_ENV: 'development',
        HOTEL_PILOT_ENABLED: 'true',
        HOTEL_PILOT_BUREAU_ORGANIZATION_ID: 'synthetic-bureau',
      }).bureauRouting.resolveApplicationRoute('app-1'),
    ).resolves.toEqual({ kind: 'missing' });
    expect(
      await hotelPilotSettings({
        NODE_ENV: 'development',
        HOTEL_PILOT_ENABLED: 'true',
        HOTEL_PILOT_BUREAU_ORGANIZATION_ID: 'synthetic-bureau',
      }).bureauRouting.routesForReview(),
    ).toEqual([]);
    expect(
      hotelPilotSettings({
        NODE_ENV: 'production',
        HOTEL_PILOT_ENABLED: 'true',
        HOTEL_PILOT_BUREAU_ORGANIZATION_ID: 'synthetic-bureau',
        HOTEL_PILOT_BUREAU_SCOPE_UNIT_ID: 'synthetic-unit',
        HOTEL_PILOT_ADMIN_ORGANIZATION_ID: 'synthetic-admin',
      }),
    ).toMatchObject({ enabled: false, production: true });
    expect(
      hotelPilotSettings({
        NODE_ENV: 'staging',
        HOTEL_PILOT_ENABLED: 'true',
        HOTEL_PILOT_BUREAU_ORGANIZATION_ID: 'synthetic-bureau',
        HOTEL_PILOT_BUREAU_SCOPE_UNIT_ID: 'synthetic-unit',
        HOTEL_PILOT_ADMIN_ORGANIZATION_ID: 'synthetic-admin',
      }),
    ).toMatchObject({
      enabled: false,
      bureauRouting: expect.any(Object),
      administratorOrganizationId: null,
    });
    expect(
      await hotelPilotSettings({
        HOTEL_PILOT_ENABLED: 'true',
        HOTEL_PILOT_BUREAU_ORGANIZATION_ID: 'synthetic-bureau',
        HOTEL_PILOT_BUREAU_SCOPE_UNIT_ID: 'synthetic-unit',
        HOTEL_PILOT_ADMIN_ORGANIZATION_ID: 'synthetic-admin',
      }).bureauRouting.routesForReview(),
    ).toEqual([]);
  });
});

function routingPolicy(
  routes: readonly HotelBureauRoute[],
  unresolved: 'missing' | 'ambiguous' = 'missing',
): HotelBureauRoutingPolicy {
  return {
    resolveApplicationRoute: async () => {
      const route = routes[0];
      if (routes.length === 1 && route) return { kind: 'routed', route };
      return routes.length === 0 ? { kind: unresolved } : { kind: 'ambiguous' };
    },
    routesForReview: async () => routes,
  };
}
