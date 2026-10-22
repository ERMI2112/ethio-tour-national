// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen, fireEvent, waitFor } from '@testing-library/react';
import WorkspaceHomePage from './page';
import { AuthProvider, useAuth } from './lib/auth-context';
import type { AuthenticatedUserSession } from './lib/auth';

const mockAuth = vi.hoisted(() => ({
  API_UNAUTHORIZED_EVENT: 'ethio-tour:unauthorized',
  getInMemorySession: vi.fn(() => null),
  setInMemorySession: vi.fn(),
  clearInMemorySession: vi.fn(),
  startKeycloakSignIn: vi.fn(),
  startKeycloakSignOut: vi.fn(),
}));

vi.mock('@ethio-tour/api-client', () => ({
  API_UNAUTHORIZED_EVENT: 'ethio-tour:unauthorized',
  getApiHealth: vi.fn(),
}));

vi.mock('./lib/auth', () => ({
  ...mockAuth,
  createRemoteJWKSet: vi.fn(),
}));

function createTestSession(
  overrides: Partial<AuthenticatedUserSession> = {},
): AuthenticatedUserSession {
  return {
    actorKey: 'test-subject-001',
    displayName: 'Test User',
    email: 'test@example.test',
    accessToken: 'test-access-token',
    expiresAt: Date.now() + 600_000,
    ...overrides,
  };
}

function renderWithAuth(session: AuthenticatedUserSession | null) {
  return render(
    <AuthProvider initialSession={session}>
      <WorkspaceHomePage />
    </AuthProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockAuth.startKeycloakSignIn.mockReset().mockResolvedValue(undefined);
  mockAuth.startKeycloakSignOut.mockReset();
  vi.stubEnv('NEXT_PUBLIC_PUBLIC_URL', 'http://localhost:3000');
  mockAuth.getInMemorySession.mockReturnValue(null);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe('workspace portal — signed out', () => {
  it('renders a heading and sign-in prompt', () => {
    renderWithAuth(null);
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Workspace');
    expect(screen.getByRole('heading', { level: 2 }).textContent).toContain('Sign in');
  });

  it('provides a sign-in button that calls startKeycloakSignIn', () => {
    renderWithAuth(null);
    const signInButton = screen.getByRole('button', { name: /sign in/i });
    expect(signInButton).toBeDefined();
    fireEvent.click(signInButton);
    expect(mockAuth.startKeycloakSignIn).toHaveBeenCalled();
  });

  it('does not show hotel workflow links', () => {
    renderWithAuth(null);
    expect(screen.queryByText('Applicant applications')).toBeNull();
    expect(screen.queryByText('Bureau review queue')).toBeNull();
    expect(screen.queryByText('Administrator admission')).toBeNull();
  });

  it('does not display session identity', () => {
    renderWithAuth(null);
    expect(screen.queryByTestId('session-identity')).toBeNull();
  });

  it('links back to the public homepage', () => {
    renderWithAuth(null);
    const homeLink = screen.getByText('← EthioTour National');
    expect(homeLink.getAttribute('href')).toBe('http://localhost:3000');
  });
});

describe('workspace portal — signed in', () => {
  it('shows the authenticated user display name', () => {
    renderWithAuth(createTestSession({ displayName: 'Bureau Officer A' }));
    const identity = screen.getByTestId('session-identity');
    expect(identity.textContent).toContain('Bureau Officer A');
  });

  it('shows hotel workflow navigation links to existing routes', () => {
    renderWithAuth(createTestSession());
    const applicantLink = screen.getByText('Applicant applications');
    expect(applicantLink.closest('a')?.getAttribute('href')).toBe('/hotels');
    const bureauLink = screen.getByText('Bureau review queue');
    expect(bureauLink.closest('a')?.getAttribute('href')).toBe('/bureau/hotel-cases');
    const adminLink = screen.getByText('Administrator admission');
    expect(adminLink.closest('a')?.getAttribute('href')).toBe('/admin/hotel-admissions');
  });

  it('does not show the sign-in prompt', () => {
    renderWithAuth(createTestSession());
    expect(screen.queryByText('Sign in to continue')).toBeNull();
  });

  it('provides a sign-out button', () => {
    renderWithAuth(createTestSession());
    const signOut = screen.getByRole('button', { name: /sign out/i });
    expect(signOut).toBeDefined();
  });

  it('displays the pilot disclaimer', () => {
    renderWithAuth(createTestSession());
    const main = screen.getByRole('main');
    expect(main.textContent).toContain('not licenses or proof of authority');
  });
});

describe('workspace portal — session transitions', () => {
  it('replaces identity display immediately when the authenticated session changes', () => {
    function ChangeSession() {
      const { setSession } = useAuth();
      return (
        <button
          onClick={() =>
            setSession(
              createTestSession({
                actorKey: 'synthetic-b',
                displayName: 'Synthetic B',
                accessToken: 'synthetic-b-token',
              }),
            )
          }
        >
          Change session
        </button>
      );
    }
    render(
      <AuthProvider initialSession={createTestSession({ displayName: 'Synthetic A' })}>
        <WorkspaceHomePage />
        <ChangeSession />
      </AuthProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Change session' }));
    expect(screen.queryByText(/Synthetic A/)).toBeNull();
    expect(screen.getByTestId('session-identity').textContent).toContain('Synthetic B');
    expect(screen.getByRole('main').textContent).not.toContain('synthetic-b-token');
  });

  it('clears displayed identity and work-area links on API 401', () => {
    renderWithAuth(createTestSession());
    act(() => window.dispatchEvent(new Event('ethio-tour:unauthorized')));
    expect(screen.queryByTestId('session-identity')).toBeNull();
    expect(screen.queryByText('Bureau review queue')).toBeNull();
    expect(screen.getByRole('alert').textContent).toContain('Sign in again');
  });

  it('signs out through the existing provider and immediately removes identity', () => {
    renderWithAuth(createTestSession());
    fireEvent.click(screen.getByRole('button', { name: /sign out/i }));
    expect(mockAuth.startKeycloakSignOut).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('session-identity')).toBeNull();
  });

  it('displays sign-in initiation errors without an unhandled rejection', async () => {
    mockAuth.startKeycloakSignIn.mockRejectedValueOnce(new Error('Synthetic sign-in failure'));
    renderWithAuth(null);
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }));
    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toBe('Synthetic sign-in failure'),
    );
  });

  it('clears private content when session expires', async () => {
    const session = createTestSession({ expiresAt: Date.now() + 50 });
    renderWithAuth(session);
    // Immediately visible
    expect(screen.getByTestId('session-identity')).toBeDefined();

    // Wait for the session expiration timeout
    await vi.waitFor(
      () => {
        expect(screen.queryByTestId('session-identity')).toBeNull();
      },
      { timeout: 2000 },
    );
    // After session expires, sign-in prompt should appear
    expect(screen.getByText('Sign in to continue')).toBeDefined();
  });

  it('does not show workflow links after session clears', async () => {
    const session = createTestSession({ expiresAt: Date.now() + 50 });
    renderWithAuth(session);
    expect(screen.getByText('Applicant applications')).toBeDefined();

    await vi.waitFor(
      () => {
        expect(screen.queryByText('Applicant applications')).toBeNull();
      },
      { timeout: 2000 },
    );
  });
});
