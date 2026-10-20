import { describe, expect, it } from 'vitest';
import {
  assertDisposableOptIn,
  parseDisposableLoopbackUrl,
} from './hotel-onboarding-config-policy';

describe('hotel E2E environment guard', () => {
  it('requires an explicit disposable-environment opt-in', () => {
    expect(() => assertDisposableOptIn('true')).not.toThrow();
    for (const value of [undefined, '', 'false', 'TRUE', '1']) {
      expect(() => assertDisposableOptIn(value)).toThrow(
        'HOTEL_E2E_DISPOSABLE must be explicitly set to true.',
      );
    }
  });

  it('allows only the three explicit loopback hostnames', () => {
    expect(parseDisposableLoopbackUrl('WORKSPACE', 'http://localhost:3001/').hostname).toBe(
      'localhost',
    );
    expect(
      parseDisposableLoopbackUrl('API', 'http://127.0.0.1:4400/api', { apiPath: '/api' }).hostname,
    ).toBe('127.0.0.1');
    expect(
      parseDisposableLoopbackUrl('KEYCLOAK', 'https://[::1]:8443/realms/synthetic').hostname,
    ).toBe('[::1]');
  });

  it('rejects non-loopback hosts without echoing the supplied URL', () => {
    const suppliedUrl = 'https://keycloak.example.test/realms/synthetic';
    let errorMessage = '';
    try {
      parseDisposableLoopbackUrl('HOTEL_E2E_KEYCLOAK_ISSUER_URL', suppliedUrl);
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : '';
    }

    expect(errorMessage).toContain('HOTEL_E2E_KEYCLOAK_ISSUER_URL');
    expect(errorMessage).not.toContain(suppliedUrl);
    expect(errorMessage).not.toContain('keycloak.example.test');
  });

  it('rejects the protected local port without connecting to it', () => {
    const suppliedUrl = 'http://127.0.0.1:56320/api';
    let errorMessage = '';
    try {
      parseDisposableLoopbackUrl('HOTEL_E2E_API_URL', suppliedUrl, { apiPath: '/api' });
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : '';
    }

    expect(errorMessage).toContain('HOTEL_E2E_API_URL');
    expect(errorMessage).not.toContain(suppliedUrl);
    expect(errorMessage).not.toContain('56320');
  });

  it('rejects alternate local-network hosts and URL credentials or query data', () => {
    for (const value of [
      'http://192.168.1.10:3000/',
      'http://devbox.local:3000/',
      'http://api.localhost:4000/api',
      'http://user:password@localhost:3000/',
      'http://localhost:3000/?token=private',
    ]) {
      expect(() => parseDisposableLoopbackUrl('HOTEL_E2E_URL', value)).toThrow(
        'HOTEL_E2E_URL must use HTTP(S), an allowed loopback host and port, and no embedded credentials or query data.',
      );
    }
  });

  it('enforces the workspace root and API base paths', () => {
    expect(() =>
      parseDisposableLoopbackUrl('HOTEL_E2E_WORKSPACE_URL', 'http://localhost:3001/hotels', {
        requireRootPath: true,
      }),
    ).toThrow(
      'HOTEL_E2E_WORKSPACE_URL must identify the workspace origin without an application subpath.',
    );
    expect(() =>
      parseDisposableLoopbackUrl('HOTEL_E2E_API_URL', 'http://localhost:4000/v1', {
        apiPath: '/api',
      }),
    ).toThrow('HOTEL_E2E_API_URL must identify the /api base path.');
    expect(
      parseDisposableLoopbackUrl('HOTEL_E2E_API_URL', 'http://localhost:4000/api/', {
        apiPath: '/api',
      }).pathname,
    ).toBe('/api');
  });
});
