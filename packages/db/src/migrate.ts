import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { existsSync } from 'node:fs';
import path from 'node:path';

import { createDatabase } from './client';

export async function migrateDatabase(): Promise<void> {
  const { client, db } = createDatabase();
  const migrationCandidates =
    typeof __dirname === 'undefined'
      ? [path.resolve(process.cwd(), 'drizzle'), path.resolve(process.cwd(), 'packages/db/drizzle')]
      : [path.resolve(__dirname, '../drizzle')];
  const migrationsFolder = migrationCandidates.find((candidate) =>
    existsSync(path.join(candidate, 'meta/_journal.json')),
  );

  if (!migrationsFolder) {
    throw new Error('Drizzle migration metadata was not found.');
  }

  try {
    await migrate(db, { migrationsFolder });
  } finally {
    await client.end();
  }
}
