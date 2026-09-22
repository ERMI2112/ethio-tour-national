import { describe, expect, it } from 'vitest';

import { createBackendRuntime } from './index';

describe('shared backend runtime', () => {
  it('exposes the same fail-closed policy surface to backend services', () => {
    const runtime = createBackendRuntime('worker', {
      DATABASE_URL: 'postgresql://local',
    });

    expect(runtime.serviceName).toBe('worker');
    expect(runtime.databaseConfigured).toBe(true);
    expect(
      runtime.authorize(null, {
        capability: 'platform:health:read',
        organizationId: 'bureau-gondar',
      }).allowed,
    ).toBe(false);
  });
});
