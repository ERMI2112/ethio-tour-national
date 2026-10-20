import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(resolve(process.cwd(), 'drizzle/0002_normal_ronan.sql'), 'utf8');
const contracts = readFileSync(resolve(process.cwd(), '../contracts/src/index.ts'), 'utf8');

describe('hotel pilot additive migration', () => {
  it('creates private versioned workflow tables without deleting or rewriting existing records', () => {
    expect(migration).toContain('CREATE TABLE "hotel_applications"');
    expect(migration).toContain('CREATE TABLE "hotel_application_versions"');
    expect(migration).toContain('CREATE TABLE "hotel_bureau_cases"');
    expect(migration).toContain('CREATE TABLE "hotel_bureau_decisions"');
    expect(migration).toContain('CREATE TABLE "hotel_admission_decisions"');
    expect(migration).toContain('ALTER TABLE "organizations" ALTER COLUMN "level" DROP NOT NULL');
    expect(migration).toContain(
      'ADD COLUMN "organization_type" text DEFAULT \'administrative\' NOT NULL',
    );
    expect(migration).toMatch(
      /"hotel_applications_synthetic_check" CHECK \("hotel_applications"\."is_synthetic" = true\)/,
    );
    expect(migration).not.toMatch(
      /\b(DROP TABLE|TRUNCATE\s+TABLE|DELETE FROM|UPDATE user_profiles|UPDATE memberships)\b/i,
    );
    expect(migration).toContain('hotel application history is immutable');
  });

  it('keeps persisted application and Bureau-case statuses aligned with shared contracts', () => {
    expect(migrationStatuses('hotel_applications_status_check')).toEqual(
      contractStatuses('HOTEL_APPLICATION_STATUSES'),
    );
    expect(migrationStatuses('hotel_bureau_cases_status_check')).toEqual(
      contractStatuses('HOTEL_BUREAU_CASE_STATUSES').sort(),
    );
    expect(migration).toContain('"status" text DEFAULT \'in_review\' NOT NULL');
  });
});

function migrationStatuses(constraintName: string): string[] {
  const match = migration.match(
    new RegExp(`CONSTRAINT "${constraintName}" CHECK \\([^\\n]*?\\."status" in \\(([^)]*)\\)`),
  );
  if (!match) throw new Error(`Migration constraint ${constraintName} was not found.`);
  const source = match[1];
  if (source === undefined)
    throw new Error(`Migration constraint ${constraintName} had no values.`);
  return capturedStatuses(source);
}

function contractStatuses(constantName: string): string[] {
  const match = contracts.match(
    new RegExp(`export const ${constantName} = \\[([\\s\\S]*?)\\] as const`),
  );
  if (!match) throw new Error(`Contract status list ${constantName} was not found.`);
  const source = match[1];
  if (source === undefined) throw new Error(`Contract status list ${constantName} had no values.`);
  return capturedStatuses(source);
}

function capturedStatuses(source: string): string[] {
  const statuses: string[] = [];
  for (const entry of source.matchAll(/'([^']+)'/g)) {
    const status = entry[1];
    if (!status) throw new Error('A status list entry was empty.');
    statuses.push(status);
  }
  return statuses.sort();
}
