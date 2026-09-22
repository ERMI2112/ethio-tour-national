import { migrateDatabase } from './migrate';

migrateDatabase().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
