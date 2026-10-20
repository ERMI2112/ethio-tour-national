$ErrorActionPreference = 'Stop'

$connectionString = $env:HOTEL_PILOT_TEST_DATABASE_URL
if ([string]::IsNullOrWhiteSpace($connectionString)) {
  throw 'HOTEL_PILOT_TEST_DATABASE_URL must target a fresh disposable hotel test database.'
}

try {
  $target = [Uri]::new($connectionString)
} catch {
  throw 'HOTEL_PILOT_TEST_DATABASE_URL must be a valid PostgreSQL connection URL.'
}

$databaseName = [Uri]::UnescapeDataString($target.AbsolutePath.TrimStart('/'))
if (
  $target.Scheme -notin @('postgres', 'postgresql') -or
  $target.DnsSafeHost -notin @('localhost', '127.0.0.1') -or
  $target.Port -lt 50000 -or
  $target.Port -eq 56320 -or
  $databaseName -notlike 'ethio_tour_hotel_test_*'
) {
  throw 'Refusing hotel pilot verification: target must be a fresh, loopback disposable database on an allowed high port.'
}

$env:DATABASE_URL = $connectionString
$env:HOTEL_PILOT_TEST_DISPOSABLE = 'true'
$env:HOTEL_PILOT_TEST_REQUIRED = 'true'

pnpm db:migrate
if ($LASTEXITCODE -ne 0) {
  throw 'Hotel pilot migration failed; do not rerun against another database without verifying the target.'
}

pnpm --filter @ethio-tour/backend-domain exec vitest run src/hotels/hotel-onboarding.integration.test.ts --reporter=verbose
if ($LASTEXITCODE -ne 0) {
  exit $LASTEXITCODE
}
