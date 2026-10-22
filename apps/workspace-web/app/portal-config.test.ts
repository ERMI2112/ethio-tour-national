import { afterEach, describe, expect, it, vi } from 'vitest';
import { getPublicUrl } from './portal-config';

afterEach(() => vi.unstubAllEnvs());

describe('workspace-to-public origin configuration', () => {
  it('normalizes an explicitly configured origin', () => {
    vi.stubEnv('NEXT_PUBLIC_PUBLIC_URL', 'https://public.example.test/');
    expect(getPublicUrl()).toBe('https://public.example.test');
  });
  it.each([
    'javascript:alert(1)',
    '/public',
    'https://public.example.test/path',
    'https://public.example.test/?next=other',
    'https://public.example.test/#other',
  ])('rejects a non-origin destination: %s', (value) => {
    vi.stubEnv('NEXT_PUBLIC_PUBLIC_URL', value);
    expect(getPublicUrl).toThrow('NEXT_PUBLIC_PUBLIC_URL must be an HTTP(S) application origin.');
  });
});
