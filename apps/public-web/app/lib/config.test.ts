import { afterEach, describe, expect, it, vi } from 'vitest';
import { getWorkspaceUrl } from './config';

afterEach(() => vi.unstubAllEnvs());

describe('public-to-workspace origin configuration', () => {
  it('uses the documented local default during development', () => {
    vi.stubEnv('NEXT_PUBLIC_WORKSPACE_URL', '');
    vi.stubEnv('NODE_ENV', 'development');
    expect(getWorkspaceUrl()).toBe('http://localhost:3001');
  });
  it('requires an explicit workspace origin in production', () => {
    vi.stubEnv('NEXT_PUBLIC_WORKSPACE_URL', '');
    vi.stubEnv('NODE_ENV', 'production');
    expect(getWorkspaceUrl).toThrow('NEXT_PUBLIC_WORKSPACE_URL is required for production builds.');
  });
  it.each([
    'javascript:alert(1)',
    '/workspace',
    'https://user:secret@workspace.example.test',
    'https://workspace.example.test/path',
    'https://workspace.example.test/?next=other',
    'https://workspace.example.test/#other',
  ])('rejects a non-origin destination: %s', (value) => {
    vi.stubEnv('NEXT_PUBLIC_WORKSPACE_URL', value);
    expect(getWorkspaceUrl).toThrow(
      'NEXT_PUBLIC_WORKSPACE_URL must be an HTTP(S) application origin.',
    );
  });
});
