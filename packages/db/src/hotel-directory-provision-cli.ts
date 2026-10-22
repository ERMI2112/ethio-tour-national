import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { createDatabase } from './client';
import { resolveDisposableMigrationTarget } from './disposable-database-target';
import {
  HotelReviewScopeProvisioningError,
  provisionSyntheticHotelReleasePair,
  provisionSyntheticHotelRoutingRelease,
  provisionSyntheticHotelReviewScope,
  type SyntheticHotelReviewScopeInput,
  type SyntheticHotelReleasePairImport,
} from './provision-hotel-location-directory';
import { demoActorKeys, type DemoActorKey } from './demo-seed';
import { provisionSyntheticHotelDirectoryDemo } from './synthetic-hotel-directory-demo';

async function main(): Promise<void> {
  // Never load a repository environment file or use the ordinary DATABASE_URL.
  const resolution = resolveDisposableMigrationTarget(process.env);
  if (!resolution.ok) throw new Error(resolution.reason);
  const { client } = createDatabase(resolution.target.url);
  try {
    if (process.argv[2] === '--demo') {
      const issuer = process.env.DEMO_ISSUER;
      if (!issuer) throw new Error('A canonical synthetic DEMO_ISSUER is required.');
      const subjects: unknown = JSON.parse(process.env.DEMO_ACTORS_JSON ?? '{}');
      if (
        !subjects ||
        typeof subjects !== 'object' ||
        Array.isArray(subjects) ||
        Object.entries(subjects).some(
          ([key, value]) =>
            !demoActorKeys.includes(key as DemoActorKey) ||
            typeof value !== 'string' ||
            !value.trim(),
        )
      ) {
        throw new Error('Synthetic actor bindings are invalid.');
      }
      await provisionSyntheticHotelDirectoryDemo(
        client,
        issuer,
        subjects as Partial<Record<DemoActorKey, string>>,
        process.env,
      );
    } else if (process.argv[2] === '--review-scope') {
      const inputPath = process.argv[3];
      if (!inputPath)
        throw new Error('Supply an explicit synthetic review-scope JSON fixture path.');
      const input = JSON.parse(
        await readFile(resolve(inputPath), 'utf8'),
      ) as SyntheticHotelReviewScopeInput;
      await provisionSyntheticHotelReviewScope(client, input, process.env);
    } else if (process.argv[2] === '--routing-only') {
      const inputPath = process.argv[3];
      if (!inputPath) throw new Error('Supply a synthetic routing-release JSON fixture path.');
      const input = JSON.parse(
        await readFile(resolve(inputPath), 'utf8'),
      ) as SyntheticHotelReleasePairImport['routing'];
      await provisionSyntheticHotelRoutingRelease(client, input, process.env);
    } else {
      const inputPath = process.argv[2];
      if (!inputPath) throw new Error('Supply a synthetic release-pair JSON fixture path.');
      const input = JSON.parse(
        await readFile(resolve(inputPath), 'utf8'),
      ) as SyntheticHotelReleasePairImport;
      await provisionSyntheticHotelReleasePair(client, input, process.env);
    }
    console.info(
      process.argv[2] === '--review-scope'
        ? 'Explicit synthetic hotel review scope provisioned; identical authority was not duplicated.'
        : 'Synthetic hotel geography/routing release pair validated and activated.',
    );
  } finally {
    await client.end({ timeout: 5 });
  }
}

main().catch((error: unknown) => {
  console.error(
    error instanceof HotelReviewScopeProvisioningError
      ? error.message
      : 'Synthetic directory provisioning failed. Inspect the task environment before retrying.',
  );
  process.exitCode = 1;
});
