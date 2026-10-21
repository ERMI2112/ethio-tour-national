import { describe, expect, it } from 'vitest';

import {
  resolveHotelRouteCandidates,
  validateHotelGeographyImport,
  validateHotelRoutingRules,
  type HotelGeographyUnitInput,
  type HotelRoutingRuleInput,
} from './hotel-location-directory';

const units: HotelGeographyUnitInput[] = [
  {
    unitId: 'root',
    revisionId: 'root-revision',
    unitType: 'synthetic-root',
    parentUnitId: null,
    names: [{ value: 'Synthetic root', languageTag: 'en', script: 'Latn', kind: 'display' }],
  },
  {
    unitId: 'long-path-area',
    revisionId: 'long-path-revision',
    unitType: 'synthetic-area',
    parentUnitId: 'root',
    names: [{ value: 'Central', languageTag: 'en', script: 'Latn', kind: 'display' }],
  },
  {
    unitId: 'long-path-place',
    revisionId: 'long-place-revision',
    unitType: 'synthetic-locality',
    parentUnitId: 'long-path-area',
    names: [
      { value: 'Central', languageTag: 'en', script: 'Latn', kind: 'display' },
      { value: 'demo-ሀ', languageTag: 'und', script: 'Ethi', kind: 'alias' },
    ],
    externalIdentifiers: [
      { sourceNamespace: 'synthetic-a', sourceIdentifier: 'unit-1' },
      { sourceNamespace: 'synthetic-b', sourceIdentifier: 'unit-1' },
    ],
  },
];

describe('versioned hotel location import validation', () => {
  it('accepts variable-depth hierarchies, duplicate display names and namespaced identifiers', () => {
    expect(validateHotelGeographyImport('release-a', units)).toMatchObject({
      valid: true,
      errors: [],
      warnings: ['Duplicate display labels exist and require hierarchy disambiguation.'],
    });
  });

  it.each([
    ['missing parent', { ...units[2]!, parentUnitId: 'missing' }, 'references a missing parent'],
    ['cycle', { ...units[1]!, parentUnitId: 'long-path-place' }, 'contains a cycle'],
    ['release mismatch', { ...units[0]!, releaseId: 'release-b' }, 'different geography release'],
    ['empty display name', { ...units[0]!, names: [] }, 'has no display name'],
    [
      'duplicate identifier in one source namespace',
      {
        ...units[2]!,
        externalIdentifiers: [
          { sourceNamespace: 'one-source', sourceIdentifier: 'id-1' },
          { sourceNamespace: 'one-source', sourceIdentifier: 'id-1' },
        ],
      },
      'Duplicate external identifier',
    ],
  ])('rejects %s', (_case, replacement, message) => {
    const changed = units.map((unit) => (unit.unitId === replacement.unitId ? replacement : unit));
    const result = validateHotelGeographyImport('release-a', changed);
    expect(result.valid).toBe(false);
    expect(result.errors.join('\n')).toContain(message);
  });

  it('detects missing/ambiguous enabled routes and distinguishes exact from descendant rules', () => {
    const rules: HotelRoutingRuleInput[] = [
      {
        id: 'route-area',
        matchUnitId: 'long-path-area',
        matchMode: 'descendants',
        organizationId: 'synthetic-office-a',
        scopeUnitId: 'root',
        enabled: true,
      },
      {
        id: 'route-place',
        matchUnitId: 'long-path-place',
        matchMode: 'exact',
        organizationId: 'synthetic-office-b',
        scopeUnitId: 'root',
        enabled: true,
      },
    ];

    expect(validateHotelRoutingRules(units, rules).valid).toBe(true);
    expect(
      resolveHotelRouteCandidates(
        'long-path-place',
        ['root', 'long-path-area', 'long-path-place'],
        rules,
      ),
    ).toHaveLength(2);
    expect(resolveHotelRouteCandidates('root', ['root'], rules)).toHaveLength(0);
    expect(
      resolveHotelRouteCandidates(
        'long-path-place',
        ['root', 'long-path-area', 'long-path-place'],
        rules.slice(0, 1),
      ),
    ).toHaveLength(1);
    expect(validateHotelRoutingRules(units, [{ ...rules[0]!, matchUnitId: 'unknown' }]).valid).toBe(
      false,
    );
  });
});
