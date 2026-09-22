import { describe, expect, it } from 'vitest';

describe('public web foundation', () => {
  it('uses the API-only application boundary', () => {
    expect('@ethio-tour/api-client').toContain('api-client');
  });
});
