import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { getTableConfig, PgDialect } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';

import { grantScopes, hotelApplicationVersions, hotelBureauCases } from './schema';

const migration = readFileSync(
  resolve(process.cwd(), 'drizzle/0005_hotel_versioned_directory.sql'),
  'utf8',
);
const snapshot = JSON.parse(
  readFileSync(resolve(process.cwd(), 'drizzle/meta/0005_snapshot.json'), 'utf8'),
);
const previous = JSON.parse(
  readFileSync(resolve(process.cwd(), 'drizzle/meta/0004_snapshot.json'), 'utf8'),
);

describe('additive versioned hotel directory migration', () => {
  it('preserves shared geography, registry, organizations and prior immutable history', () => {
    expect(snapshot.prevId).toBe(previous.id);
    for (const name of [
      'administrative_units',
      'administrative_unit_paths',
      'organizations',
      'registry_resources',
      'hotel_applications',
      'hotel_bureau_decisions',
      'hotel_admission_decisions',
    ]) {
      expect(snapshot.tables[`public.${name}`]).toEqual(previous.tables[`public.${name}`]);
    }
    expect(migration).not.toMatch(
      /DROP\s+(?:TABLE|TRIGGER)|CREATE\s+OR\s+REPLACE|UPDATE\s+(?:"?hotel_application_versions|"?user_profiles)/i,
    );
    expect(migration).toContain('CREATE TRIGGER hotel_case_release_assignment_guard');
    expect(migration).toContain('BEFORE INSERT OR UPDATE ON hotel_bureau_cases');
  });

  it('adds nullable release bindings without inventing legacy provenance', () => {
    for (const name of [
      'geography_release_id',
      'location_revision_id',
      'submitted_location_snapshot',
      'routing_release_id',
      'routing_rule_id',
      'resolved_scope_unit_id',
    ]) {
      expect(snapshot.tables['public.hotel_application_versions'].columns[name]).toMatchObject({
        notNull: false,
      });
      expect(
        snapshot.tables['public.hotel_application_versions'].columns[name].default,
      ).toBeUndefined();
    }
    expect(migration).not.toMatch(/UPDATE\s+hotel_(?:application_versions|bureau_cases)\s+SET/i);
    expect(migration).toContain('new hotel submissions require a versioned location selection');
  });

  it('represents release constraints consistently in schema, migration and metadata', () => {
    const dialect = new PgDialect();
    for (const table of [grantScopes, hotelApplicationVersions, hotelBureauCases]) {
      const config = getTableConfig(table);
      for (const constraint of config.checks.filter((item) =>
        /release_assignment|exactly_one_geography|routing_complete/.test(item.name),
      )) {
        const expression = dialect.sqlToQuery(constraint.value).sql;
        expect(
          snapshot.tables[`public.${config.name}`].checkConstraints[constraint.name].value,
        ).toBe(expression);
        expect(migration).toContain(`ADD CONSTRAINT "${constraint.name}" CHECK (${expression})`);
      }
    }
  });

  it('installs referenced unique indexes before composite foreign keys', () => {
    for (const [indexName, constraint] of [
      ['hotel_routing_releases_pair_uq', 'hotel_active_release_pair_compatible_fk'],
      ['hotel_geography_unit_revisions_release_unit_uq', 'grant_scopes_hotel_geography_unit_fk'],
      [
        'hotel_application_versions_release_assignment_uq',
        'hotel_bureau_cases_release_assignment_fk',
      ],
    ]) {
      expect(migration.indexOf(`CREATE UNIQUE INDEX "${indexName}"`)).toBeGreaterThan(-1);
      expect(migration.indexOf(`CREATE UNIQUE INDEX "${indexName}"`)).toBeLessThan(
        migration.indexOf(`ADD CONSTRAINT "${constraint}"`),
      );
    }
  });
});
