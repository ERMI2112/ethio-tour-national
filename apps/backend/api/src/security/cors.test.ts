import { describe, expect, it } from 'vitest';

import { corsAllowedOrigins } from './cors';

describe('CORS origin configuration', () => {
  it('denies cross-origin access when no origins are configured', () => {
    expect(corsAllowedOrigins(undefined)).toEqual([]);
    expect(corsAllowedOrigins('  ')).toEqual([]);
  });

  it('returns a trimmed, de-duplicated explicit allowlist', () => {
    expect(
      corsAllowedOrigins('http://localhost:3000, http://localhost:3001,http://localhost:3000'),
    ).toEqual(['http://localhost:3000', 'http://localhost:3001']);
  });

  it.each(['*', 'https://example.test/path', 'ftp://example.test', 'https://user@example.test'])(
    'rejects unsafe or non-origin entry %s',
    (value) => {
      expect(() => corsAllowedOrigins(value)).toThrow();
    },
  );
});
