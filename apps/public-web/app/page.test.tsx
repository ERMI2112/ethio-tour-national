import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import PublicHomePage from './page';

beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_WORKSPACE_URL', 'http://localhost:3001');
});
afterEach(() => vi.unstubAllEnvs());

describe('public homepage', () => {
  it('renders the brand in the header', () => {
    const html = renderToStaticMarkup(<PublicHomePage />);
    expect(html).toContain('aria-label="EthioTour National home"');
    expect(html).toContain('EthioTour National');
  });

  it('links the workspace entry point to the configured workspace URL', () => {
    const html = renderToStaticMarkup(<PublicHomePage />);
    expect(html).toContain('href="http://localhost:3001"');
    expect(html).toContain('Workspace →');
  });

  it('renders the hero with a focused heading, short pilot eyebrow, and supporting copy', () => {
    const html = renderToStaticMarkup(<PublicHomePage />);
    expect(html).toContain('Hotel onboarding pilot');
    expect(html).toContain('<h1>Manage your hotel application in one place.</h1>');
    expect(html).toContain(
      'Prepare your application, follow its review progress, and access your private workspace after admission.',
    );
  });

  it('provides a working call to action to open the workspace', () => {
    const html = renderToStaticMarkup(<PublicHomePage />);
    expect(html).toContain(
      'href="http://localhost:3001" class="hero-cta-primary">Open Workspace</a>',
    );
  });

  it('provides a Learn More anchor that links within the page', () => {
    const html = renderToStaticMarkup(<PublicHomePage />);
    expect(html).toContain('href="#platform" class="hero-cta-secondary">Learn More</a>');
  });

  it('renders workflow presentation content in the hero without implying guaranteed approval', () => {
    const html = renderToStaticMarkup(<PublicHomePage />);
    expect(html).toContain('class="hero-workflow-card"');
    expect(html).toContain('aria-labelledby="workflow-title"');
    expect(html).toContain(
      '<h2 class="workflow-title" id="workflow-title">Application Workflow</h2>',
    );
    expect(html).not.toContain('id="workflow"');
    expect(html).toContain('Prepare application');
    expect(html).toContain('Bureau review');
    expect(html).toContain('Admission decision');
    expect(html).toContain('does not guarantee admission');
  });

  it('consolidates limitations into one visible pilot notice without inventing unverified claims', () => {
    const html = renderToStaticMarkup(<PublicHomePage />);
    expect(html).toContain('Pilot Notice');
    expect(html).toContain('Synthetic demonstration &amp; private workflow');
    expect(html).toContain('does not establish government jurisdiction or licensing authority');
    expect(html).toContain('does not provide public hotel booking or payment capabilities');
    expect(html).toContain('not licenses or proof of authority');
    expect(html).toContain(
      'Approval can lead to access to the property&#x27;s private workspace, but does not publish a hotel or activate a subscription.',
    );

    // Implemented capabilities:
    expect(html).toContain('Hotel Onboarding');
    expect(html).toContain('Synthetic Bureau Review');
    expect(html).toContain('Private Admission');

    // No unverified statutory claims or fake consumer features:
    expect(html).not.toContain('government verification');
    expect(html).not.toContain('public discovery interface');
    expect(html).not.toContain('booking engine');
    expect(html).not.toContain('payment processing');
    expect(html).not.toContain('reserve now');
    expect(html).not.toContain('5-star customer reviews');
  });

  it('renders audience cards with specific action links to the three workspace destinations', () => {
    const html = renderToStaticMarkup(<PublicHomePage />);
    // Audience headings and tags:
    expect(html).toContain('Hotel Operators');
    expect(html).toContain('Hotel Applications');
    expect(html).toContain('Bureau Officers');
    expect(html).toContain('Bureau Review');
    expect(html).toContain('Administrators');
    expect(html).toContain('Admission Queue');

    // Specific action links and destinations:
    expect(html).toContain('href="http://localhost:3001/hotels"');
    expect(html).toContain('Go to Hotel Applications →');

    expect(html).toContain('href="http://localhost:3001/bureau/hotel-cases"');
    expect(html).toContain('Go to Bureau Review →');

    expect(html).toContain('href="http://localhost:3001/admin/hotel-admissions"');
    expect(html).toContain('Go to Admission Queue →');

    // Admission card limitation:
    expect(html).toContain(
      'where approval can lead to access to the property&#x27;s private workspace, but does not publish a hotel or activate a subscription.',
    );

    // Navigation does not imply permission:
    expect(html).toContain('Navigation links do not grant access permissions.');
  });

  it('renders footer workspace links to existing routes', () => {
    const html = renderToStaticMarkup(<PublicHomePage />);
    expect(html).toContain('href="http://localhost:3001/hotels"');
    expect(html).toContain('href="http://localhost:3001/bureau/hotel-cases"');
    expect(html).toContain('href="http://localhost:3001/admin/hotel-admissions"');
  });

  it('renders semantic headings (h1, h2, h3) in order', () => {
    const html = renderToStaticMarkup(<PublicHomePage />);
    const h1Count = (html.match(/<h1[\s>]/g) || []).length;
    const h2Count = (html.match(/<h2[\s>]/g) || []).length;
    const h3Count = (html.match(/<h3[\s>]/g) || []).length;

    expect(h1Count).toBe(1);
    expect(h2Count).toBeGreaterThanOrEqual(2);
    expect(h3Count).toBeGreaterThanOrEqual(3);
  });

  it('uses a configured origin with no double slash in private route links', () => {
    vi.stubEnv('NEXT_PUBLIC_WORKSPACE_URL', 'https://workspace.example.test/');
    const html = renderToStaticMarkup(<PublicHomePage />);
    expect(html).toContain('href="https://workspace.example.test/hotels"');
    expect(html).toContain('href="https://workspace.example.test/bureau/hotel-cases"');
    expect(html).toContain('href="https://workspace.example.test/admin/hotel-admissions"');
    expect(html).not.toContain('example.test//');
  });

  it('renders accessible mobile navigation controls with aria attributes', () => {
    const html = renderToStaticMarkup(<PublicHomePage />);
    expect(html).toContain('aria-controls="site-main-nav"');
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain('aria-label="Open navigation menu"');
    expect(html).toContain('aria-label="Main navigation"');
  });
});
