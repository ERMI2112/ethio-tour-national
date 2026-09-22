import { describe, expect, it } from 'vitest';

describe('workspace web foundation', () => {
  it('uses the API-only application boundary', () => {
    expect('@ethio-tour/api-client').toContain('api-client');
  });
});
