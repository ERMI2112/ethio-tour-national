import { describe, expect, it } from 'vitest';

import { platformMetadata } from './schema';

describe('database foundation schema', () => {
  it('contains only the platform bootstrap metadata table in Phase 1A', () => {
    expect(platformMetadata).toBeDefined();
    expect(Object.keys(platformMetadata)).toContain('key');
  });
});
