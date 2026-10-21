import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  resolve(process.cwd(), 'drizzle/0004_hotel_case_assignment_immutable.sql'),
  'utf8',
);
const snapshot = JSON.parse(
  readFileSync(resolve(process.cwd(), 'drizzle/meta/0004_snapshot.json'), 'utf8'),
);
const previousSnapshot = JSON.parse(
  readFileSync(resolve(process.cwd(), 'drizzle/meta/0003_snapshot.json'), 'utf8'),
);
const journal = JSON.parse(
  readFileSync(resolve(process.cwd(), 'drizzle/meta/_journal.json'), 'utf8'),
);

describe('hotel Bureau case assignment migration', () => {
  it('adds a guard for changing the immutable case and version binding', () => {
    expect(migration).toContain('CREATE TRIGGER hotel_bureau_case_binding_immutable');
    expect(migration).toContain(
      'BEFORE UPDATE OF application_id, application_version_id, bureau_organization_id, scope_unit_id',
    );
    expect(migration).toContain("RAISE EXCEPTION 'hotel Bureau case assignment is immutable'");
    expect(migration).toContain('IS DISTINCT FROM');
    expect(migration).not.toMatch(
      /\b(?:DELETE|TRUNCATE|ALTER TABLE\s+hotel_application_versions)\b/i,
    );
  });

  it('adds the migration after 0003 without changing the represented schema or prior history', () => {
    expect(snapshot.prevId).toBe(previousSnapshot.id);
    expect(snapshot.tables).toEqual(previousSnapshot.tables);
    expect(journal.entries.find((entry: { idx: number }) => entry.idx === 4)).toEqual(
      expect.objectContaining({ idx: 4, tag: '0004_hotel_case_assignment_immutable' }),
    );
  });
});
