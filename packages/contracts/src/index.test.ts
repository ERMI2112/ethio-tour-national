import { describe, expect, it } from 'vitest';

import type { HealthResponse } from './index';

describe('foundation contracts', () => {
  it('describes a healthy Phase 1A service', () => {
    const response: HealthResponse = {
      service: 'api',
      status: 'ok',
      phase: '1A',
      timestamp: new Date().toISOString(),
    };

    expect(response.status).toBe('ok');
    expect(response.phase).toBe('1A');
  });
});
