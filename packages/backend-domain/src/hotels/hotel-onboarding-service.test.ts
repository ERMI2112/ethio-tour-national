import { describe, expect, it, vi } from 'vitest';
import type { AuthorizationContext } from '@ethio-tour/authz';
import {
  HotelOnboardingError,
  HotelOnboardingService,
  hotelPilotSettings,
} from './hotel-onboarding-service';
import type { HotelOnboardingStore, HotelOnboardingTransaction } from './hotel-onboarding-store';

const actor = { issuer: 'https://identity.example.test', subjectId: 'synthetic-applicant' };
const content = {
  claimedHotelName: 'Synthetic hotel',
  applicantNotes: 'Pilot only.',
  administrativeUnitId: 'child',
};
const settings = { enabled: true, production: false, administratorOrganizationId: 'platform' };
function fixture(
  capability: 'hotel:application:bureau:read' | 'hotel:application:bureau:decide' | null = null,
) {
  const context: AuthorizationContext = {
    authenticated: true,
    subjectId: actor.subjectId,
    memberships: [{ id: 'member', organizationId: 'office-a', active: true }],
    grants: capability
      ? [
          {
            id: 'grant',
            membershipId: 'member',
            organizationId: 'office-a',
            capability,
            scopes: [{ administrativeUnitId: 'root', includeDescendants: true }],
            active: true,
            demoOnly: true,
            productionDecisionEnabled: false,
          },
        ]
      : [],
  };
  const tx = {
    getAuthorizationContext: vi.fn(async () => context),
    getAdministrativeUnitAncestorIds: vi.fn(async () => ['root', 'parent']),
    createApplication: vi.fn(async () => ({ content, status: 'draft', location: null })),
    submitApplication: vi.fn(async () => ({ content })),
    updateDraft: vi.fn(async () => ({ content })),
    listLocations: vi.fn(async () => []),
    listBureauCases: vi.fn(async () => []),
    getBureauCase: vi.fn(async () => null),
    getBureauDecisionTarget: vi.fn(async () => ({
      organizationId: 'office-a',
      administrativeUnitId: 'child',
      resourceIsSynthetic: true,
    })),
    decideBureauCase: vi.fn(async () => ({ content })),
    listAdmissionQueue: vi.fn(async () => []),
    getAdmissionDecisionTarget: vi.fn(async () => ({ resourceIsSynthetic: true })),
    decideAdmission: vi.fn(async () => ({ content })),
    appendDenial: vi.fn(async () => undefined),
  };
  const store = {
    transaction: async (work: (transaction: HotelOnboardingTransaction) => Promise<unknown>) =>
      work(tx as unknown as HotelOnboardingTransaction),
  } as HotelOnboardingStore;
  return { tx, context, store, service: new HotelOnboardingService(store, settings) };
}

describe('synthetic multi-office hotel service', () => {
  it('saves selected location but strips authority fields from domain content', async () => {
    const { tx, service } = fixture();
    await service.createApplication(actor, {
      content: { ...content, organizationId: 'forged' } as typeof content,
    });
    expect(tx.createApplication).toHaveBeenCalledWith(actor, content);
  });
  it('retains location-less legacy drafts', async () => {
    const { tx, service } = fixture();
    const legacy = { claimedHotelName: content.claimedHotelName, applicantNotes: '' };
    await service.createApplication(actor, { content: legacy });
    expect(tx.createApplication).toHaveBeenCalledWith(actor, legacy);
  });
  it.each([null, '', 12])(
    'rejects malformed selected location %s',
    async (administrativeUnitId) => {
      const { service } = fixture();
      await expect(
        service.createApplication(actor, {
          content: { ...content, administrativeUnitId } as typeof content,
        }),
      ).rejects.toMatchObject({ code: 'invalid' });
    },
  );
  it('delegates submit route resolution to the transaction', async () => {
    const { tx, service } = fixture();
    await service.submitApplication(actor, 'application', 4);
    expect(tx.submitApplication).toHaveBeenCalledWith(actor, 'application', 4);
  });
  it('propagates unavailable routing without reporting submission success', async () => {
    const { tx, service } = fixture();
    tx.submitApplication.mockRejectedValueOnce(new HotelOnboardingError('unavailable', 'route'));
    await expect(service.submitApplication(actor, 'application', 4)).rejects.toMatchObject({
      code: 'unavailable',
    });
  });
  it('protects Bureau and administrator queue entry capabilities', async () => {
    const { service, tx } = fixture();
    await expect(service.listBureauCases(actor)).rejects.toMatchObject({ code: 'forbidden' });
    await expect(service.listAdmissionQueue(actor)).rejects.toMatchObject({ code: 'forbidden' });
    expect(tx.listBureauCases).not.toHaveBeenCalled();
  });
  it('delegates saved-case filtering to the transaction', async () => {
    const { service, tx } = fixture('hotel:application:bureau:read');
    expect(await service.listBureauCases(actor)).toEqual({ items: [] });
    expect(tx.listBureauCases).toHaveBeenCalledWith(actor);
  });
  it('makes unknown and inaccessible case details non-enumerating', async () => {
    const { service } = fixture();
    await expect(service.getBureauCase(actor, 'known-wrong-office')).rejects.toMatchObject({
      code: 'not_found',
    });
    await expect(service.getBureauCase(actor, 'unknown')).rejects.toMatchObject({
      code: 'not_found',
    });
  });
  it('authorizes descendants with server-fetched ancestors', async () => {
    const { service, tx } = fixture('hotel:application:bureau:decide');
    await service.decideBureauCase(actor, 'case', {
      expectedVersion: 2,
      decision: 'approve',
      reason: 'Synthetic review',
    });
    expect(tx.getAdministrativeUnitAncestorIds).toHaveBeenCalledWith('child');
    expect(tx.decideBureauCase).toHaveBeenCalled();
  });
  it('does not combine scope and capability from different grants', async () => {
    const { service, tx, context } = fixture('hotel:application:bureau:decide');
    const original = context.grants[0]!;
    context.grants = [
      { ...original, scopes: [{ administrativeUnitId: 'elsewhere', includeDescendants: false }] },
      { ...original, id: 'read', capability: 'hotel:application:bureau:read' },
    ];
    await expect(
      service.decideBureauCase(actor, 'case', {
        expectedVersion: 2,
        decision: 'approve',
        reason: 'Synthetic review',
      }),
    ).rejects.toMatchObject({ code: 'forbidden' });
    expect(tx.decideBureauCase).not.toHaveBeenCalled();
  });
  it('protects directory authentication', async () => {
    const { service, context } = fixture();
    context.authenticated = false;
    await expect(service.listLocations(actor)).rejects.toMatchObject({ code: 'unauthenticated' });
  });
  it('ignores static Bureau environment routing and disables production', () => {
    expect(
      hotelPilotSettings({
        NODE_ENV: 'development',
        HOTEL_PILOT_ENABLED: 'true',
        HOTEL_PILOT_BUREAU_ORGANIZATION_ID: 'forged',
      }),
    ).toEqual({ enabled: true, production: false, administratorOrganizationId: null });
    expect(
      hotelPilotSettings({ NODE_ENV: 'production', HOTEL_PILOT_ENABLED: 'true' }).enabled,
    ).toBe(false);
  });

  it('allows an authenticated applicant without a membership to save private drafts', async () => {
    const { service, context, tx } = fixture();
    context.memberships = [];
    await service.createApplication(actor, { content });
    expect(tx.createApplication).toHaveBeenCalledWith(actor, content);
    expect(tx.getAuthorizationContext).toHaveBeenCalledWith(actor);
  });
  it('rejects unauthenticated creation before storage', async () => {
    const { service, context, tx } = fixture();
    context.authenticated = false;
    await expect(service.createApplication(actor, { content })).rejects.toMatchObject({
      code: 'unauthenticated',
    });
    expect(tx.createApplication).not.toHaveBeenCalled();
  });
  it.each(['', ' '.repeat(3), 'x'.repeat(1001)])(
    'rejects invalid decision reasons before decision storage',
    async (reason) => {
      const { service, tx } = fixture('hotel:application:bureau:decide');
      await expect(
        service.decideBureauCase(actor, 'case', {
          expectedVersion: 1,
          decision: 'approve',
          reason,
        }),
      ).rejects.toMatchObject({ code: 'invalid' });
      expect(tx.decideBureauCase).not.toHaveBeenCalled();
    },
  );
  it.each(['claimedHotelName', 'applicantNotes'])(
    'rejects invalid %s before creating a draft',
    async (key) => {
      const { service, tx } = fixture();
      await expect(
        service.createApplication(actor, { content: { ...content, [key]: 'x'.repeat(2001) } }),
      ).rejects.toMatchObject({ code: 'invalid' });
      expect(tx.createApplication).not.toHaveBeenCalled();
    },
  );
  it('requires server administrator configuration before querying admission', async () => {
    const { store, tx } = fixture();
    const service = new HotelOnboardingService(store, {
      ...settings,
      administratorOrganizationId: null,
    });
    await expect(service.listAdmissionQueue(actor)).rejects.toMatchObject({ code: 'unavailable' });
    expect(tx.listAdmissionQueue).not.toHaveBeenCalled();
  });
  it.each(['submitter-cannot-decide', 'applicant-cannot-admit-own-application'])(
    'preserves independent-reviewer denial %s',
    async (reason) => {
      const { service, tx, context } = fixture('hotel:application:bureau:decide');
      const admission = reason === 'applicant-cannot-admit-own-application';
      if (admission) {
        context.memberships = [{ id: 'admin', organizationId: 'platform', active: true }];
        context.grants = [
          {
            ...context.grants[0]!,
            membershipId: 'admin',
            organizationId: 'platform',
            capability: 'hotel:application:admin:decide',
            scopes: [],
          },
        ];
        tx.decideAdmission.mockRejectedValueOnce(new HotelOnboardingError('forbidden', reason));
      } else
        tx.decideBureauCase.mockRejectedValueOnce(new HotelOnboardingError('forbidden', reason));
      await expect(
        admission
          ? service.decideAdmission(actor, 'case', {
              expectedVersion: 2,
              decision: 'admit',
              reason: 'Synthetic admission',
            })
          : service.decideBureauCase(actor, 'case', {
              expectedVersion: 2,
              decision: 'approve',
              reason: 'Synthetic review',
            }),
      ).rejects.toMatchObject({ code: 'forbidden', reason });
      expect(tx.appendDenial).toHaveBeenCalledWith(
        actor,
        admission ? 'hotel.application.admission.decide' : 'hotel.application.bureau.decide',
        'case',
        reason,
      );
    },
  );
  it.each(['The application changed.', 'This application is terminal.'])(
    'forwards stale/terminal transaction conflicts %s',
    async (reason) => {
      const { service, tx } = fixture();
      tx.submitApplication.mockRejectedValueOnce(new HotelOnboardingError('conflict', reason));
      await expect(service.submitApplication(actor, 'application', 19)).rejects.toMatchObject({
        code: 'conflict',
        reason,
      });
      expect(tx.submitApplication).toHaveBeenCalledWith(actor, 'application', 19);
      expect(tx.appendDenial).toHaveBeenCalledWith(
        actor,
        'hotel.application.submit',
        'application',
        reason,
      );
    },
  );
  it('audits a denial in a separate transaction after the mutation rolled back', async () => {
    const events: string[] = [];
    const { tx } = fixture();
    tx.submitApplication.mockRejectedValueOnce(new HotelOnboardingError('conflict', 'stale'));
    const store: HotelOnboardingStore = {
      async transaction(work) {
        events.push('begin');
        try {
          const value = await work(tx as unknown as HotelOnboardingTransaction);
          events.push('commit');
          return value;
        } catch (error) {
          events.push('rollback');
          throw error;
        }
      },
    };
    tx.appendDenial.mockImplementationOnce(async () => {
      events.push('denial');
    });
    await expect(
      new HotelOnboardingService(store, settings).submitApplication(actor, 'app', 1),
    ).rejects.toMatchObject({ code: 'conflict' });
    expect(events).toEqual(['begin', 'rollback', 'begin', 'denial', 'commit']);
  });
  it('does not execute transaction work when pilot is disabled or production', async () => {
    const { store, tx } = fixture();
    for (const flags of [
      { enabled: false, production: false },
      { enabled: true, production: true },
    ]) {
      await expect(
        new HotelOnboardingService(store, { ...settings, ...flags }).createApplication(actor, {
          content,
        }),
      ).rejects.toMatchObject({ code: 'unavailable' });
    }
    expect(tx.createApplication).not.toHaveBeenCalled();
  });
});
