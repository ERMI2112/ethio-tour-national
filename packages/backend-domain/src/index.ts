import {
  authorize,
  type AuthorizationContext,
  type AuthorizationRequirement,
  type PolicyDecision,
} from '@ethio-tour/authz';

export type BackendServiceName = 'api' | 'worker';

export { RegistryError, RegistryService } from './registry/registry-service';
export { OutboxNotificationDispatcher } from './registry/outbox-dispatcher';
export { PostgresRegistryStore } from './registry/postgres-registry-store';
export type {
  AuditRecord,
  OutboxRecord,
  PublicResourceRecord,
  RegistryActor,
  RegistryResourceRecord,
  RegistryStore,
  RegistryTransaction,
  ResourceRevisionRecord,
  ReviewDecisionRecord,
  SubmissionRecord,
  UnitScope,
} from './registry/registry-store';

export interface BackendRuntime {
  serviceName: BackendServiceName;
  databaseConfigured: boolean;
  authorize: (
    context: AuthorizationContext | null,
    requirement: AuthorizationRequirement,
  ) => PolicyDecision;
}

export function createBackendRuntime(
  serviceName: BackendServiceName,
  environment: NodeJS.ProcessEnv = process.env,
): BackendRuntime {
  return {
    serviceName,
    databaseConfigured: Boolean(environment.DATABASE_URL),
    authorize,
  };
}
