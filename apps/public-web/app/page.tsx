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
            <p className="hero-eyebrow">National Tourism Platform</p>
            <h1>
              Discover Ethiopia.
              <br />
              Build Ethiopian Tourism.
            </h1>
            <p className="hero-subtitle">
              EthioTour National connects destinations, service providers, and government
              verification in one coordinated platform for Ethiopian tourism.
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
            What EthioTour National provides
          </h2>
          <p className="section-lead">
            A coordinated workflow connecting tourism applicants with the Bureau of Tourism and
            platform administrators for transparent, structured onboarding.
          </p>
          <div className="features-grid">
            <div className="feature-card">
              <div className="feature-icon feature-icon-green" aria-hidden="true">
                🏨
              </div>
              <h3>Hotel Onboarding</h3>
              <p>
                Hotel operators apply through a structured workflow. Applications are reviewed by
                the Bureau of Tourism and then admitted by a platform administrator before private
                workspace access is granted.
              </p>
            </div>
            <div className="feature-card">
              <div className="feature-icon feature-icon-amber" aria-hidden="true">
                🔍
              </div>
              <h3>Bureau Verification</h3>
              <p>
                The Tourism Bureau reviews submitted hotel applications with location-aware routing.
                Each case is assigned to the responsible office with decision history and version
                tracking.
              </p>
            </div>
            <div className="feature-card">
              <div className="feature-icon feature-icon-teal" aria-hidden="true">
                📋
              </div>
              <h3>Destination Registry</h3>
              <p>
                Destinations and attractions are managed through a content registry with editorial
                review, versioning, and a public discovery interface.
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
                <p>Review assigned hotel applications and record verification decisions.</p>
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
                A platform for Ethiopian tourism — connecting destinations, service providers, and
                regulatory workflows.
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
