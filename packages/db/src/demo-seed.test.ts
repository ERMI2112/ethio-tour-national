import { describe, expect, it, vi } from 'vitest';

import type { DatabaseClient } from './client';
import { demoActorKeys, seedSyntheticRegistryDemo } from './demo-seed';

describe('synthetic registry role map', () => {
  it('provides distinct editor, reviewer and publisher actor slots at each demo level and area', () => {
    const scopes = [
      'federal',
      'regional-a',
      'regional-b',
      'woreda-gondar',
      'woreda-lalibela',
      'kebele-gondar',
      'kebele-lalibela',
    ];
    const roles = ['editor', 'reviewer', 'publisher'];

    expect(demoActorKeys).toHaveLength(scopes.length * roles.length + 3);
    for (const scope of scopes) {
      for (const role of roles) expect(demoActorKeys).toContain(`${scope}.${role}`);
    }
    expect(demoActorKeys).toContain('hotel-bureau.reviewer');
    expect(demoActorKeys).toContain('hotel-bureau-b.reviewer');
    expect(demoActorKeys).toContain('platform.hotel-admin');
  });
});

const gondar = 'demo-unit-woreda-gondar';
const lalibela = 'demo-unit-woreda-lalibela';
const officeA = 'demo-org-hotel-bureau';
const officeB = 'demo-org-hotel-bureau-b';
const issuer = 'https://identity.example.test/demo';
const actors = {
  'hotel-bureau.reviewer': 'synthetic-reviewer-a',
  'hotel-bureau-b.reviewer': 'synthetic-reviewer-b',
  'platform.hotel-admin': 'synthetic-admin',
} as const;

describe('synthetic hotel multi-office seed without services', () => {
  it('creates two synthetic choices and separate offices, preserving A federal scope', async () => {
    const db = seedHarness();
    expect(await seedSyntheticRegistryDemo(db.client, issuer, actors)).toBe(3);
    expect(db.rows('hotel_locations')).toEqual([
      { administrative_unit_id: gondar, enabled: true },
      { administrative_unit_id: lalibela, enabled: true },
    ]);
    expect(db.rows('hotel_location_routes')).toEqual([
      expect.objectContaining({
        location_unit_id: gondar,
        bureau_organization_id: officeA,
        enabled: true,
      }),
      expect.objectContaining({
        location_unit_id: lalibela,
        bureau_organization_id: officeB,
        enabled: true,
      }),
    ]);
    for (const id of [gondar, lalibela]) {
      expect(db.rows('administrative_units').find((row) => row.id === id)).toEqual(
        expect.objectContaining({
          display_name: expect.stringContaining('Synthetic'),
          is_synthetic: true,
        }),
      );
    }
    for (const [office, scope] of [
      [officeA, 'demo-unit-federal'],
      [officeB, 'demo-unit-region-b'],
    ]) {
      const grants = db.rows('access_grants').filter((row) => row.organization_id === office);
      expect(grants.map((row) => row.capability)).toEqual([
        'hotel:application:bureau:read',
        'hotel:application:bureau:decide',
      ]);
      for (const grant of grants) {
        expect(db.rows('grant_scopes').filter((row) => row.grant_id === grant.id)).toEqual([
          expect.objectContaining({ administrative_unit_id: scope, include_descendants: true }),
        ]);
      }
    }
    expect(db.rows('organizations').find((row) => row.id === officeA)?.level).toBe('federal');
    expect(db.rows('organizations').find((row) => row.id === officeB)?.level).toBe('regional');
  });

  it('reuses rows unchanged on rerun and serializes route initialization', async () => {
    const db = seedHarness();
    await seedSyntheticRegistryDemo(db.client, issuer, actors);
    const before = structuredClone([...db.tables]);
    await seedSyntheticRegistryDemo(db.client, issuer, actors);
    expect([...db.tables]).toEqual(before);
    expect(
      db.unsafe.mock.calls.filter(([query]) => /INSERT INTO hotel_location_routes/.test(query)),
    ).toHaveLength(2);
    expect(db.unsafe).toHaveBeenCalledWith(
      'LOCK TABLE hotel_locations, hotel_location_routes IN SHARE ROW EXCLUSIVE MODE',
    );
    expect(db.unsafe.mock.calls.some(([query]) => /\bUPDATE\b/.test(query))).toBe(false);
  });

  it.each([
    'duplicate-same-office',
    'duplicate-other-office',
    'mismatch',
    'inactive-route',
    'inactive-location',
  ])('fails closed without repairing existing %s', async (conflict) => {
    const db = seedHarness();
    await seedSyntheticRegistryDemo(db.client, issuer);
    const route = db.rows('hotel_location_routes')[0]!;
    if (conflict.startsWith('duplicate')) {
      db.rows('hotel_location_routes').push({
        ...route,
        id: 'other-route',
        bureau_organization_id: conflict === 'duplicate-same-office' ? officeA : officeB,
      });
    } else if (conflict === 'mismatch') route.bureau_organization_id = officeB;
    else if (conflict === 'inactive-route') route.enabled = false;
    else db.rows('hotel_locations')[0]!.enabled = false;
    const before = structuredClone([...db.tables]);
    await expect(seedSyntheticRegistryDemo(db.client, issuer)).rejects.toThrow(
      /hotel (route|location)/,
    );
    expect([...db.tables]).toEqual(before);
  });

  it.each(['user_profiles', 'memberships', 'access_grants'])(
    'rejects an inactive existing %s without reactivation',
    async (table) => {
      const db = seedHarness();
      await seedSyntheticRegistryDemo(db.client, issuer, actors);
      db.rows(table)[0]!.active = false;
      const before = structuredClone([...db.tables]);
      await expect(seedSyntheticRegistryDemo(db.client, issuer, actors)).rejects.toThrow(
        /inactive|grant conflicts/,
      );
      expect([...db.tables]).toEqual(before);
    },
  );

  it('rejects existing mismatched grant scopes instead of reassigning them', async () => {
    const db = seedHarness();
    await seedSyntheticRegistryDemo(db.client, issuer, actors);
    db.rows('grant_scopes')[0]!.administrative_unit_id = 'demo-unit-region-a';
    await expect(seedSyntheticRegistryDemo(db.client, issuer, actors)).rejects.toThrow(
      'unexpected geographic scope',
    );
  });

  it('does not mark existing profiles verified or assign actors unless requested', async () => {
    const db = seedHarness();
    db.rows('user_profiles').push({
      id: 'legacy',
      active: true,
      verification_status: 'unverified',
    });
    await seedSyntheticRegistryDemo(db.client, issuer);
    expect(db.rows('user_profiles')).toEqual([
      { id: 'legacy', active: true, verification_status: 'unverified' },
    ]);
    expect(db.rows('memberships')).toEqual([]);
    expect(db.rows('access_grants')).toEqual([]);
  });

  it('requires distinct hotel reviewer and administrator subjects before writing', async () => {
    const db = seedHarness();
    await expect(
      seedSyntheticRegistryDemo(db.client, issuer, {
        ...actors,
        'hotel-bureau-b.reviewer': actors['hotel-bureau.reviewer'],
      }),
    ).rejects.toThrow('distinct actors');
    expect(db.unsafe).not.toHaveBeenCalled();
  });
});

type Row = Record<string, unknown>;

// In-memory transaction double: exercises seed control flow without opening a database.
function seedHarness() {
  const tables = new Map<string, Row[]>();
  const keys: Record<string, string[]> = {
    administrative_units: ['id'],
    administrative_unit_paths: ['ancestor_unit_id', 'descendant_unit_id'],
    organizations: ['id'],
    hotel_locations: ['administrative_unit_id'],
    user_profiles: ['external_issuer', 'external_subject_id'],
    memberships: ['user_profile_id', 'organization_id'],
    access_grants: ['membership_id', 'capability', 'organization_id'],
    grant_scopes: ['grant_id', 'administrative_unit_id'],
  };
  function rows(table: string): Row[] {
    if (!tables.has(table)) tables.set(table, []);
    return tables.get(table)!;
  }
  let nextId = 0;
  const unsafe = vi.fn(async (query: string, args: unknown[] = []): Promise<Row[]> => {
    const sql = query.replace(/\s+/g, ' ').trim();
    if (sql.startsWith('LOCK TABLE ')) return [];
    const insert = sql.match(/^INSERT INTO (\w+) \(([^)]+)\) VALUES \(([^)]+)\)/);
    if (insert) {
      const [, table, columnList, valueList] = insert as [string, string, string, string];
      const values = valueList.split(',').map((value) => {
        const token = value.trim();
        if (token.startsWith('$')) return args[Number(token.slice(1)) - 1];
        if (token === 'true') return true;
        if (token === 'false') return false;
        throw new Error(`Unsupported seed SQL value: ${token}`);
      });
      const row = Object.fromEntries(
        columnList.split(',').map((column, index) => [column.trim(), values[index]]),
      );
      if (
        sql.includes('ON CONFLICT') &&
        rows(table).some((stored) => keys[table]?.every((key) => stored[key] === row[key]))
      )
        return [];
      if (
        [
          'user_profiles',
          'memberships',
          'access_grants',
          'grant_scopes',
          'hotel_location_routes',
        ].includes(table)
      )
        row.id = `generated-${++nextId}`;
      if (['user_profiles', 'memberships'].includes(table)) row.active = true;
      rows(table).push(row);
      return sql.includes('RETURNING') ? [row] : [];
    }
    const select = sql.match(/^SELECT .* FROM (\w+) WHERE (.*)$/);
    if (select) {
      const conditions = [...select[2]!.matchAll(/(\w+) (=|<>) \$(\d+)/g)];
      if (!conditions.length) throw new Error(`Unsupported seed SQL: ${sql}`);
      return rows(select[1]!).filter((row) =>
        conditions.every(([, column, operator, parameter]) =>
          operator === '='
            ? row[column!] === args[Number(parameter) - 1]
            : row[column!] !== args[Number(parameter) - 1],
        ),
      );
    }
    throw new Error(`Unsupported seed SQL: ${sql}`);
  });
  const client = {
    begin: async (run: (tx: { unsafe: typeof unsafe }) => Promise<void>) => {
      const before = structuredClone([...tables]);
      try {
        await run({ unsafe });
      } catch (error) {
        tables.clear();
        for (const [table, data] of before) tables.set(table, data);
        throw error;
      }
    },
  } as unknown as DatabaseClient;
  return { client, tables, rows, unsafe };
}
