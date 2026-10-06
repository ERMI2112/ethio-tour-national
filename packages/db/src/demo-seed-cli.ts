import { existsSync } from 'node:fs';
import path from 'node:path';

import { createDatabase } from './client';
import { demoActorKeys, seedSyntheticRegistryDemo, type DemoActorKey } from './demo-seed';

interface SeedEnvironment {
  DATABASE_URL?: string;
  DEMO_ISSUER?: string;
  DEMO_ACTORS_JSON?: string;
  NODE_ENV?: string;
  REGISTRY_POLICY_MODE?: string;
}

async function main(): Promise<void> {
  const envFile = path.resolve(process.cwd(), '.env');
  if (existsSync(envFile)) process.loadEnvFile(envFile);
  const env = process.env as SeedEnvironment;
  if (env.NODE_ENV === 'production' || env.REGISTRY_POLICY_MODE !== 'demo') {
    throw new Error('Demo seeding requires REGISTRY_POLICY_MODE=demo outside production.');
  }
  if (!env.DATABASE_URL) throw new Error('DATABASE_URL is required.');
  if (!env.DEMO_ISSUER) throw new Error('DEMO_ISSUER is required.');

  const actorSubjects = parseActorSubjects(env.DEMO_ACTORS_JSON);
  const { client } = createDatabase(env.DATABASE_URL);
  try {
    const assigned = await seedSyntheticRegistryDemo(client, env.DEMO_ISSUER, actorSubjects);
    console.info(
      `Synthetic registry structure is ready; demo actor assignments added: ${assigned}.`,
    );
  } finally {
    await client.end();
  }
}

function parseActorSubjects(value: string | undefined): Partial<Record<DemoActorKey, string>> {
  if (!value) return {};
  const parsed: unknown = JSON.parse(value);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('DEMO_ACTORS_JSON must be a JSON object of role keys to identity subject IDs.');
  }
  const assignments: Partial<Record<DemoActorKey, string>> = {};
  for (const [key, subjectId] of Object.entries(parsed)) {
    if (!demoActorKeys.includes(key as DemoActorKey)) {
      throw new Error('DEMO_ACTORS_JSON contains an unrecognized role key.');
    }
    if (typeof subjectId !== 'string' || !subjectId.trim()) {
      throw new Error('DEMO_ACTORS_JSON values must be non-empty subject ID strings.');
    }
    assignments[key as DemoActorKey] = subjectId.trim();
  }
  return assignments;
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'Synthetic demo seed failed.');
  process.exitCode = 1;
});
