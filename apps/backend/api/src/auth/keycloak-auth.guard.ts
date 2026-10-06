import { Injectable, UnauthorizedException } from '@nestjs/common';
import type { CanActivate, ExecutionContext } from '@nestjs/common';
import { createRemoteJWKSet, jwtVerify } from 'jose';

import type { RegistryActor } from '@ethio-tour/backend-domain';

interface AuthenticatedRequest {
  headers: { authorization?: string };
  registryActor?: RegistryActor;
}

@Injectable()
export class KeycloakAuthGuard implements CanActivate {
  private readonly keySets = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = bearerToken(request.headers.authorization);
    if (!token) throw new UnauthorizedException('A valid bearer access token is required.');

    const configuredIssuer = process.env.KEYCLOAK_ISSUER_URL;
    if (!configuredIssuer) throw new UnauthorizedException('Identity verification is unavailable.');

    const issuerUrl = new URL(configuredIssuer);
    const jwksUrl = new URL(
      `${issuerUrl.pathname.replace(/\/$/, '')}/protocol/openid-connect/certs`,
      issuerUrl,
    );
    const jwks = this.keySets.get(jwksUrl.href) ?? createRemoteJWKSet(jwksUrl);
    this.keySets.set(jwksUrl.href, jwks);

    try {
      const { payload } = await jwtVerify(token, jwks, {
        issuer: acceptedIssuers(issuerUrl),
        algorithms: ['RS256'],
      });
      const allowedClients = new Set(
        (process.env.OIDC_ALLOWED_CLIENTS ?? 'public-web,workspace-web')
          .split(',')
          .map((clientId) => clientId.trim())
          .filter(Boolean),
      );
      if (
        typeof payload.sub !== 'string' ||
        typeof payload.iss !== 'string' ||
        payload.typ !== 'Bearer' ||
        typeof payload.azp !== 'string' ||
        !allowedClients.has(payload.azp)
      ) {
        throw new Error('Token claims are not accepted.');
      }
      const expectedAudience = process.env.OIDC_API_AUDIENCE;
      if (expectedAudience && !audienceContains(payload.aud, expectedAudience)) {
        throw new Error('Token audience is not accepted.');
      }
      request.registryActor = { issuer: payload.iss, subjectId: payload.sub };
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

function acceptedIssuers(configured: URL): string[] {
  const issuers = [configured.href.replace(/\/$/, '')];
  const publicIssuer = process.env.KEYCLOAK_PUBLIC_ISSUER_URL;
  if (publicIssuer) {
    const external = new URL(publicIssuer);
    if (external.pathname.replace(/\/$/, '') !== configured.pathname.replace(/\/$/, '')) {
      throw new UnauthorizedException('Identity issuer configuration is inconsistent.');
    }
    issuers.push(external.href.replace(/\/$/, ''));
  } else if (
    configured.protocol === 'http:' &&
    configured.hostname === 'keycloak' &&
    configured.port === '8080'
  ) {
    const localBrowserIssuer = new URL(configured.href);
    localBrowserIssuer.hostname = 'localhost';
    issuers.push(localBrowserIssuer.href.replace(/\/$/, ''));
  }
  return [...new Set(issuers)];
}

function audienceContains(audience: string | string[] | undefined, expected: string): boolean {
  return Array.isArray(audience) ? audience.includes(expected) : audience === expected;
}
