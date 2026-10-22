import { afterEach, describe, expect, it, vi } from 'vitest';
import { getPublicUrl } from './portal-config';

afterEach(() => vi.unstubAllEnvs());

describe('workspace-to-public origin configuration', () => {
  it('uses the documented local default during development', () => {
    vi.stubEnv('NEXT_PUBLIC_PUBLIC_URL', '');
    vi.stubEnv('NODE_ENV', 'development');
    expect(getPublicUrl()).toBe('http://localhost:3000');
  });
  it('requires an explicit public origin in production', () => {
    vi.stubEnv('NEXT_PUBLIC_PUBLIC_URL', '');
    vi.stubEnv('NODE_ENV', 'production');
    expect(getPublicUrl).toThrow('NEXT_PUBLIC_PUBLIC_URL is required for production builds.');
  });
  it('normalizes an explicitly configured origin', () => {
    vi.stubEnv('NEXT_PUBLIC_PUBLIC_URL', 'https://public.example.test/');
    expect(getPublicUrl()).toBe('https://public.example.test');
  });
  it.each([
    'javascript:alert(1)',
    '/public',
    'https://user:secret@public.example.test',
    'https://public.example.test/path',
    'https://public.example.test/?next=other',
    'https://public.example.test/#other',
  ])('rejects a non-origin destination: %s', (value) => {
    vi.stubEnv('NEXT_PUBLIC_PUBLIC_URL', value);
    expect(getPublicUrl).toThrow('NEXT_PUBLIC_PUBLIC_URL must be an HTTP(S) application origin.');
  });
});
