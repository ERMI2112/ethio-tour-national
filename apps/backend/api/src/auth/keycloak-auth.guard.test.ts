import { UnauthorizedException } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import { describe, expect, it } from 'vitest';

import {
  apiTokenConfiguration,
  apiTokenClaimsAllowed,
  issuerConfiguration,
  KeycloakAuthGuard,
} from './keycloak-auth.guard';

describe('KeycloakAuthGuard', () => {
  it('fails closed when a request has no bearer access token', async () => {
    const context = {
      switchToHttp: () => ({ getRequest: () => ({ headers: {} }) }),
    } as ExecutionContext;

    await expect(new KeycloakAuthGuard().canActivate(context)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('keeps the internal JWKS address separate from one canonical token issuer', () => {
    const config = issuerConfiguration({
      KEYCLOAK_ISSUER_URL: 'http://keycloak:8080/realms/pilot',
      KEYCLOAK_CANONICAL_ISSUER_URL: 'http://localhost:8080/realms/pilot',
      KEYCLOAK_ISSUER_ALIASES: 'http://keycloak:8080/realms/pilot',
    });

    expect(config.canonicalIssuer).toBe('http://localhost:8080/realms/pilot');
    expect(config.acceptedIssuers).toEqual([
      'http://localhost:8080/realms/pilot',
      'http://keycloak:8080/realms/pilot',
    ]);
    expect(config.issuerAliases).toEqual(['http://keycloak:8080/realms/pilot']);
    expect(config.jwksUrl.href).toBe(
      'http://keycloak:8080/realms/pilot/protocol/openid-connect/certs',
    );
  });

  it('does not implicitly accept the internal issuer or localhost aliases', () => {
    const config = issuerConfiguration({
      KEYCLOAK_ISSUER_URL: 'http://keycloak:8080/realms/pilot',
      KEYCLOAK_CANONICAL_ISSUER_URL: 'https://identity.example.test/realms/pilot',
    });

    expect(config.acceptedIssuers).toEqual(['https://identity.example.test/realms/pilot']);
    expect(config.issuerAliases).toEqual([]);
  });

  it('never treats the internal JWKS base as a canonical token issuer', () => {
    expect(() =>
      issuerConfiguration({ KEYCLOAK_ISSUER_URL: 'http://keycloak:8080/realms/pilot' }),
    ).toThrow('Issuer and JWKS configuration are required.');
  });

  it('requires both a configured API audience and an explicit allowed-client list', () => {
    expect(() => apiTokenConfiguration({ OIDC_ALLOWED_CLIENTS: 'workspace-web' })).toThrow();
    expect(() => apiTokenConfiguration({ OIDC_API_AUDIENCE: 'ethiotour-api' })).toThrow();
    expect(
      apiTokenConfiguration({
        OIDC_API_AUDIENCE: 'ethiotour-api',
        OIDC_ALLOWED_CLIENTS: 'workspace-web,workspace-web',
      }),
    ).toEqual({ audience: 'ethiotour-api', allowedClients: ['workspace-web'] });
  });

  it('accepts only workspace tokens carrying the configured API audience', () => {
    const configuration = {
      audience: 'ethiotour-api',
      allowedClients: ['workspace-web'],
    };
    expect(
      apiTokenClaimsAllowed(
        { azp: 'workspace-web', aud: ['account', 'ethiotour-api'] },
        configuration,
      ),
    ).toBe(true);
    expect(
      apiTokenClaimsAllowed({ azp: 'workspace-web', aud: 'workspace-web' }, configuration),
    ).toBe(false);
    expect(apiTokenClaimsAllowed({ azp: 'public-web', aud: 'ethiotour-api' }, configuration)).toBe(
      false,
    );
  });

  it('rejects credentials, query strings and fragments in issuer configuration', () => {
    expect(() =>
      issuerConfiguration({
        KEYCLOAK_ISSUER_URL: 'http://keycloak:8080/realms/pilot',
        KEYCLOAK_CANONICAL_ISSUER_URL: 'https://user:password@example.test/realm',
      }),
    ).toThrow();
    expect(() =>
      issuerConfiguration({
        KEYCLOAK_ISSUER_URL: 'http://keycloak:8080/realms/pilot',
        KEYCLOAK_CANONICAL_ISSUER_URL: 'https://identity.example.test/realm?query=1',
      }),
    ).toThrow();
  });
});
