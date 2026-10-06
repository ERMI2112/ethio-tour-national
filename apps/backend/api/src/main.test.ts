import { describe, expect, it } from 'vitest';

import { HealthController } from './health/health.controller';

describe('API health contract', () => {
  it('identifies the running API as Phase 1B', () => {
    const health = new HealthController().getHealth();

    expect(health).toMatchObject({ service: 'api', status: 'ok', phase: '1B' });
    expect(Date.parse(health.timestamp)).not.toBeNaN();
  });
});
