import { UnauthorizedException } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import { describe, expect, it } from 'vitest';

import { KeycloakAuthGuard } from './keycloak-auth.guard';

describe('KeycloakAuthGuard', () => {
  it('fails closed when a request has no bearer access token', async () => {
    const context = {
      switchToHttp: () => ({ getRequest: () => ({ headers: {} }) }),
    } as ExecutionContext;

    await expect(new KeycloakAuthGuard().canActivate(context)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });
});
