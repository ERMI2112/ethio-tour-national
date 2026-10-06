import { describe, expect, it } from 'vitest';

import { schema } from './schema';

describe('registry slice database schema', () => {
  it('contains only the platform, scoped authorization, registry, audit and outbox tables', () => {
    expect(Object.keys(schema)).toEqual(
      expect.arrayContaining([
        'platformMetadata',
        'administrativeUnits',
        'administrativeUnitPaths',
        'organizations',
        'userProfiles',
        'memberships',
        'accessGrants',
        'grantScopes',
        'registryResources',
        'resourceRevisions',
        'submissions',
        'reviewDecisions',
        'publicationReleases',
        'publicationWithdrawals',
        'auditEvents',
        'outboxEvents',
        'notifications',
      ]),
    );
    expect(Object.keys(schema)).toHaveLength(17);
  });
});
