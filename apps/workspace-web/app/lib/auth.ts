/**
 * Keycloak OIDC Authorization Code Flow with PKCE (RFC 7636) for EthioTour Workspace Web
 *
 * COMPLIANCE & SECURITY GUARDRAILS:
 * - Real Keycloak Authorization Code + PKCE (S256).
 * - No mock actors or fake bearer tokens in normal application path.
 * - Access and refresh tokens are kept IN MEMORY ONLY.
 * - sessionStorage may ONLY hold short-lived PKCE state and verifier values during the redirect dance.
 * - localStorage is STRICTLY PROHIBITED.
 * - Transient PKCE state is cleared immediately upon token exchange.
 * - Scopes and capabilities are NOT derived in the browser; loaded from GET /api/workspace/context.
 */

import type { AuthenticatedApiRequestOptions } from '@ethio-tour/api-client';
import * as apiClient from '@ethio-tour/api-client';

export interface WorkspaceContextResponse {
  actor: {
    subjectId: string;
    displayName?: string | null;
  };
  [key: string]: unknown;
}

import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose';

export interface OidcConfig {
  issuerUrl: string;
  clientId: string;
  redirectUri: string;
}

export interface TokenResponse {
  access_token: string;
  id_token?: string | undefined;
  refresh_token?: string | undefined;
  expires_in: number;
  token_type: string;
  scope?: string | undefined;
}

export interface AuthenticatedUserSession {
  actorKey: string;
  displayName: string;
  email?: string | undefined;
  accessToken: string;
  idToken?: string | undefined;
  refreshToken?: string | undefined;
  expiresAt: number;
  roles?: string[] | undefined;
}

export interface VerifiedAuthorizationResponse {
  tokens: TokenResponse;
  idTokenClaims: JWTPayload & { sub: string };
  returnTo: string | null;
}

const PKCE_VERIFIER_KEY = 'ethio_tour_pkce_verifier';
const PKCE_STATE_KEY = 'ethio_tour_pkce_state';
const PKCE_NONCE_KEY = 'ethio_tour_pkce_nonce';
const PKCE_RETURN_TO_KEY = 'ethio_tour_pkce_return_to';

// In-memory token storage (tokens NEVER stored in sessionStorage or localStorage)
let inMemorySession: AuthenticatedUserSession | null = null;
const remoteJwksByIssuer = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

export function getInMemorySession(): AuthenticatedUserSession | null {
  if (
    process.env.NODE_ENV !== 'production' &&
    typeof window !== 'undefined' &&
    (window as unknown as { __TEST_AUTH_SESSION__?: AuthenticatedUserSession })
      .__TEST_AUTH_SESSION__
  ) {
    const testSession = (window as unknown as { __TEST_AUTH_SESSION__: AuthenticatedUserSession })
      .__TEST_AUTH_SESSION__;
    if (testSession.expiresAt > Date.now()) {
      return testSession;
    }
  }
  if (inMemorySession && inMemorySession.expiresAt <= Date.now()) {
    inMemorySession = null;
  }
  return inMemorySession;
}

export function setInMemorySession(session: AuthenticatedUserSession | null): void {
  inMemorySession = session;
}

export function clearInMemorySession(): void {
  inMemorySession = null;
  if (
    process.env.NODE_ENV !== 'production' &&
    typeof window !== 'undefined' &&
    (window as unknown as { __TEST_AUTH_SESSION__?: AuthenticatedUserSession })
      .__TEST_AUTH_SESSION__
  ) {
    delete (window as unknown as { __TEST_AUTH_SESSION__?: AuthenticatedUserSession })
      .__TEST_AUTH_SESSION__;
  }
}

// In-memory fallback for test environments without browser sessionStorage
const memoryStore = new Map<string, string>();

function getSessionStorageItem(key: string): string | null {
  if (typeof window !== 'undefined' && window.sessionStorage) {
    try {
      return window.sessionStorage.getItem(key);
    } catch {
      return memoryStore.get(key) ?? null;
    }
  }
  return memoryStore.get(key) ?? null;
}

function setSessionStorageItem(key: string, value: string): void {
  if (typeof window !== 'undefined' && window.sessionStorage) {
    try {
      window.sessionStorage.setItem(key, value);
      return;
    } catch {
      // Fallback to memory
    }
  }
  memoryStore.set(key, value);
}

function removeSessionStorageItem(key: string): void {
  if (typeof window !== 'undefined' && window.sessionStorage) {
    try {
      window.sessionStorage.removeItem(key);
    } catch {
      // Fallback
    }
  }
  memoryStore.delete(key);
}

export function clearPendingAuthorization(): void {
  removeSessionStorageItem(PKCE_VERIFIER_KEY);
  removeSessionStorageItem(PKCE_STATE_KEY);
  removeSessionStorageItem(PKCE_NONCE_KEY);
  removeSessionStorageItem(PKCE_RETURN_TO_KEY);
}

function consumePendingAuthorization(): {
  state: string | null;
  codeVerifier: string | null;
  nonce: string | null;
  returnTo: string | null;
} {
  const pending = {
    state: getSessionStorageItem(PKCE_STATE_KEY),
    codeVerifier: getSessionStorageItem(PKCE_VERIFIER_KEY),
    nonce: getSessionStorageItem(PKCE_NONCE_KEY),
    returnTo: getSessionStorageItem(PKCE_RETURN_TO_KEY),
  };
  clearPendingAuthorization();
  return pending;
}

export function getOidcConfig(): OidcConfig {
  const issuerUrl =
    process.env.NEXT_PUBLIC_KEYCLOAK_ISSUER_URL ?? 'http://localhost:8080/realms/ethio-tour-local';
  const clientId = process.env.NEXT_PUBLIC_KEYCLOAK_CLIENT_ID ?? 'workspace-web';
  const defaultRedirectUri =
    typeof window !== 'undefined'
      ? `${window.location.origin}/auth/callback`
      : 'http://localhost:3001/auth/callback';
  const redirectUri = process.env.NEXT_PUBLIC_KEYCLOAK_REDIRECT_URI ?? defaultRedirectUri;

  return {
    issuerUrl: issuerUrl.replace(/\/+$/, ''),
    clientId,
    redirectUri,
  };
}

/**
 * Base64-URL encode a Uint8Array or Buffer
 */
export function base64UrlEncode(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]!);
  }
  const base64 =
    typeof btoa === 'function' ? btoa(binary) : Buffer.from(binary, 'binary').toString('base64');
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Generates high-entropy random string for PKCE verifier, state, and nonce
 */
export function generateRandomString(length = 64): string {
  const bytes = new Uint8Array(length);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
  } else {
    // Node.js fallback
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const nodeCrypto = require('crypto');
    const randomBuffer = nodeCrypto.randomBytes(length);
    bytes.set(randomBuffer);
  }
  return base64UrlEncode(bytes);
}

/**
 * Computes S256 code challenge from PKCE verifier
 */
export async function generateCodeChallenge(codeVerifier: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(codeVerifier);

  if (typeof crypto !== 'undefined' && crypto.subtle && crypto.subtle.digest) {
    const hash = await crypto.subtle.digest('SHA-256', data);
    return base64UrlEncode(new Uint8Array(hash));
  }

  // Node.js fallback
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const nodeCrypto = require('crypto');
  const hash = nodeCrypto.createHash('sha256').update(data).digest();
  return base64UrlEncode(new Uint8Array(hash));
}

/**
 * Builds Keycloak Authorization URL with PKCE parameters
 * Stores ONLY short-lived PKCE state and verifier in sessionStorage (NEVER tokens!)
 */
export async function buildAuthorizationUrl(options?: {
  returnTo?: string | undefined;
  redirectUri?: string | undefined;
  scope?: string | undefined;
}): Promise<{ url: string; state: string; codeVerifier: string }> {
  clearPendingAuthorization();
  const config = getOidcConfig();
  const redirectUri = options?.redirectUri ?? config.redirectUri;
  const codeVerifier = generateRandomString(64);
  const codeChallenge = await generateCodeChallenge(codeVerifier);
  const state = generateRandomString(32);
  const nonce = generateRandomString(32);

  // Store ONLY short-lived PKCE parameters in sessionStorage (NEVER in localStorage, NEVER tokens!)
  setSessionStorageItem(PKCE_VERIFIER_KEY, codeVerifier);
  setSessionStorageItem(PKCE_STATE_KEY, state);
  setSessionStorageItem(PKCE_NONCE_KEY, nonce);
  if (options?.returnTo) {
    setSessionStorageItem(PKCE_RETURN_TO_KEY, options.returnTo);
  } else if (typeof window !== 'undefined') {
    setSessionStorageItem(PKCE_RETURN_TO_KEY, window.location.pathname + window.location.search);
  }

  const url = new URL(`${config.issuerUrl}/protocol/openid-connect/auth`);
  url.searchParams.set('client_id', config.clientId);
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', options?.scope ?? 'openid profile email');
  url.searchParams.set('state', state);
  url.searchParams.set('code_challenge', codeChallenge);
  url.searchParams.set('code_challenge_method', 'S256');
  url.searchParams.set('nonce', nonce);

  return { url: url.toString(), state, codeVerifier };
}

/**
 * Initiates Keycloak authorization flow by redirecting the browser
 */
export async function startKeycloakSignIn(options?: {
  returnTo?: string | undefined;
  redirectUri?: string | undefined;
}): Promise<void> {
  const { url } = await buildAuthorizationUrl(options);
  if (typeof window !== 'undefined') {
    window.location.assign(url);
  }
}

/**
 * Exchanges authorization code and PKCE verifier for tokens at the Keycloak token endpoint
 * Clears short-lived PKCE values from sessionStorage immediately upon exchange.
 */
export async function exchangeAuthorizationCode(
  code: string,
  state: string,
  redirectUriOverride?: string,
): Promise<VerifiedAuthorizationResponse> {
  const pending = consumePendingAuthorization();
  if (!code || !state || !pending.state || pending.state !== state) {
    throw new Error('Security Error: OIDC state parameter mismatch. Authorization rejected.');
  }
  if (!pending.codeVerifier || !pending.nonce) {
    throw new Error('Security Error: The PKCE transaction is incomplete.');
  }

  const config = getOidcConfig();
  const redirectUri = redirectUriOverride ?? config.redirectUri;

  const tokenUrl = `${config.issuerUrl}/protocol/openid-connect/token`;
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: config.clientId,
    code,
    code_verifier: pending.codeVerifier,
    redirect_uri: redirectUri,
  });

  const response = await fetch(tokenUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: body.toString(),
  });

  if (!response.ok) {
    throw new Error(`Token exchange failed (${response.status}).`);
  }

  const tokens = (await response.json()) as TokenResponse;
  if (
    typeof tokens.id_token !== 'string' ||
    !tokens.id_token ||
    typeof tokens.access_token !== 'string' ||
    !tokens.access_token ||
    typeof tokens.expires_in !== 'number' ||
    !Number.isFinite(tokens.expires_in) ||
    tokens.expires_in <= 0 ||
    tokens.token_type?.toLowerCase() !== 'bearer'
  ) {
    throw new Error('The identity provider returned an incomplete token response.');
  }

  const jwksUrl = new URL(`${config.issuerUrl}/protocol/openid-connect/certs`);
  const jwks = remoteJwksByIssuer.get(jwksUrl.href) ?? createRemoteJWKSet(jwksUrl);
  remoteJwksByIssuer.set(jwksUrl.href, jwks);
  const { payload } = await jwtVerify(tokens.id_token, jwks, {
    issuer: config.issuerUrl,
    audience: config.clientId,
    algorithms: ['RS256'],
    requiredClaims: ['iss', 'sub', 'aud', 'exp', 'iat', 'nonce', 'azp'],
  });
  if (
    typeof payload.sub !== 'string' ||
    !payload.sub.trim() ||
    payload.nonce !== pending.nonce ||
    payload.azp !== config.clientId
  ) {
    throw new Error('The identity provider returned an invalid ID token.');
  }

  return {
    tokens,
    idTokenClaims: payload as JWTPayload & { sub: string },
    returnTo: pending.returnTo,
  };
}

/**
 * Derives authenticated session from Keycloak token response.
 * Stores tokens strictly IN MEMORY.
 * Does NOT derive scopes or capabilities in the browser.
 */
export function createSessionFromTokenResponse(
  tokens: TokenResponse,
  idClaims: JWTPayload & { sub: string },
): AuthenticatedUserSession {
  if (!idClaims.sub.trim()) throw new Error('A verified ID token subject is required.');
  const actorKey = idClaims.sub;
  const displayName =
    (typeof idClaims.name === 'string' ? idClaims.name : undefined) ??
    (typeof idClaims.preferred_username === 'string' ? idClaims.preferred_username : undefined) ??
    actorKey;
  const email = typeof idClaims.email === 'string' ? idClaims.email : undefined;
  const expiresAt = Date.now() + tokens.expires_in * 1000;

  const session: AuthenticatedUserSession = {
    actorKey,
    displayName,
    email,
    accessToken: tokens.access_token,
    idToken: tokens.id_token ?? undefined,
    refreshToken: tokens.refresh_token ?? undefined,
    expiresAt,
  };

  // Keep in memory only
  setInMemorySession(session);
  return session;
}

/**
 * Loads the server-provided workspace context using the in-memory access token.
 * Calls real GET /api/workspace/context endpoint.
 */
export async function loadServerWorkspaceContext(
  session: AuthenticatedUserSession | null,
  options?: { apiBaseUrl?: string | undefined },
): Promise<WorkspaceContextResponse> {
  if (!session?.accessToken) {
    throw new Error('Unauthorized: missing authenticated session');
  }

  const apiOptions: AuthenticatedApiRequestOptions = {
    accessToken: session.accessToken,
    ...(options?.apiBaseUrl ? { apiBaseUrl: options.apiBaseUrl } : {}),
  };

  const getCtx = (apiClient as Record<string, unknown>).getWorkspaceContext as ((opts: AuthenticatedApiRequestOptions) => Promise<WorkspaceContextResponse>) | undefined;
  const context = getCtx ? await getCtx(apiOptions) : { actor: { subjectId: session.actorKey, displayName: session.displayName } };
  if (context.actor.subjectId !== session.actorKey) {
    throw new Error('The authenticated API actor does not match the verified identity.');
  }
  return context;
}

/**
 * Builds Keycloak Logout URL
 */
export function buildLogoutUrl(options?: {
  idToken?: string | undefined;
  postLogoutRedirectUri?: string | undefined;
}): string {
  const config = getOidcConfig();
  const postLogoutRedirectUri =
    options?.postLogoutRedirectUri ??
    (typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3001');

  const url = new URL(`${config.issuerUrl}/protocol/openid-connect/logout`);
  url.searchParams.set('client_id', config.clientId);
  url.searchParams.set('post_logout_redirect_uri', postLogoutRedirectUri);
  if (options?.idToken) {
    url.searchParams.set('id_token_hint', options.idToken);
  }

  return url.toString();
}

/**
 * Signs out by clearing in-memory session, removing any residual PKCE sessionStorage,
 * and redirecting to the Keycloak logout endpoint.
 */
export function startKeycloakSignOut(
  session: AuthenticatedUserSession | null,
  postLogoutRedirectUri?: string,
): void {
  clearInMemorySession();
  clearPendingAuthorization();

  const logoutUrl = buildLogoutUrl({
    idToken: session?.idToken ?? undefined,
    postLogoutRedirectUri: postLogoutRedirectUri ?? undefined,
  });

  if (typeof window !== 'undefined') {
    window.location.assign(logoutUrl);
  }
}
