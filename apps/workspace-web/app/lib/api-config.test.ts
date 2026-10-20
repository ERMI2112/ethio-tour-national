import { afterEach, describe, expect, it, vi } from 'vitest';

import { getClientApiBaseUrl } from './api-config';

describe('workspace API URL configuration', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('uses the explicitly configured public API URL', () => {
    vi.stubEnv('NEXT_PUBLIC_API_BASE_URL', 'http://localhost:4400/api');

    expect(getClientApiBaseUrl()).toBe('http://localhost:4400/api');
  });

  it('does not infer an API URL from another environment variable', () => {
    vi.stubEnv('NEXT_PUBLIC_API_BASE_URL', '');
    vi.stubEnv('API_BASE_URL', 'http://api:4000/api');

    expect(() => getClientApiBaseUrl()).toThrow('NEXT_PUBLIC_API_BASE_URL must be configured');
  });
});
