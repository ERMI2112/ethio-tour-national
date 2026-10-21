import { describe, expect, it } from 'vitest';

import { schema } from './schema';

describe('platform and synthetic hotel pilot database schema', () => {
  it('adds private hotel onboarding history without replacing platform or registry tables', () => {
    expect(Object.keys(schema)).toEqual(
      expect.arrayContaining([
        'platformMetadata',
        'administrativeUnits',
        'administrativeUnitPaths',
        'organizations',
        'hotelLocations',
        'hotelLocationRoutes',
        'hotelApplications',
        'hotelApplicationVersions',
        'hotelBureauCases',
        'hotelBureauDecisions',
        'hotelAdmissionDecisions',
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
    expect(Object.keys(schema)).toHaveLength(24);
  });
});
