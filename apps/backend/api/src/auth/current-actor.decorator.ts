import { createParamDecorator } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';

import type { RegistryActor } from '@ethio-tour/backend-domain';

interface AuthenticatedRequest {
  registryActor: RegistryActor;
}

export const CurrentActor = createParamDecorator(
  (_data: unknown, context: ExecutionContext): RegistryActor =>
    context.switchToHttp().getRequest<AuthenticatedRequest>().registryActor,
);
