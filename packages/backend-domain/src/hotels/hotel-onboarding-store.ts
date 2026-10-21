import type { AuthorizationContext } from '@ethio-tour/authz';
import type {
  HotelAdmissionDecision,
  HotelApplicationContent,
  HotelApplicationResponse,
  HotelBureauCaseResponse,
  HotelLocation,
} from '@ethio-tour/contracts';

import type { RegistryActor } from '../registry/registry-store';

export interface HotelBureauRoute {
  organizationId: string;
  administrativeUnitId: string;
}

export type HotelBureauRouteResolution =
  | { kind: 'routed'; route: HotelBureauRoute }
  | { kind: 'missing' }
  | { kind: 'ambiguous' };

export interface HotelBureauRoutingPolicy {
  resolveApplicationRoute(
    applicationId: string,
  ): HotelBureauRouteResolution | Promise<HotelBureauRouteResolution>;
  routesForReview(): readonly HotelBureauRoute[] | Promise<readonly HotelBureauRoute[]>;
}

export interface HotelPilotSettings {
  enabled: boolean;
  production: boolean;
  administratorOrganizationId: string | null;
}

export interface HotelDecisionTarget {
  organizationId: string | null;
  administrativeUnitId: string | null;
  resourceIsSynthetic: boolean;
}

export interface HotelOnboardingTransaction {
  listLocations(): Promise<HotelLocation[]>;
  getAdministrativeUnitAncestorIds(unitId: string): Promise<string[]>;
  getAuthorizationContext(actor: RegistryActor): Promise<AuthorizationContext>;
  createApplication(
    actor: RegistryActor,
    content: HotelApplicationContent,
  ): Promise<HotelApplicationResponse>;
  listOwnedApplications(actor: RegistryActor): Promise<HotelApplicationResponse[]>;
  getOwnedApplication(
    actor: RegistryActor,
    applicationId: string,
  ): Promise<HotelApplicationResponse | null>;
  updateDraft(
    actor: RegistryActor,
    applicationId: string,
    expectedVersion: number,
    content: HotelApplicationContent,
  ): Promise<HotelApplicationResponse | null>;
  submitApplication(
    actor: RegistryActor,
    applicationId: string,
    expectedVersion: number,
  ): Promise<HotelApplicationResponse | null>;
  getBureauDecisionTarget(caseId: string): Promise<HotelDecisionTarget | null>;
  listBureauCases(actor: RegistryActor): Promise<HotelBureauCaseResponse[]>;
  getBureauCase(actor: RegistryActor, caseId: string): Promise<HotelBureauCaseResponse | null>;
  decideBureauCase(
    actor: RegistryActor,
    caseId: string,
    expectedVersion: number,
    decision: 'approve' | 'request_changes' | 'reject',
    reason: string,
    route: HotelBureauRoute,
  ): Promise<HotelApplicationResponse | null>;
  getAdmissionDecisionTarget(applicationId: string): Promise<HotelDecisionTarget | null>;
  listAdmissionQueue(administratorOrganizationId: string): Promise<HotelApplicationResponse[]>;
  decideAdmission(
    actor: RegistryActor,
    applicationId: string,
    expectedVersion: number,
    decision: HotelAdmissionDecision,
    reason: string,
    administratorOrganizationId: string,
  ): Promise<HotelApplicationResponse | null>;
  getProviderWorkspace(
    actor: RegistryActor,
    applicationId: string,
  ): Promise<HotelApplicationResponse | null>;
  appendDenial(
    actor: RegistryActor,
    action: string,
    targetId: string | null,
    reason: string,
  ): Promise<void>;
}

export interface HotelOnboardingStore {
  transaction<T>(work: (transaction: HotelOnboardingTransaction) => Promise<T>): Promise<T>;
}
