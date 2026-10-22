// @vitest-environment jsdom
import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AuthenticatedUserSession } from '../lib/auth';
import { AuthProvider } from '../lib/auth-context';
import { AuthControls } from './AuthControls';

vi.mock('@ethio-tour/api-client', () => ({
  API_UNAUTHORIZED_EVENT: 'ethio-tour:unauthorized',
}));

vi.mock('../lib/auth', () => ({
  getInMemorySession: vi.fn(() => null),
  setInMemorySession: vi.fn(),
  clearInMemorySession: vi.fn(),
  startKeycloakSignIn: vi.fn(),
  startKeycloakSignOut: vi.fn(),
}));

afterEach(() => cleanup());

function session(displayName: string): AuthenticatedUserSession {
  return {
    actorKey: 'opaque-subject-value',
    displayName,
    accessToken: 'test-token',
    expiresAt: Date.now() + 60_000,
  };
}

describe('workspace identity label', () => {
  it('does not display the subject key when it is the only available name', () => {
    render(
      <AuthProvider initialSession={session('opaque-subject-value')}>
        <AuthControls />
      </AuthProvider>,
    );

    expect(screen.getByText('👤 Signed in')).toBeDefined();
    expect(screen.queryByText('opaque-subject-value')).toBeNull();
  });

  it('shows a verified display name when one is available', () => {
    render(
      <AuthProvider initialSession={session('Officer Example')}>
        <AuthControls />
      </AuthProvider>,
    );

    expect(screen.getByText('👤 Officer Example')).toBeDefined();
  });
});
