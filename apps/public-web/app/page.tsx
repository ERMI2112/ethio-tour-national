import React from 'react';
import { getWorkspaceUrl } from './lib/config';
import { MobileNav } from './components/mobile-nav';

export default function PublicHomePage() {
  const workspaceUrl = getWorkspaceUrl();

  return (
    <>
      <header className="site-header">
        <div className="site-header-inner">
          <a href="/" className="site-brand" aria-label="EthioTour National home">
            <span className="site-brand-icon" aria-hidden="true">
              ET
            </span>
            EthioTour National
          </a>
          <MobileNav>
            <a href="/" className="site-nav-link" aria-current="page">
              Home
            </a>
            <a href={workspaceUrl} className="workspace-link">
              Workspace →
            </a>
          </MobileNav>
        </div>
      </header>

      <main>
        <section className="hero">
          <div className="hero-pattern" aria-hidden="true" />
          <div className="hero-inner">
            <p className="hero-eyebrow">Synthetic hotel onboarding pilot</p>
            <h1>EthioTour National</h1>
            <p className="hero-subtitle">
              A private application and review workspace for a controlled synthetic pilot. Pilot
              outcomes are not licenses or proof of authority to represent a hotel.
            </p>
            <div className="hero-actions">
              <a href={workspaceUrl} className="hero-cta-primary">
                Open Workspace
              </a>
              <a href="#platform" className="hero-cta-secondary">
                Learn More
              </a>
            </div>
          </div>
        </section>

        <section id="platform" className="content-section" aria-labelledby="platform-title">
          <h2 className="section-title" id="platform-title">
            The current hotel pilot
          </h2>
          <p className="section-lead">
            Synthetic applicants, assigned Bureau reviewers, and platform administrators use
            separate private work areas. Public hotel listings, bookings, and payments are not
            available in this pilot.
          </p>
          <div className="features-grid">
            <div className="feature-card">
              <div className="feature-icon feature-icon-green" aria-hidden="true">
                🏨
              </div>
              <h3>Hotel Onboarding</h3>
              <p>
                Applicants create private applications and select an applicant-declared location.
                Submitted versions retain their location and review context.
              </p>
            </div>
            <div className="feature-card">
              <div className="feature-icon feature-icon-amber" aria-hidden="true">
                🔍
              </div>
              <h3>Synthetic Bureau Review</h3>
              <p>
                Server-configured synthetic offices review their assigned application versions.
                These demo assignments do not establish real office jurisdictions or legal
                authority.
              </p>
            </div>
            <div className="feature-card">
              <div className="feature-icon feature-icon-teal" aria-hidden="true">
                📋
              </div>
              <h3>Private Admission</h3>
              <p>
                After approval of the current version, a platform administrator can grant private
                workspace admission. Admission does not publish a hotel or activate a subscription.
              </p>
            </div>
          </div>
        </section>

        <section className="entry-section" aria-labelledby="get-started-title">
          <div className="content-section">
            <h2 className="section-title" id="get-started-title">
              Get started
            </h2>
            <p className="section-lead">
              Access the private workspace to participate in EthioTour National workflows. All
              workspace operations require authentication.
            </p>
            <div className="entry-grid">
              <a href={workspaceUrl} className="entry-card" style={{ textDecoration: 'none' }}>
                <h3>Hotel Operators</h3>
                <p>
                  Apply for hotel onboarding, manage your application, and access your admitted
                  workspace.
                </p>
                <span className="entry-card-link">Go to Workspace →</span>
              </a>
              <a href={workspaceUrl} className="entry-card" style={{ textDecoration: 'none' }}>
                <h3>Bureau Officers</h3>
                <p>
                  Review assigned synthetic hotel applications and record version-specific
                  decisions.
                </p>
                <span className="entry-card-link">Go to Workspace →</span>
              </a>
              <a href={workspaceUrl} className="entry-card" style={{ textDecoration: 'none' }}>
                <h3>Administrators</h3>
                <p>Manage platform admissions and oversee the onboarding pipeline.</p>
                <span className="entry-card-link">Go to Workspace →</span>
              </a>
            </div>
          </div>
        </section>
      </main>

      <footer className="site-footer">
        <div className="site-footer-inner">
          <div className="footer-grid">
            <div>
              <p className="footer-brand">EthioTour National</p>
              <p className="footer-tagline">
                A national tourism project currently demonstrating a private, synthetic hotel
                onboarding workflow.
              </p>
            </div>
            <div className="footer-col">
              <h4>Platform</h4>
              <ul className="footer-links">
                <li>
                  <a href="/">Home</a>
                </li>
                <li>
                  <a href={workspaceUrl}>Workspace</a>
                </li>
              </ul>
            </div>
            <div className="footer-col">
              <h4>Workspace</h4>
              <ul className="footer-links">
                <li>
                  <a href={`${workspaceUrl}/hotels`}>Hotel Applications</a>
                </li>
                <li>
                  <a href={`${workspaceUrl}/bureau/hotel-cases`}>Bureau Review</a>
                </li>
                <li>
                  <a href={`${workspaceUrl}/admin/hotel-admissions`}>Admissions</a>
                </li>
              </ul>
            </div>
          </div>
          <div className="footer-bottom">
            <p className="footer-copyright">© EthioTour National</p>
          </div>
        </div>
      </footer>
    </>
  );
}
