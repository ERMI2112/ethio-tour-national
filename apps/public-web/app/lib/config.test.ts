import { afterEach, describe, expect, it, vi } from 'vitest';
import { getWorkspaceUrl } from './config';

afterEach(() => vi.unstubAllEnvs());

describe('public-to-workspace origin configuration', () => {
  it('keeps the documented local default without inferring the browser port', () => {
    vi.stubEnv('NEXT_PUBLIC_WORKSPACE_URL', '');
    expect(getWorkspaceUrl()).toBe('http://localhost:3001');
  });
  it.each([
    'javascript:alert(1)',
    '/workspace',
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
