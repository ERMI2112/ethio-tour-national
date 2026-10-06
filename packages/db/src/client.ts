import postgres from 'postgres';
import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';

import * as databaseSchema from './schema';

export type Database = PostgresJsDatabase<typeof databaseSchema>;
export type DatabaseClient = postgres.Sql;

export function createDatabase(connectionString = process.env.DATABASE_URL): {
  client: DatabaseClient;
  db: Database;
} {
  if (!connectionString) {
    throw new Error('DATABASE_URL is required');
  }

  const client = postgres(connectionString, { max: 10 });
  const db = drizzle(client, { schema: databaseSchema });

  return { client, db };
}
