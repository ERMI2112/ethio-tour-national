'use client';

import React from 'react';
import Link from 'next/link';
import { useAuth } from './lib/auth-context';

function getPublicUrl(): string {
  if (typeof window !== 'undefined' && process.env.NEXT_PUBLIC_PUBLIC_URL) {
    return process.env.NEXT_PUBLIC_PUBLIC_URL;
  }
  return process.env.NEXT_PUBLIC_PUBLIC_URL || 'http://localhost:3000';
}

export default function WorkspaceHomePage() {
  const { session, isAuthenticated, error, signIn, signOut } = useAuth();
  const publicUrl = getPublicUrl();

  return (
    <main>
      <div className="workspace-shell">
        <header className="page-heading">
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: '12px',
              marginBottom: '8px',
            }}
          >
            <a
              href={publicUrl}
              className="eyebrow"
              style={{ margin: 0, textDecoration: 'none', color: '#53665d' }}
            >
              ← EthioTour National
            </a>
            {isAuthenticated ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span
                  style={{
                    fontSize: '0.85rem',
                    color: '#52615a',
                    fontWeight: 600,
                    maxWidth: '220px',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                  title={session?.displayName ?? 'Signed in'}
                  data-testid="session-identity"
                >
                  👤 {session?.displayName ?? 'Signed in'}
                </span>
                <button
                  type="button"
                  onClick={() => void signOut()}
                  className="secondary-button"
                  style={{ minHeight: '34px', padding: '4px 10px', fontSize: '0.8rem' }}
                  aria-label="Sign out of workspace"
                >
                  Sign Out
                </button>
              </div>
            ) : null}
          </div>
          <h1>Workspace</h1>
          <p>Private services for authenticated EthioTour participants.</p>
        </header>

        {error && (
          <div className="error-message" role="alert" style={{ marginBottom: '1rem' }}>
            {error}
          </div>
        )}

        {!isAuthenticated ? (
          <section className="session-panel" aria-labelledby="sign-in-title">
            <h2 id="sign-in-title">Sign in to continue</h2>
            <p>
              The EthioTour workspace requires authentication. Sign in with your identity provider
              to access hotel applications, Bureau review, and administration tools.
            </p>
            <div style={{ marginTop: '16px' }}>
              <button
                type="button"
                onClick={() => void signIn()}
                aria-label="Sign in with Keycloak"
              >
                Sign In
              </button>
            </div>
          </section>
        ) : (
          <>
            <section className="panel" aria-labelledby="hotel-pilot-title">
              <div className="section-heading">
                <div>
                  <p className="eyebrow">Synthetic pilot</p>
                  <h2 id="hotel-pilot-title">Hotel onboarding</h2>
                </div>
                <span className="status status-neutral">Private workflow</span>
              </div>
              <p>
                Pilot review outcomes are not licenses or proof of authority to represent a hotel.
                This workflow does not publish hotel listings or enable bookings, subscriptions, or
                payments.
              </p>
              <nav className="workflow-links" aria-label="Hotel onboarding work areas">
                <Link href="/hotels">Applicant applications</Link>
                <Link href="/bureau/hotel-cases">Bureau review queue</Link>
                <Link href="/admin/hotel-admissions">Administrator admission</Link>
              </nav>
            </section>
          </>
        )}
      </div>
    </main>
  );
}
