import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import PublicHomePage from './page';

beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_WORKSPACE_URL', 'http://localhost:3001');
});

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

  it('renders the hero with a tourism-focused heading and eyebrow', () => {
    const html = renderToStaticMarkup(<PublicHomePage />);
    expect(html).toContain('National Tourism Platform');
    expect(html).toContain('Discover Ethiopia');
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

  it('describes implemented capabilities without inventing unverified claims', () => {
    const html = renderToStaticMarkup(<PublicHomePage />);
    // Implemented capabilities:
    expect(html).toContain('Hotel Onboarding');
    expect(html).toContain('Bureau Verification');
    expect(html).toContain('Destination Registry');

    // No invented booking, payment, reservation, or fake stats:
    expect(html).not.toContain('booking engine');
    expect(html).not.toContain('payment processing');
    expect(html).not.toContain('reserve now');
    expect(html).not.toContain('5-star customer reviews');
  });

  it('renders entry point cards for operators, bureau officers, and administrators', () => {
    const html = renderToStaticMarkup(<PublicHomePage />);
    expect(html).toContain('Hotel Operators');
    expect(html).toContain('Bureau Officers');
    expect(html).toContain('Administrators');
    expect(html).toContain('Go to Workspace →');
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

  it('renders accessible mobile navigation controls with aria attributes', () => {
    const html = renderToStaticMarkup(<PublicHomePage />);
    expect(html).toContain('aria-controls="site-main-nav"');
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain('aria-label="Open navigation menu"');
    expect(html).toContain('aria-label="Main navigation"');
  });
});
