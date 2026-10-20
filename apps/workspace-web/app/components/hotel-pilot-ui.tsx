import Link from 'next/link';
import React from 'react';

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
          <p className="eyebrow">EthioTour National · Synthetic hotel pilot</p>
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

export function SessionUnavailable() {
  return (
    <section className="session-panel" aria-labelledby="session-unavailable-title">
      <h2 id="session-unavailable-title">Authenticated workspace session unavailable</h2>
      <p>
        This screen requires an authenticated EthioTour session. Sign-in is not connected to this
        workspace build, so no application data was requested. Do not enter or paste a token here.
      </p>
    </section>
  );
}

export function LoadingState({ label }: Readonly<{ label: string }>) {
  return (
    <p className="muted" role="status">
      {label}
    </p>
  );
}
