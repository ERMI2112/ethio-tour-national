import { describe, expect, it, vi } from 'vitest';

import type { DatabaseClient } from './client';
import {
  provisionSyntheticHotelReleasePair,
  provisionSyntheticHotelRoutingRelease,
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
