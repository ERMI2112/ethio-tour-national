import { authorize } from '@ethio-tour/authz';
import type { Capability } from '@ethio-tour/authz';
import type {
  DecideHotelAdmissionRequest,
  DecideHotelApplicationRequest,
  HotelApplicationContent,
} from '@ethio-tour/contracts';

import type { RegistryActor } from '../registry/registry-store';
import type {
  HotelOnboardingStore,
  HotelOnboardingTransaction,
  HotelPilotSettings,
} from './hotel-onboarding-store';

export class HotelOnboardingError extends Error {
  constructor(
    public readonly code:
      | 'unauthenticated'
      | 'forbidden'
      | 'not_found'
      | 'conflict'
      | 'invalid'
      | 'unavailable',
    public readonly reason: string,
  ) {
    super(reason);
    this.name = 'HotelOnboardingError';
  }
}

export function hotelPilotSettings(
  environment: NodeJS.ProcessEnv = process.env,
): HotelPilotSettings {
  const production = environment.NODE_ENV === 'production';
  const syntheticRuntime =
    environment.NODE_ENV === 'development' || environment.NODE_ENV === 'test';
  const administratorOrganizationId = environment.HOTEL_PILOT_ADMIN_ORGANIZATION_ID?.trim();

  return {
    enabled: environment.HOTEL_PILOT_ENABLED === 'true' && syntheticRuntime,
    production,
    administratorOrganizationId: syntheticRuntime ? administratorOrganizationId || null : null,
  };
}

export class HotelOnboardingService {
  constructor(
    private readonly store: HotelOnboardingStore,
    private readonly settings: HotelPilotSettings = hotelPilotSettings(),
  ) {}

  async listLocations(actor: RegistryActor) {
    this.requireEnabled();
    return this.mutate(actor, 'hotel.locations.read', null, async (tx) => ({
      items: await tx.listLocations(),
    }));
  }

  async getBureauCase(actor: RegistryActor, caseId: string) {
    this.requireEnabled();
    return this.mutate(actor, 'hotel.application.bureau.read', caseId, async (tx) => {
      const result = await tx.getBureauCase(actor, caseId);
      if (!result) throw notFound();
      return result;
    });
  }

  async createApplication(actor: RegistryActor, input: { content: HotelApplicationContent }) {
    this.requireEnabled();
    return this.mutate(actor, 'hotel.application.create', null, async (tx) => {
      const content = validateContent(input.content);
      return tx.createApplication(actor, content);
    });
  }

  async listMyApplications(actor: RegistryActor) {
    this.requireEnabled();
    return this.store.transaction(async (tx) => ({ items: await tx.listOwnedApplications(actor) }));
  }

  async getMyApplication(actor: RegistryActor, applicationId: string) {
    this.requireEnabled();
    return this.store.transaction(async (tx) => {
      const application = await tx.getOwnedApplication(actor, applicationId);
      if (!application) throw notFound();
      return application;
    });
  }

  async updateDraft(
    actor: RegistryActor,
    applicationId: string,
    expectedVersion: number,
    content: HotelApplicationContent,
  ) {
    this.requireEnabled();
    return this.mutate(actor, 'hotel.application.update_draft', applicationId, async (tx) => {
      const result = await tx.updateDraft(
        actor,
        applicationId,
        expectedVersion,
        validateContent(content),
      );
      if (!result) throw notFound();
      return result;
    });
  }

  async submitApplication(actor: RegistryActor, applicationId: string, expectedVersion: number) {
    this.requireEnabled();
    return this.mutate(actor, 'hotel.application.submit', applicationId, async (tx) => {
      const result = await tx.submitApplication(actor, applicationId, expectedVersion);
      if (!result) throw notFound();
      return result;
    });
  }

  async listBureauCases(actor: RegistryActor) {
    this.requireEnabled();
    return this.mutate(actor, 'hotel.application.bureau.queue', null, async (tx) => {
      const access = authorize(await tx.getAuthorizationContext(actor), {
        capability: 'hotel:application:bureau:read',
        resourceIsSynthetic: true,
      });
      if (!access.allowed) throw forbidden(access.reason);
      return { items: await tx.listBureauCases(actor) };
    });
  }

  async decideBureauCase(
    actor: RegistryActor,
    caseId: string,
    request: DecideHotelApplicationRequest,
  ) {
    this.requireEnabled();
    const reason = validateReason(request.reason);
    return this.mutate(actor, 'hotel.application.bureau.decide', caseId, async (tx) => {
      const target = await tx.getBureauDecisionTarget(caseId);
      if (!target?.organizationId || !target.administrativeUnitId) throw notFound();
      const route = {
        organizationId: target.organizationId,
        administrativeUnitId: target.administrativeUnitId,
      };
      const authorization = authorize(await tx.getAuthorizationContext(actor), {
        capability: 'hotel:application:bureau:decide',
        organizationId: route.organizationId,
        administrativeUnitId: route.administrativeUnitId,
        administrativeUnitAncestorIds: await tx.getAdministrativeUnitAncestorIds(
          route.administrativeUnitId,
        ),
        resourceIsSynthetic: target.resourceIsSynthetic,
      });
      if (!authorization.allowed) throw forbidden(authorization.reason);

      const result = await tx.decideBureauCase(
        actor,
        caseId,
        request.expectedVersion,
        request.decision,
        reason,
        route,
      );
      if (!result) throw notFound();
      return result;
    });
  }

  async listAdmissionQueue(actor: RegistryActor) {
    this.requireEnabled();
    const organizationId = this.requireAdministratorOrganization();
    return this.withAuthorization(
      actor,
      'hotel.application.admission.queue',
      {
        capability: 'hotel:application:admin:read',
        organizationId,
        resourceIsSynthetic: true,
      },
      async (tx) => ({ items: await tx.listAdmissionQueue(organizationId) }),
    );
  }

  async decideAdmission(
    actor: RegistryActor,
    applicationId: string,
    request: DecideHotelAdmissionRequest,
  ) {
    this.requireEnabled();
    const organizationId = this.requireAdministratorOrganization();
    const reason = validateReason(request.reason);
    return this.withAuthorization(
      actor,
      'hotel.application.admission.decide',
      {
        capability: 'hotel:application:admin:decide',
        organizationId,
        resourceIsSynthetic: true,
      },
      async (tx) => {
        const target = await tx.getAdmissionDecisionTarget(applicationId);
        if (!target) throw notFound();
        const result = await tx.decideAdmission(
          actor,
          applicationId,
          request.expectedVersion,
          request.decision,
          reason,
          organizationId,
        );
        if (!result) throw notFound();
        return result;
      },
      applicationId,
    );
  }

  async getProviderWorkspace(actor: RegistryActor, applicationId: string) {
    this.requireEnabled();
    const result = await this.store
      .transaction(async (tx) => {
        const application = await tx.getProviderWorkspace(actor, applicationId);
        if (!application) throw notFound();
        return application;
      })
      .catch(async (error: unknown) => {
        if (error instanceof HotelOnboardingError && error.code === 'not_found') {
          await this.store.transaction((tx) =>
            tx.appendDenial(actor, 'hotel.workspace.read', applicationId, 'not-found-or-no-grant'),
          );
        }
        throw error;
      });
    return result;
  }

  private async mutate<T>(
    actor: RegistryActor,
    action: string,
    targetId: string | null,
    operation: (tx: HotelOnboardingTransaction) => Promise<T>,
  ): Promise<T> {
    try {
      return await this.store.transaction(async (tx) => {
        const context = await tx.getAuthorizationContext(actor);
        if (!context.authenticated || !context.subjectId)
          throw new HotelOnboardingError('unauthenticated', 'A verified identity is required.');
        return operation(tx);
      });
    } catch (error) {
      if (error instanceof HotelOnboardingError && ['forbidden', 'conflict'].includes(error.code)) {
        await this.store.transaction((tx) =>
          tx.appendDenial(actor, action, targetId, error.reason),
        );
      }
      throw error;
    }
  }

  private async withAuthorization<T>(
    actor: RegistryActor,
    action: string,
    requirement: {
      capability: Capability;
      organizationId: string;
      administrativeUnitId?: string;
      resourceIsSynthetic: true;
    },
    operation: (tx: HotelOnboardingTransaction) => Promise<T>,
    targetId: string | null = null,
  ): Promise<T> {
    return this.mutate(actor, action, targetId, async (tx) => {
      const decision = authorize(await tx.getAuthorizationContext(actor), requirement);
      if (!decision.allowed) {
        throw new HotelOnboardingError('forbidden', decision.reason);
      }
      return operation(tx);
    });
  }

  private requireEnabled(): void {
    if (!this.settings.enabled || this.settings.production) {
      throw new HotelOnboardingError('unavailable', 'The synthetic hotel pilot is disabled.');
    }
  }

  private requireAdministratorOrganization(): string {
    const organizationId = this.settings.administratorOrganizationId;
    if (!organizationId) {
      throw new HotelOnboardingError(
        'unavailable',
        'The synthetic Administrator organization is not configured.',
      );
    }
    return organizationId;
  }
}

function validateContent(content: HotelApplicationContent): HotelApplicationContent {
  if (!content || typeof content !== 'object') throw invalid('Application content is required.');
  const claimedHotelName = content.claimedHotelName?.trim();
  const applicantNotes = content.applicantNotes?.trim();
  if (!claimedHotelName || claimedHotelName.length > 160)
    throw invalid('Enter a hotel name of at most 160 characters.');
  if (typeof applicantNotes !== 'string' || applicantNotes.length > 2000)
    throw invalid('Applicant notes must be at most 2000 characters.');
  const unitId = content.administrativeUnitId;
  if (unitId !== undefined && (typeof unitId !== 'string' || !unitId.trim() || unitId.length > 200))
    throw invalid('Enter a valid administrative unit ID.');
  return {
    claimedHotelName,
    applicantNotes,
    ...(unitId === undefined ? {} : { administrativeUnitId: unitId.trim() }),
  };
}

function validateReason(reason: string): string {
  const normalized = reason?.trim();
  if (!normalized || normalized.length > 1000)
    throw invalid('A decision reason of at most 1000 characters is required.');
  return normalized;
}

function invalid(message: string): HotelOnboardingError {
  return new HotelOnboardingError('invalid', message);
}

function forbidden(reason: string): HotelOnboardingError {
  return new HotelOnboardingError('forbidden', reason);
}

function notFound(): HotelOnboardingError {
  return new HotelOnboardingError('not_found', 'The private hotel application was not found.');
}
