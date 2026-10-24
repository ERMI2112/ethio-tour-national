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
            <div className="hero-grid">
              <div className="hero-content">
                <p className="hero-eyebrow">Hotel onboarding pilot</p>
                <h1>Manage your hotel application in one place.</h1>
                <p className="hero-subtitle">
                  Prepare your application, follow its review progress, and access your private
                  workspace after admission.
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

              <section className="hero-workflow-card" aria-labelledby="workflow-title">
                <h2 className="workflow-title" id="workflow-title">
                  Application Workflow
                </h2>
                <ol className="workflow-steps">
                  <li className="workflow-step">
                    <span className="workflow-step-num" aria-hidden="true">
                      1
                    </span>
                    <div className="workflow-step-content">
                      <h3>Prepare application</h3>
                      <p>Draft hotel details and select a declared location for review.</p>
                    </div>
                  </li>
                  <li className="workflow-connector" aria-hidden="true">
                    <span className="connector-arrow">↓</span>
                  </li>
                  <li className="workflow-step">
                    <span className="workflow-step-num" aria-hidden="true">
                      2
                    </span>
                    <div className="workflow-step-content">
                      <h3>Bureau review</h3>
                      <p>
                        Regional review evaluates submitted versions and records determinations.
                      </p>
                    </div>
                  </li>
                  <li className="workflow-connector" aria-hidden="true">
                    <span className="connector-arrow">↓</span>
                  </li>
                  <li className="workflow-step">
                    <span className="workflow-step-num" aria-hidden="true">
                      3
                    </span>
                    <div className="workflow-step-content">
                      <h3>Admission decision</h3>
                      <p>Approved applications are evaluated for private workspace access.</p>
                    </div>
                  </li>
                </ol>
                <p className="workflow-disclaimer">
                  Admission is evaluated after review; submission or review does not guarantee
                  admission.
                </p>
              </section>
            </div>
          </div>
        </section>

        <aside className="pilot-notice-banner" aria-label="Pilot notice and limitations">
          <div className="pilot-notice-inner">
            <span className="pilot-notice-badge">Pilot Notice</span>
            <div className="pilot-notice-body">
              <p>
                <strong>Synthetic demonstration &amp; private workflow:</strong> This platform is a
                controlled pilot demonstrating private hotel onboarding workflows. It does not
                establish government jurisdiction or licensing authority, and does not provide
                public hotel booking or payment capabilities.
              </p>
              <p className="pilot-notice-legal">
                Outcomes in this pilot are private workflow determinations, not licenses or proof of
                authority to represent a hotel.
              </p>
            </div>
          </div>
        </aside>

        <section id="platform" className="content-section" aria-labelledby="platform-title">
          <h2 className="section-title" id="platform-title">
            The current hotel pilot
          </h2>
          <p className="section-lead">
            Applicants, assigned Bureau reviewers, and platform administrators collaborate through
            separate private work areas designed for clear tracking and versioned review.
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
                Server-configured synthetic offices review their assigned application versions and
                record version-specific determinations.
              </p>
            </div>
            <div className="feature-card">
              <div className="feature-icon feature-icon-teal" aria-hidden="true">
                📋
              </div>
              <h3>Private Admission</h3>
              <p>
                Approval can lead to access to the property&apos;s private workspace, but does not
                publish a hotel or activate a subscription.
              </p>
            </div>
          </div>
        </section>

        <section className="entry-section" aria-labelledby="get-started-title">
          <div className="content-section">
            <h2 className="section-title" id="get-started-title">
              Workspace Access
            </h2>
            <p className="section-lead">
              Direct access to role-specific workspace areas. All operations require authentication
              with authorized credentials. Navigation links do not grant access permissions.
            </p>
            <div className="entry-grid">
              <div className="entry-card">
                <div className="entry-card-header">
                  <span className="entry-card-audience">Hotel Operators</span>
                  <h3>Hotel Applications</h3>
                </div>
                <p className="entry-card-desc">
                  Create and manage hotel onboarding drafts, track version-specific review progress,
                  and access your admitted private workspace.
                </p>
                <a href={`${workspaceUrl}/hotels`} className="entry-card-action">
                  Go to Hotel Applications →
                </a>
              </div>

              <div className="entry-card">
                <div className="entry-card-header">
                  <span className="entry-card-audience">Bureau Officers</span>
                  <h3>Bureau Review</h3>
                </div>
                <p className="entry-card-desc">
                  Inspect assigned application versions, verify declared location hierarchies, and
                  record regional review determinations.
                </p>
                <a href={`${workspaceUrl}/bureau/hotel-cases`} className="entry-card-action">
                  Go to Bureau Review →
                </a>
              </div>

              <div className="entry-card">
                <div className="entry-card-header">
                  <span className="entry-card-audience">Administrators</span>
                  <h3>Admission Queue</h3>
                </div>
                <p className="entry-card-desc">
                  Manage the platform admission pipeline, where approval can lead to access to the
                  property&apos;s private workspace, but does not publish a hotel or activate a
                  subscription.
                </p>
                <a href={`${workspaceUrl}/admin/hotel-admissions`} className="entry-card-action">
                  Go to Admission Queue →
                </a>
              </div>
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
                  <a href={`${workspaceUrl}/admin/hotel-admissions`}>Admission Queue</a>
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
