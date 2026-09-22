import { describe, expect, it } from 'vitest';

import { authorize } from './index';

describe('authorization foundation', () => {
  it('fails closed without an authenticated subject', () => {
    const decision = authorize(null, {
      capability: 'platform:health:read',
      organizationId: 'bureau-gondar',
    });

    expect(decision).toEqual({ allowed: false, reason: 'unauthenticated' });
  });

  it('requires the requested administrative scope', () => {
    const decision = authorize(
      {
        authenticated: true,
        subjectId: 'subject-1',
        grants: [
          {
            capability: 'platform:health:read',
            organizationId: 'bureau-gondar',
            administrativeUnitIds: ['gondar'],
            active: true,
          },
        ],
      },
      {
        capability: 'platform:health:read',
        organizationId: 'bureau-gondar',
        administrativeUnitId: 'lalibela',
      },
    );

    expect(decision).toEqual({ allowed: false, reason: 'missing-scope' });
  });
});
