import { describe, expect, it, vi } from 'vitest';

import type { DatabaseClient } from './client';
import {
  provisionSyntheticHotelReleasePair,
  provisionSyntheticHotelRoutingRelease,
  provisionSyntheticHotelReviewScope,
  type SyntheticHotelReviewScopeInput,
} from './provision-hotel-location-directory';
import { syntheticHotelReleasePairImport } from './synthetic-hotel-location-fixture';

describe('synthetic hotel directory provisioning guard', () => {
  it.each([
    { NODE_ENV: 'production', REGISTRY_POLICY_MODE: 'demo' },
    { NODE_ENV: 'development', REGISTRY_POLICY_MODE: 'production' },
    { REGISTRY_POLICY_MODE: 'demo' },
  ])('refuses an unapproved runtime before opening a transaction: %j', async (environment) => {
    const begin = vi.fn();
    const client = { begin } as unknown as DatabaseClient;
    await expect(
      provisionSyntheticHotelReleasePair(client, syntheticHotelReleasePairImport, environment),
    ).rejects.toThrow('development/test');
    await expect(
      provisionSyntheticHotelRoutingRelease(
        client,
        syntheticHotelReleasePairImport.routing,
        environment,
      ),
    ).rejects.toThrow('development/test');
    expect(begin).not.toHaveBeenCalled();
  });

  it('refuses incompatible release references and invalid imports without writing', async () => {
    const begin = vi.fn();
    const client = { begin } as unknown as DatabaseClient;
    const environment = { NODE_ENV: 'test', REGISTRY_POLICY_MODE: 'demo' };
    await expect(
      provisionSyntheticHotelReleasePair(
        client,
        {
          ...syntheticHotelReleasePairImport,
          routing: { ...syntheticHotelReleasePairImport.routing, geographyReleaseId: 'wrong' },
        },
        environment,
      ),
    ).rejects.toThrow('incompatible');
    await expect(
      provisionSyntheticHotelReleasePair(
        client,
        {
          ...syntheticHotelReleasePairImport,
          geography: { ...syntheticHotelReleasePairImport.geography, units: [] },
        },
        environment,
      ),
    ).rejects.toThrow('validation failed');
    expect(begin).not.toHaveBeenCalled();
  });
});

const reviewScope: SyntheticHotelReviewScopeInput = {
  issuer: 'https://identity.example.test/realms/synthetic-review',
  subjectId: 'synthetic-officer',
  membershipId: '80000000-0000-4000-8000-000000000001',
  organizationId: 'synthetic-office',
  capability: 'hotel:application:bureau:read',
  geographyReleaseId: 'synthetic-geography-B',
  scopeUnitId: 'synthetic-area',
  includeDescendants: true,
};
const scopeEnvironment = {
  NODE_ENV: 'test',
  REGISTRY_POLICY_MODE: 'demo',
  HOTEL_PILOT_TEST_DISPOSABLE: 'true',
  HOTEL_PILOT_TEST_DATABASE_URL: 'postgresql://127.0.0.1:57001/ethio_tour_hotel_test_scope_units',
};
function scopeClient() {
  return {
    options: { host: ['127.0.0.1'], port: [57001], database: 'ethio_tour_hotel_test_scope_units' },
    begin: vi.fn(),
  };
}

describe('explicit synthetic hotel review-scope guard without services', () => {
  it.each([
    { NODE_ENV: 'production' },
    { NODE_ENV: '' },
    { REGISTRY_POLICY_MODE: 'production' },
    { HOTEL_PILOT_TEST_DISPOSABLE: 'false' },
    { HOTEL_PILOT_TEST_DATABASE_URL: '' },
    {
      HOTEL_PILOT_TEST_DATABASE_URL:
        'postgresql://127.0.0.1:56320/ethio_tour_hotel_test_scope_units',
    },
    { HOTEL_PILOT_TEST_DATABASE_URL: 'postgresql://127.0.0.1:57001/ethio_tour' },
  ])('rejects unsafe configuration before connecting: %j', async (overrides) => {
    const client = scopeClient();
    await expect(
      provisionSyntheticHotelReviewScope(client as unknown as DatabaseClient, reviewScope, {
        ...scopeEnvironment,
        ...overrides,
      }),
    ).rejects.toThrow('guarded disposable');
    expect(client.begin).not.toHaveBeenCalled();
  });

  it.each([
    { host: ['other.example.test'] },
    { host: ['127.0.0.1', 'other.example.test'] },
    { port: [57002] },
    { database: 'other_database' },
  ])('rejects an effective client target mismatch: %j', async (overrides) => {
    const client = scopeClient();
    Object.assign(client.options, overrides);
    await expect(
      provisionSyntheticHotelReviewScope(
        client as unknown as DatabaseClient,
        reviewScope,
        scopeEnvironment,
      ),
    ).rejects.toThrow('does not match');
    expect(client.begin).not.toHaveBeenCalled();
  });

  it.each([
    { subjectId: '' },
    { membershipId: 'not-a-uuid' },
    { organizationId: ' synthetic-office' },
    { geographyReleaseId: '' },
    { scopeUnitId: '' },
    { includeDescendants: 'true' },
    { capability: 'hotel:application:admin:decide' },
    { active: true },
    { issuer: 'urn:unapproved:issuer' },
    { issuer: 'https://identity.example.test/#fragment' },
  ])('rejects incomplete or conflicting authority inputs: %j', async (overrides) => {
    const client = scopeClient();
    await expect(
      provisionSyntheticHotelReviewScope(
        client as unknown as DatabaseClient,
        { ...reviewScope, ...overrides } as SyntheticHotelReviewScopeInput,
        scopeEnvironment,
      ),
    ).rejects.toThrow();
    expect(client.begin).not.toHaveBeenCalled();
  });
});
