import {
  authorize,
  type AuthorizationContext,
  type AuthorizationRequirement,
  type PolicyDecision,
} from '@ethio-tour/authz';

export type BackendServiceName = 'api' | 'worker';

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
