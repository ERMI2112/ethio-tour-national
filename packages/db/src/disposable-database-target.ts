export const HOTEL_TEST_DATABASE_URL_ENV = 'HOTEL_PILOT_TEST_DATABASE_URL';
export const HOTEL_TEST_DISPOSABLE_ENV = 'HOTEL_PILOT_TEST_DISPOSABLE';
export const HOTEL_TEST_DATABASE_PREFIX = 'ethio_tour_hotel_test_';

const LOOPBACK_HOSTNAMES = new Set(['localhost', '127.0.0.1', '::1']);
const RESERVED_PORT = 56320;
const MINIMUM_TEST_PORT = 50000;

export interface DisposableDatabaseTarget {
  hostname: string;
  port: number;
  databaseName: string;
}

export type DisposableDatabaseInspection =
  | { ok: true; target: DisposableDatabaseTarget }
  | { ok: false; reason: string };

export interface DisposableMigrationTarget extends DisposableDatabaseTarget {
  /** Never log this value; only use it after the target guard succeeds. */
  url: string;
}

export type DisposableMigrationResolution =
  | { ok: true; target: DisposableMigrationTarget }
  | { ok: false; reason: string };

export function inspectDisposableDatabaseTarget(
  value: string | undefined,
): DisposableDatabaseInspection {
  const candidate = value?.trim();
  if (!candidate) {
    return { ok: false, reason: `${HOTEL_TEST_DATABASE_URL_ENV} is not set.` };
  }

  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    return { ok: false, reason: `${HOTEL_TEST_DATABASE_URL_ENV} is not a valid URL.` };
  }

  if (url.protocol !== 'postgresql:' && url.protocol !== 'postgres:') {
    return { ok: false, reason: `${HOTEL_TEST_DATABASE_URL_ENV} must be a PostgreSQL URL.` };
  }
  if (url.search || url.hash) {
    return {
      ok: false,
      reason: `${HOTEL_TEST_DATABASE_URL_ENV} must not contain query or fragment data.`,
    };
  }

  const hostname = url.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (!LOOPBACK_HOSTNAMES.has(hostname)) {
    return { ok: false, reason: 'The disposable database must be reached over loopback.' };
  }

  const port = Number(url.port);
  if (!Number.isInteger(port) || port <= 0) {
    return { ok: false, reason: 'The disposable database URL must specify a port.' };
  }
  if (port === RESERVED_PORT) {
    return { ok: false, reason: `Port ${RESERVED_PORT} is reserved and cannot be used.` };
  }
  if (port < MINIMUM_TEST_PORT) {
    return {
      ok: false,
      reason: `The disposable database must use a port of at least ${MINIMUM_TEST_PORT}.`,
    };
  }

  let databaseName: string;
  try {
    databaseName = decodeURIComponent(url.pathname.replace(/^\//, ''));
  } catch {
    return { ok: false, reason: `${HOTEL_TEST_DATABASE_URL_ENV} has an invalid database name.` };
  }
  if (!databaseName.startsWith(HOTEL_TEST_DATABASE_PREFIX) || databaseName.includes('/')) {
    return {
      ok: false,
      reason: `The database name must begin with ${HOTEL_TEST_DATABASE_PREFIX}.`,
    };
  }

  return { ok: true, target: { hostname, port, databaseName } };
}

export function isDisposableHotelTestDatabase(
  value: string | undefined,
  optIn: string | undefined,
): boolean {
  return optIn?.trim() === 'true' && inspectDisposableDatabaseTarget(value).ok;
}

export function resolveDisposableMigrationTarget(
  environment: NodeJS.ProcessEnv,
): DisposableMigrationResolution {
  if (environment.NODE_ENV?.trim().toLowerCase() === 'production') {
    return { ok: false, reason: 'Refusing disposable migration while NODE_ENV=production.' };
  }
  if (environment[HOTEL_TEST_DISPOSABLE_ENV]?.trim() !== 'true') {
    return {
      ok: false,
      reason: `${HOTEL_TEST_DISPOSABLE_ENV}=true is required for the test-only migration command.`,
    };
  }

  const inspection = inspectDisposableDatabaseTarget(environment[HOTEL_TEST_DATABASE_URL_ENV]);
  if (!inspection.ok) return inspection;

  return {
    ok: true,
    target: {
      ...inspection.target,
      url: environment[HOTEL_TEST_DATABASE_URL_ENV]!.trim(),
    },
  };
}
