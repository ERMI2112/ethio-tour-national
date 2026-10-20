import Link from 'next/link';
import { getApiHealth } from '@ethio-tour/api-client';

export const dynamic = 'force-dynamic';

export default async function WorkspaceHomePage() {
  const health = await getApiHealth();

  return (
    <main>
      <div className="workspace-shell">
        <header className="page-heading">
          <p className="eyebrow">EthioTour National</p>
          <h1>Workspace</h1>
          <p>Private services for authenticated participants.</p>
        </header>
        <section className="panel" aria-labelledby="hotel-pilot-title">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Synthetic pilot</p>
              <h2 id="hotel-pilot-title">Hotel onboarding</h2>
            </div>
            <span className="status status-neutral">Private workflow</span>
          </div>
          <p>
            Pilot review outcomes are not licenses or proof of authority to represent a hotel. This
            workflow does not publish hotel listings or enable bookings, subscriptions, or payments.
          </p>
          <nav className="workflow-links" aria-label="Hotel onboarding work areas">
            <Link href="/hotels">Applicant applications</Link>
            <Link href="/bureau/hotel-cases">Bureau review queue</Link>
            <Link href="/admin/hotel-admissions">Administrator admission</Link>
          </nav>
        </section>
        <p className="api-health" role="status">
          API status: {health.status} ({health.phase})
        </p>
      </div>
    </main>
  );
}
