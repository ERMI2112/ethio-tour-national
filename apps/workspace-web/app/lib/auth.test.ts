import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { exportJWK, generateKeyPair, SignJWT, type JWTPayload } from 'jose';

const api = vi.hoisted(() => ({
  getWorkspaceContext: vi.fn(),
}));

vi.mock('@ethio-tour/api-client', () => ({
  ...api,
  ApiClientError: class ApiClientError extends Error {
    public constructor(
      message: string,
      public readonly status: number,
    ) {
      super(message);
    }
  },
}));

import {
  buildAuthorizationUrl,
  buildLogoutUrl,
  clearInMemorySession,
  createSessionFromTokenResponse,
  exchangeAuthorizationCode,
  generateCodeChallenge,
  generateRandomString,
  getInMemorySession,
  loadServerWorkspaceContext,
  setInMemorySession,
  startKeycloakSignOut,
  type TokenResponse,
} from './auth';

const issuer = 'http://localhost:8080/realms/ethio-tour-local';
const storage = new Map<string, string>();
const mockFetch = vi.fn<typeof fetch>();
let keyPair: Awaited<ReturnType<typeof generateKeyPair>>;
let wrongKeyPair: Awaited<ReturnType<typeof generateKeyPair>>;
let publicJwk: Record<string, unknown>;
let nonceForToken = '';
let claimsForToken: Partial<JWTPayload> = {};
let signingKeyForToken: CryptoKey | null = null;
let tokenStatus = 200;

const tokenResponse: TokenResponse = {
  access_token: 'synthetic-access-token',
  id_token: '',
  refresh_token: 'synthetic-refresh-token',
  expires_in: 300,
  token_type: 'Bearer',
};

function storageApi() {
  return {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
    removeItem: (key: string) => storage.delete(key),
    clear: () => storage.clear(),
    get length() {
      return storage.size;
    },
  };
}

async function beginAuthorization(returnTo?: string) {
  const authorization = await buildAuthorizationUrl(
    returnTo === undefined ? undefined : { returnTo },
  );
  nonceForToken = storage.get('ethio_tour_pkce_nonce') ?? '';
  return authorization;
}

async function signedIdToken(): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const payload: JWTPayload = {
    iss: issuer,
    aud: 'workspace-web',
    sub: 'synthetic-subject-123',
    exp: now + 300,
    iat: now,
    nonce: nonceForToken,
    azp: 'workspace-web',
    name: 'Synthetic Workspace Actor',
    email: 'synthetic@example.test',
    ...claimsForToken,
  };
  const privateKey = signingKeyForToken ?? keyPair.privateKey;
  return new SignJWT(payload)
    .setProtectedHeader({ alg: 'RS256', kid: 'workspace-auth-test-key' })
    .sign(privateKey);
}

describe('Keycloak OIDC PKCE, verified ID tokens, and server context', () => {
  const originalFetch = globalThis.fetch;

  beforeAll(async () => {
    keyPair = await generateKeyPair('RS256');
    wrongKeyPair = await generateKeyPair('RS256');
    publicJwk = {
      ...(await exportJWK(keyPair.publicKey)),
      kid: 'workspace-auth-test-key',
      alg: 'RS256',
      use: 'sig',
    };
  });

  beforeEach(() => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('NEXT_PUBLIC_KEYCLOAK_ISSUER_URL', issuer);
    vi.stubEnv('NEXT_PUBLIC_KEYCLOAK_CLIENT_ID', 'workspace-web');
    storage.clear();
    vi.stubGlobal('window', {
      sessionStorage: storageApi(),
      localStorage: storageApi(),
      location: { origin: 'http://localhost:3001', pathname: '/registry', assign: vi.fn() },
    } as unknown as Window);
    mockFetch.mockReset();
    claimsForToken = {};
    signingKeyForToken = null;
    tokenStatus = 200;
    api.getWorkspaceContext.mockReset();
    clearInMemorySession();
    mockFetch.mockImplementation(async (input) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      if (url.endsWith('/protocol/openid-connect/token')) {
        if (tokenStatus !== 200) return new Response(null, { status: tokenStatus });
        const tokens = { ...tokenResponse, id_token: await signedIdToken() };
        return new Response(JSON.stringify(tokens), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url.endsWith('/protocol/openid-connect/certs')) {
        return new Response(JSON.stringify({ keys: [publicJwk] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      return new Response(null, { status: 404 });
    });
    globalThis.fetch = mockFetch;
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    globalThis.fetch = originalFetch;
    clearInMemorySession();
    vi.clearAllMocks();
  });

  it('generates high-entropy PKCE values and an S256 authorization request', async () => {
    const first = generateRandomString(64);
    const second = generateRandomString(64);
    expect(first.length).toBeGreaterThanOrEqual(43);
    expect(first).not.toBe(second);

    const verifier = 'test-code-verifier-with-sufficient-entropy-1234567890';
    expect(await generateCodeChallenge(verifier)).toMatch(/^[A-Za-z0-9_-]+$/);

    const authorization = await beginAuthorization('/registry/item-1');
    const url = new URL(authorization.url);
    expect(url.searchParams.get('client_id')).toBe('workspace-web');
    expect(url.searchParams.get('response_type')).toBe('code');
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    expect(url.searchParams.get('state')).toBe(authorization.state);
    expect(url.searchParams.get('nonce')).toBe(storage.get('ethio_tour_pkce_nonce'));
    expect(storage.get('ethio_tour_pkce_verifier')).toBe(authorization.codeVerifier);
    expect(storage.get('ethio_tour_pkce_return_to')).toBe('/registry/item-1');
    expect(storage.has('access_token')).toBe(false);
    expect(storage.has('refresh_token')).toBe(false);
  });

  it('exchanges only after matching state and verifies the signed ID token and nonce', async () => {
    const authorization = await beginAuthorization('/registry/item-1');
    const result = await exchangeAuthorizationCode('synthetic-auth-code', authorization.state);

    expect(result.tokens.access_token).toBe(tokenResponse.access_token);
    expect(result.idTokenClaims.sub).toBe('synthetic-subject-123');
    expect(result.returnTo).toBe('/registry/item-1');
    expect(mockFetch).toHaveBeenCalledWith(
      `${issuer}/protocol/openid-connect/token`,
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining(`code_verifier=${authorization.codeVerifier}`),
      }),
    );
    expect(storage.size).toBe(0);

    const session = createSessionFromTokenResponse(result.tokens, result.idTokenClaims);
    expect(session.actorKey).toBe('synthetic-subject-123');
    expect(session.displayName).toBe('Synthetic Workspace Actor');
    expect(getInMemorySession()).toEqual(session);
  });

  it('does not trust or clear the injected test session in production mode', () => {
    vi.stubEnv('NODE_ENV', 'production');
    const injectedSession = {
      actorKey: 'synthetic-test-only',
      displayName: 'Synthetic Test Session',
      accessToken: 'not-a-real-token',
      expiresAt: Date.now() + 60_000,
    };
    const testWindow = window as unknown as {
      __TEST_AUTH_SESSION__?: typeof injectedSession;
    };
    testWindow.__TEST_AUTH_SESSION__ = injectedSession;

    expect(getInMemorySession()).toBeNull();
    clearInMemorySession();
    expect(testWindow.__TEST_AUTH_SESSION__).toBe(injectedSession);
    delete testWindow.__TEST_AUTH_SESSION__;
  });

  it('rejects missing saved state before contacting the token endpoint', async () => {
    await expect(
      exchangeAuthorizationCode('synthetic-auth-code', 'callback-state'),
    ).rejects.toThrow('state parameter mismatch');
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('rejects missing or mismatched callback state and consumes all transient values', async () => {
    const authorization = await beginAuthorization('/registry/item-1');

    await expect(exchangeAuthorizationCode('synthetic-auth-code', '')).rejects.toThrow(
      'state parameter mismatch',
    );
    expect(mockFetch).not.toHaveBeenCalled();
    expect(storage.size).toBe(0);
    await expect(
      exchangeAuthorizationCode('synthetic-auth-code', authorization.state),
    ).rejects.toThrow('state parameter mismatch');
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('clears PKCE values when the token endpoint fails', async () => {
    const authorization = await beginAuthorization();
    tokenStatus = 503;

    await expect(
      exchangeAuthorizationCode('synthetic-auth-code', authorization.state),
    ).rejects.toThrow('Token exchange failed (503)');
    expect(storage.size).toBe(0);
    await expect(
      exchangeAuthorizationCode('synthetic-auth-code', authorization.state),
    ).rejects.toThrow('state parameter mismatch');
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['issuer mismatch', { iss: 'http://localhost:8080/realms/other' }],
    ['audience mismatch', { aud: 'another-client' }],
    ['nonce mismatch', { nonce: 'not-the-saved-nonce' }],
    ['expired ID token', { exp: Math.floor(Date.now() / 1000) - 60 }],
    ['missing subject', { sub: undefined }],
    ['authorized-party mismatch', { azp: 'another-client' }],
  ])('rejects an ID token with %s and consumes PKCE values', async (_label, claims) => {
    const authorization = await beginAuthorization();
    claimsForToken = claims as Partial<JWTPayload>;

    await expect(
      exchangeAuthorizationCode('synthetic-auth-code', authorization.state),
    ).rejects.toThrow();
    expect(mockFetch.mock.calls[0]?.[0]).toContain('/protocol/openid-connect/token');
    expect(storage.size).toBe(0);
    expect(getInMemorySession()).toBeNull();
  });

  it('rejects an ID token with an invalid signature', async () => {
    const authorization = await beginAuthorization();
    signingKeyForToken = wrongKeyPair.privateKey;

    await expect(
      exchangeAuthorizationCode('synthetic-auth-code', authorization.state),
    ).rejects.toThrow();
    expect(storage.size).toBe(0);
    expect(getInMemorySession()).toBeNull();
  });

  it('requires a verified non-empty subject when creating a session', async () => {
    expect(() => createSessionFromTokenResponse(tokenResponse, { sub: ' ' })).toThrow(
      'verified ID token subject is required',
    );
  });

  it('expires in-memory sessions and removes their tokens', () => {
    setInMemorySession({
      actorKey: 'synthetic-subject',
      displayName: 'Synthetic Actor',
      accessToken: 'expired-access-token',
      refreshToken: 'expired-refresh-token',
      expiresAt: Date.now() - 1,
    });

    expect(getInMemorySession()).toBeNull();
  });

  it('loads only the server-provided workspace context with the in-memory token', async () => {
    const session = {
      actorKey: 'synthetic-subject',
      displayName: 'Synthetic Actor',
      accessToken: 'synthetic-access-token',
      expiresAt: Date.now() + 60_000,
    };
    const expectedContext = {
      actor: { subjectId: 'synthetic-subject', displayName: 'Synthetic Actor' },
      capabilities: [],
      allowedScopes: [],
      reviewQueue: [],
    };
    api.getWorkspaceContext.mockResolvedValueOnce(expectedContext);

    await expect(loadServerWorkspaceContext(session)).resolves.toEqual(expectedContext);
    expect(api.getWorkspaceContext).toHaveBeenCalledWith({
      accessToken: 'synthetic-access-token',
    });
    api.getWorkspaceContext.mockResolvedValueOnce({
      ...expectedContext,
      actor: { subjectId: 'different-subject', displayName: 'Unexpected Actor' },
    });
    await expect(loadServerWorkspaceContext(session)).rejects.toThrow(
      'does not match the verified identity',
    );
    await expect(loadServerWorkspaceContext(null)).rejects.toThrow(
      'Unauthorized: missing authenticated session',
    );
    expect(api.getWorkspaceContext).toHaveBeenCalledTimes(2);
  });

  it('builds the Keycloak logout URL and clears transient values and in-memory tokens', () => {
    storage.set('ethio_tour_pkce_state', 'synthetic-state');
    setInMemorySession({
      actorKey: 'synthetic-subject',
      displayName: 'Synthetic Actor',
      accessToken: 'synthetic-access-token',
      idToken: 'synthetic-id-token',
      expiresAt: Date.now() + 60_000,
    });

    const logoutUrl = buildLogoutUrl({
      idToken: 'synthetic-id-token',
      postLogoutRedirectUri: 'http://localhost:3001',
    });
    expect(logoutUrl).toContain('/protocol/openid-connect/logout');
    expect(logoutUrl).toContain('id_token_hint=synthetic-id-token');
    startKeycloakSignOut(getInMemorySession(), 'http://localhost:3001');

    expect(getInMemorySession()).toBeNull();
    expect(storage.size).toBe(0);
  });
});
