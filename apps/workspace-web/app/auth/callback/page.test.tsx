// @vitest-environment jsdom
import React from 'react';
import { cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import AuthCallbackPage from './page';
import { AuthProvider } from '../../lib/auth-context';

const mocks = vi.hoisted(() => ({
  replace: vi.fn(),
  exchangeAuthorizationCode: vi.fn(),
  createSessionFromTokenResponse: vi.fn(),
  clearPendingAuthorization: vi.fn(),
  getInMemorySession: vi.fn(() => null),
  setInMemorySession: vi.fn(),
  clearInMemorySession: vi.fn(),
  startKeycloakSignIn: vi.fn(),
  startKeycloakSignOut: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mocks.replace }),
}));

vi.mock('../../lib/auth', () => ({
  exchangeAuthorizationCode: mocks.exchangeAuthorizationCode,
  createSessionFromTokenResponse: mocks.createSessionFromTokenResponse,
  clearPendingAuthorization: mocks.clearPendingAuthorization,
  getInMemorySession: mocks.getInMemorySession,
  setInMemorySession: mocks.setInMemorySession,
  clearInMemorySession: mocks.clearInMemorySession,
  startKeycloakSignIn: mocks.startKeycloakSignIn,
  startKeycloakSignOut: mocks.startKeycloakSignOut,
}));

describe('Keycloak callback session transition', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.history.replaceState({}, '', '/auth/callback?code=callback-code&state=callback-state');
    mocks.exchangeAuthorizationCode.mockResolvedValue({
      tokens: { access_token: 'verified-access-token' },
      idTokenClaims: { sub: 'verified-subject' },
      returnTo: '/hotels',
    });
    mocks.createSessionFromTokenResponse.mockReturnValue({
      actorKey: 'verified-subject',
      displayName: 'Verified Actor',
      accessToken: 'verified-access-token',
      expiresAt: Date.now() + 60_000,
    });
  });

  afterEach(() => {
    cleanup();
  });

  it('exchanges the callback once when storing the verified session rerenders the provider', async () => {
    render(
      <AuthProvider>
        <AuthCallbackPage />
      </AuthProvider>,
    );

    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith('/hotels'));
    expect(mocks.exchangeAuthorizationCode).toHaveBeenCalledTimes(1);
    expect(mocks.exchangeAuthorizationCode).toHaveBeenCalledWith('callback-code', 'callback-state');
  });
});
