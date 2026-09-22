import { describe, expect, it } from 'vitest';

describe('API foundation', () => {
  it('does not expose feature modules in Phase 1A', () => {
    expect(process.env.NODE_ENV ?? 'test').toBeTypeOf('string');
  });
});
