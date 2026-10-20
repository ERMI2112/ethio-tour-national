'use client';

import Link from 'next/link';
import React from 'react';
import { AuthControls } from './AuthControls';

export const HOTEL_PILOT_NOTICE =
  'Synthetic pilot review result; not a license or proof of authority to represent a hotel.';

export function HotelPilotFrame({
  title,
  description,
  children,
}: Readonly<{ title: string; description: string; children: React.ReactNode }>) {
  return (
    <main>
      <div className="workspace-shell">
        <header className="page-heading">
          <div
            className="top-banner"
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: '12px',
              marginBottom: '8px',
            }}
          >
            <p className="eyebrow" style={{ margin: 0 }}>
              EthioTour National · Synthetic hotel pilot
            </p>
            <AuthControls />
          </div>
          <h1>{title}</h1>
          <p>{description}</p>
        </header>
        <nav className="workflow-links" aria-label="Hotel onboarding work areas">
          <Link href="/hotels">Applicant applications</Link>
          <Link href="/bureau/hotel-cases">Bureau review queue</Link>
          <Link href="/admin/hotel-admissions">Administrator admission</Link>
        </nav>
        <p className="notice" role="note">
          {HOTEL_PILOT_NOTICE}
        </p>
        {children}
      </div>
    </main>
  );
}

export function SessionUnavailable({
  onSignIn,
}: Readonly<{
  onSignIn?: () => Promise<void> | void;
}> = {}) {
  return (
    <section className="session-panel" aria-labelledby="session-unavailable-title">
      <h2 id="session-unavailable-title">Authenticated workspace session unavailable</h2>
      <p>
        This screen requires an authenticated EthioTour session. Sign-in is required to view and
        manage private workspace data. Do not enter or paste a token here.
      </p>
      {onSignIn && (
        <div style={{ marginTop: '16px' }}>
          <button
            type="button"
            onClick={() => void onSignIn()}
            className="primary-button"
            aria-label="Sign in with Keycloak"
          >
            Sign In with Keycloak
          </button>
        </div>
      )}
    </section>
  );
}

export const SignedOutPanel = SessionUnavailable;

export function LoadingState({ label }: Readonly<{ label: string }>) {
  return (
    <p className="muted" role="status">
      {label}
    </p>
  );
}
