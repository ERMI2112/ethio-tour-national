import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PgDialect, getTableConfig } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';

import { hotelApplicationVersions, hotelLocationRoutes, hotelLocations } from './schema';

const migration = readFileSync(
  resolve(process.cwd(), 'drizzle/0003_hotel_multi_office.sql'),
  'utf8',
);
const snapshot = JSON.parse(
  readFileSync(resolve(process.cwd(), 'drizzle/meta/0003_snapshot.json'), 'utf8'),
);
const oldSnapshot = JSON.parse(
  readFileSync(resolve(process.cwd(), 'drizzle/meta/0002_snapshot.json'), 'utf8'),
);

describe('hotel multi-office additive migration without services', () => {
  it('preserves 0002 content across checkout line endings and never replaces whole-row history guards', () => {
    const original = readFileSync(
      resolve(process.cwd(), 'drizzle/0002_normal_ronan.sql'),
      'utf8',
    ).replace(/\r\n/g, '\n');
    expect(createHash('sha256').update(original).digest('hex')).toBe(
      '6dc65a8cabf84575b509d4100f4b4e04390a40a45e8b53216d577e1678648c3e',
    );
    expect(original).toContain('BEFORE UPDATE OR DELETE ON hotel_application_versions');
    expect(original).toContain('BEFORE TRUNCATE ON hotel_application_versions');
    expect(migration).not.toMatch(
      /\b(DROP|UPDATE|DELETE|TRUNCATE|TRIGGER|FUNCTION)\b(?! no action)/i,
    );
    // Foreign-key ON UPDATE is declarative and must not be confused with a data rewrite.
  });

  it('adds nullable metadata without defaults or a legacy data backfill', () => {
    for (const [column, type] of [
      ['location_unit_id', 'text'],
      ['location_snapshot', 'jsonb'],
      ['bureau_organization_id', 'text'],
      ['scope_unit_id', 'text'],
    ] as const) {
      expect(migration).toContain(`ADD COLUMN "${column}" ${type};`);
      expect(snapshot.tables['public.hotel_application_versions'].columns[column]).toEqual(
        expect.objectContaining({ type, notNull: false }),
      );
    }
    expect(migration).not.toMatch(
      /\b(?:UPDATE\s+"?hotel_application_versions|INSERT INTO|ALTER COLUMN|SET NOT NULL|SET DEFAULT)\b/i,
    );
    const oldColumns = oldSnapshot.tables['public.hotel_application_versions'].columns;
    for (const [name, column] of Object.entries(oldColumns)) {
      expect(snapshot.tables['public.hotel_application_versions'].columns[name]).toEqual(column);
    }
    expect(snapshot.prevId).toBe(oldSnapshot.id);
  });

  it('keeps all metadata null for legacy versions or requires a complete consistent tuple', () => {
    const config = getTableConfig(hotelApplicationVersions);
    const dialect = new PgDialect();
    for (const constraint of config.checks.filter((check) => check.name.includes('routing_'))) {
      // Historical migrations are compared with their own snapshot; later additive
      // migrations may broaden a constraint without rewriting the original file.
      const expression =
        snapshot.tables['public.hotel_application_versions'].checkConstraints[constraint.name]
          .value;
      expect(migration).toContain(`ADD CONSTRAINT "${constraint.name}" CHECK (${expression})`);
      expect(
        snapshot.tables['public.hotel_application_versions'].checkConstraints[constraint.name]
          .value,
      ).toBe(expression);
    }
    const complete = config.checks.find((check) => check.name.endsWith('routing_complete_check'))!;
    const completeSql = dialect.sqlToQuery(complete.value).sql;
    for (const column of [
      'location_unit_id',
      'location_snapshot',
      'bureau_organization_id',
      'scope_unit_id',
    ]) {
      expect(completeSql).toContain(`"${column}" is null`);
      expect(completeSql).toContain(`"${column}" is not null`);
    }
    const consistency = dialect.sqlToQuery(
      config.checks.find((check) => check.name.endsWith('routing_consistency_check'))!.value,
    ).sql;
    expect(consistency).toContain(
      '"scope_unit_id" = "hotel_application_versions"."location_unit_id"',
    );
    expect(consistency).toContain(
      'jsonb_typeof("hotel_application_versions"."location_snapshot") = \'object\'',
    );
    // IS TRUE rejects missing/JSON-null IDs rather than letting SQL UNKNOWN pass a CHECK.
    expect(consistency).toContain(
      '"location_snapshot"->>\'id\' = "hotel_application_versions"."location_unit_id") is true',
    );
    expect(consistency).toContain(
      '"content"->>\'administrativeUnitId\' = "hotel_application_versions"."location_unit_id") is true',
    );
  });

  it('uses foreign keys and permits duplicate enabled routes with a nonunique lookup index', () => {
    const routes = getTableConfig(hotelLocationRoutes);
    const locations = getTableConfig(hotelLocations);
    expect(
      locations.columns.find((column) => column.name === 'administrative_unit_id')?.primary,
    ).toBe(true);
    expect(
      locations.foreignKeys.map((key) => getTableConfig(key.reference().foreignTable).name),
    ).toEqual(['administrative_units']);
    expect(
      routes.foreignKeys.map((key) => getTableConfig(key.reference().foreignTable).name),
    ).toEqual(['hotel_locations', 'organizations']);
    expect(routes.indexes).toHaveLength(1);
    expect(routes.indexes[0]?.config.unique).toBe(false);
    expect(routes.uniqueConstraints).toHaveLength(0);
    expect(migration).not.toMatch(/CREATE UNIQUE INDEX|UNIQUE\s*\(/i);
    for (const config of [locations, routes]) {
      expect(config.columns.find((column) => column.name === 'enabled')).toEqual(
        expect.objectContaining({ notNull: true, default: true }),
      );
    }
  });
});
