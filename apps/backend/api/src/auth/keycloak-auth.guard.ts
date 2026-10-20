import { Injectable, UnauthorizedException } from '@nestjs/common';
import type { CanActivate, ExecutionContext } from '@nestjs/common';
import { createRemoteJWKSet, jwtVerify } from 'jose';

import type { RegistryActor } from '@ethio-tour/backend-domain';

interface AuthenticatedRequest {
  headers: { authorization?: string };
  registryActor?: RegistryActor;
}

export interface IssuerConfiguration {
  canonicalIssuer: string;
  acceptedIssuers: readonly string[];
  issuerAliases: readonly string[];
  jwksUrl: URL;
}

export interface ApiTokenConfiguration {
  audience: string;
  allowedClients: readonly string[];
}

@Injectable()
export class KeycloakAuthGuard implements CanActivate {
  private readonly keySets = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = bearerToken(request.headers.authorization);
    if (!token) throw new UnauthorizedException('A valid bearer access token is required.');

    let identity: IssuerConfiguration;
    let tokenConfiguration: ApiTokenConfiguration;
    try {
      identity = issuerConfiguration(process.env);
      tokenConfiguration = apiTokenConfiguration(process.env);
    } catch {
      throw new UnauthorizedException('Identity verification is unavailable.');
    }
    const jwks = this.keySets.get(identity.jwksUrl.href) ?? createRemoteJWKSet(identity.jwksUrl);
    this.keySets.set(identity.jwksUrl.href, jwks);

    try {
      const { payload } = await jwtVerify(token, jwks, {
        issuer: [...identity.acceptedIssuers],
        algorithms: ['RS256'],
      });
      if (
        typeof payload.sub !== 'string' ||
        payload.sub.length === 0 ||
        typeof payload.iss !== 'string' ||
        payload.typ !== 'Bearer' ||
        typeof payload.azp !== 'string' ||
        !apiTokenClaimsAllowed(payload, tokenConfiguration)
      ) {
        throw new Error('Token claims are not accepted.');
      }
      if (!identity.acceptedIssuers.includes(normalizeIssuer(payload.iss))) {
        throw new Error('Token issuer is not accepted.');
      }
      request.registryActor = {
        issuer: identity.canonicalIssuer,
        issuerAliases: identity.issuerAliases,
        subjectId: payload.sub,
      };
      return true;
    } catch {
      throw new UnauthorizedException('The bearer access token is invalid or expired.');
    }
  }
}

function bearerToken(header: string | undefined): string | null {
  const match = header?.match(/^Bearer\s+([^\s]+)$/i);
  return match?.[1] ?? null;
}

export function issuerConfiguration(environment: NodeJS.ProcessEnv): IssuerConfiguration {
  const jwksSource = environment.KEYCLOAK_JWKS_URL ?? environment.KEYCLOAK_ISSUER_URL;
  const canonicalSource =
    environment.KEYCLOAK_CANONICAL_ISSUER_URL ?? environment.KEYCLOAK_PUBLIC_ISSUER_URL;
  if (!jwksSource || !canonicalSource)
    throw new Error('Issuer and JWKS configuration are required.');

  const jwksBase = normalizeIssuer(jwksSource);
  const canonicalIssuer = normalizeIssuer(canonicalSource);
  const aliases = (environment.KEYCLOAK_ISSUER_ALIASES ?? '')
    .split(',')
    .map((alias) => alias.trim())
    .filter(Boolean)
    .map(normalizeIssuer);
  const acceptedIssuers = [...new Set([canonicalIssuer, ...aliases])];
  const jwksUrl = environment.KEYCLOAK_JWKS_URL
    ? new URL(normalizeIssuer(environment.KEYCLOAK_JWKS_URL))
    : new URL(
        `${new URL(jwksBase).pathname.replace(/\/$/, '')}/protocol/openid-connect/certs`,
        jwksBase,
      );

  return {
    canonicalIssuer,
    acceptedIssuers,
    issuerAliases: acceptedIssuers.filter((issuer) => issuer !== canonicalIssuer),
    jwksUrl,
  };
}

export function apiTokenConfiguration(environment: NodeJS.ProcessEnv): ApiTokenConfiguration {
  const audience = environment.OIDC_API_AUDIENCE?.trim();
  const allowedClients = (environment.OIDC_ALLOWED_CLIENTS ?? '')
    .split(',')
    .map((clientId) => clientId.trim())
    .filter(Boolean);
  if (!audience || allowedClients.length === 0) {
    throw new Error('API token audience and client allowlist are required.');
  }
  return { audience, allowedClients: [...new Set(allowedClients)] };
}

export function apiTokenClaimsAllowed(
  payload: { azp?: unknown; aud?: string | string[] },
  configuration: ApiTokenConfiguration,
): boolean {
  return (
    typeof payload.azp === 'string' &&
    configuration.allowedClients.includes(payload.azp) &&
    audienceContains(payload.aud, configuration.audience)
  );
}

function normalizeIssuer(value: string): string {
  const url = new URL(value.trim());
  if (
    (url.protocol !== 'https:' && url.protocol !== 'http:') ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  ) {
    throw new Error('Issuer URL is invalid.');
  }
  return url.href.replace(/\/$/, '');
}

function audienceContains(audience: string | string[] | undefined, expected: string): boolean {
  return Array.isArray(audience) ? audience.includes(expected) : audience === expected;
}
