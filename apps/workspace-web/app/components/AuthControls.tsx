'use client';

import React from 'react';
import { useOptionalAuth } from '../lib/auth-context';
import { useHotelPilotSession } from '../lib/hotel-pilot-session';

export function AuthControls() {
  const auth = useOptionalAuth();
  const pilotSession = useHotelPilotSession();

  const isAuthenticated = auth?.isAuthenticated ?? pilotSession.isAuthenticated;
  const sessionDisplayName = auth?.session?.displayName ?? pilotSession.displayName;
  const actorKey = auth?.session?.actorKey ?? pilotSession.actorKey;
  const displayName =
    sessionDisplayName && sessionDisplayName !== actorKey ? sessionDisplayName : undefined;
  const signIn = auth?.signIn ?? pilotSession.signIn;
  const signOut = auth?.signOut ?? pilotSession.signOut;

  if (isAuthenticated) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        <span
          style={{
            fontSize: '0.85rem',
            color: 'var(--color-text-muted)',
            fontWeight: 600,
            maxWidth: '220px',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
          title={displayName ?? 'Signed in'}
        >
          👤 {displayName ?? 'Signed in'}
        </span>
        <button
          type="button"
          onClick={() => void signOut()}
          className="btn btn-secondary"
          style={{ minHeight: '34px', padding: '4px 10px', fontSize: '0.8rem' }}
          aria-label="Sign out of Keycloak session"
        >
          Sign Out
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => void signIn()}
      className="btn btn-primary"
      style={{ minHeight: '34px', padding: '4px 12px', fontSize: '0.8rem' }}
      aria-label="Sign in with Keycloak"
    >
      Sign In
    </button>
  );
}
