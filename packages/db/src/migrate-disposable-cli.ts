import { resolveDisposableMigrationTarget } from './disposable-database-target';
import { migrateDatabase } from './migrate';

async function main(): Promise<void> {
  const resolution = resolveDisposableMigrationTarget(process.env);
  if (!resolution.ok) {
    console.error(`[hotel-test-migrate] Refused: ${resolution.reason}`);
    process.exitCode = 1;
    return;
  }

  const { url, hostname, port, databaseName } = resolution.target;
  process.env.DATABASE_URL = url;
  console.log(
    `[hotel-test-migrate] Applying migrations to the declared disposable test database ${hostname}:${port}/${databaseName}.`,
  );

  await migrateDatabase();
  console.log('[hotel-test-migrate] Migration chain completed; no seed data was written.');
}

main().catch(() => {
  console.error(
    '[hotel-test-migrate] Migration failed. Check the local target and logs without sharing connection details.',
  );
  process.exitCode = 1;
});
