import { describe, expect, it } from 'vitest';

import {
  HOTEL_TEST_DATABASE_PREFIX,
  inspectDisposableDatabaseTarget,
  isDisposableHotelTestDatabase,
  resolveDisposableMigrationTarget,
} from './disposable-database-target';

const safeTarget = `postgresql://127.0.0.1:55432/${HOTEL_TEST_DATABASE_PREFIX}local`;

describe('disposable hotel test database guard', () => {
  it('accepts explicitly opted-in loopback targets with a named high-port database', () => {
    expect(inspectDisposableDatabaseTarget(safeTarget)).toEqual({
      ok: true,
      target: {
        hostname: '127.0.0.1',
        port: 55432,
        databaseName: 'ethio_tour_hotel_test_local',
      },
    });
    expect(
      inspectDisposableDatabaseTarget(`postgresql://[::1]:55432/${HOTEL_TEST_DATABASE_PREFIX}local`)
        .ok,
    ).toBe(true);
    expect(isDisposableHotelTestDatabase(safeTarget, 'true')).toBe(true);
  });

  it('rejects malformed, non-PostgreSQL, remote, shared-port, and misnamed targets', () => {
    const invalidTargets = [
      undefined,
      'not a URL',
      `mysql://127.0.0.1:55432/${HOTEL_TEST_DATABASE_PREFIX}local`,
      `postgresql://db.internal:55432/${HOTEL_TEST_DATABASE_PREFIX}local`,
      `postgresql://127.0.0.1:5432/${HOTEL_TEST_DATABASE_PREFIX}local`,
      `postgresql://127.0.0.1:56320/${HOTEL_TEST_DATABASE_PREFIX}local`,
      'postgresql://127.0.0.1:55432/ethio_tour',
      `postgresql://127.0.0.1:55432/${HOTEL_TEST_DATABASE_PREFIX}bad%2Fname`,
      `${safeTarget}?sslmode=disable`,
    ];

    for (const value of invalidTargets) {
      expect(inspectDisposableDatabaseTarget(value).ok).toBe(false);
    }
  });

  it('requires the explicit disposable opt-in', () => {
    for (const value of [undefined, 'false', 'TRUE', '1']) {
      expect(isDisposableHotelTestDatabase(safeTarget, value)).toBe(false);
    }
  });

  it('resolves only the named test URL and ignores a general DATABASE_URL', () => {
    const resolution = resolveDisposableMigrationTarget({
      NODE_ENV: 'test',
      DATABASE_URL: 'postgresql://127.0.0.1:5432/ethio_tour',
      HOTEL_PILOT_TEST_DATABASE_URL: safeTarget,
      HOTEL_PILOT_TEST_DISPOSABLE: 'true',
    });

    expect(resolution).toEqual({
      ok: true,
      target: {
        url: safeTarget,
        hostname: '127.0.0.1',
        port: 55432,
        databaseName: 'ethio_tour_hotel_test_local',
      },
    });
  });

  it('refuses general DATABASE_URL fallback, missing opt-in, and production', () => {
    expect(
      resolveDisposableMigrationTarget({
        NODE_ENV: 'test',
        DATABASE_URL: 'postgresql://127.0.0.1:5432/ethio_tour',
        HOTEL_PILOT_TEST_DISPOSABLE: 'true',
      }).ok,
    ).toBe(false);
    expect(
      resolveDisposableMigrationTarget({
        NODE_ENV: 'test',
        HOTEL_PILOT_TEST_DATABASE_URL: safeTarget,
      }).ok,
    ).toBe(false);
    expect(
      resolveDisposableMigrationTarget({
        NODE_ENV: 'production',
        HOTEL_PILOT_TEST_DATABASE_URL: safeTarget,
        HOTEL_PILOT_TEST_DISPOSABLE: 'true',
      }).ok,
    ).toBe(false);
  });

  it('never includes the supplied URL in validation errors', () => {
    const invalidUrl = 'postgresql://db.invalid:5432/ethio_tour';
    const result = inspectDisposableDatabaseTarget(invalidUrl);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).not.toContain(invalidUrl);
  });
});
