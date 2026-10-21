import type { HotelGeographyUnitInput, HotelRoutingRuleInput } from './hotel-location-directory';
import type { SyntheticHotelReleasePairImport } from './provision-hotel-location-directory';

export const SYNTHETIC_HOTEL_GEOGRAPHY_RELEASE_ID = 'synthetic-hotel-geography-v1';
export const SYNTHETIC_HOTEL_ROUTING_RELEASE_ID = 'synthetic-hotel-routing-v1';

export const syntheticHotelGeographyUnits: readonly HotelGeographyUnitInput[] = [
  unit(
    'demo-geo-root',
    '00000000-0000-4000-8000-000000000001',
    'demo-domain',
    null,
    'Synthetic Demo Domain',
  ),
  unit(
    'demo-geo-area-a',
    '00000000-0000-4000-8000-000000000002',
    'demo-area',
    'demo-geo-root',
    'Synthetic Area A',
  ),
  unit(
    'demo-geo-zone-a',
    '00000000-0000-4000-8000-000000000003',
    'demo-zone',
    'demo-geo-area-a',
    'Synthetic Zone A1',
  ),
  unit(
    'demo-unit-woreda-gondar',
    '00000000-0000-4000-8000-000000000004',
    'demo-hotel-location',
    'demo-geo-zone-a',
    'Synthetic Gondar Demo Woreda',
    [
      { value: 'Gondar pilot alias A', languageTag: 'en', script: 'Latn', kind: 'alias' },
      { value: 'demo-ሀ', languageTag: 'am', script: 'Ethi', kind: 'alias' },
    ],
    [{ sourceNamespace: 'synthetic-fixture-a', sourceIdentifier: 'unit-001' }],
  ),
  unit(
    'demo-unit-kebele-gondar',
    '00000000-0000-4000-8000-000000000005',
    'demo-subunit',
    'demo-unit-woreda-gondar',
    'Synthetic Gondar Subunit',
  ),
  unit(
    'demo-unit-central-a',
    '00000000-0000-4000-8000-000000000006',
    'demo-locality',
    'demo-unit-kebele-gondar',
    'Central',
  ),
  unit(
    'demo-geo-area-b',
    '00000000-0000-4000-8000-000000000007',
    'demo-area',
    'demo-geo-root',
    'Synthetic Area B',
  ),
  unit(
    'demo-geo-city-b',
    '00000000-0000-4000-8000-000000000008',
    'demo-city-administration',
    'demo-geo-area-b',
    'Synthetic City B',
  ),
  unit(
    'demo-unit-woreda-lalibela',
    '00000000-0000-4000-8000-000000000009',
    'demo-hotel-location',
    'demo-geo-city-b',
    'Synthetic Lalibela Demo Woreda',
    [{ value: 'Lalibela pilot alias B', languageTag: 'en', script: 'Latn', kind: 'alias' }],
    [{ sourceNamespace: 'synthetic-fixture-b', sourceIdentifier: 'unit-001' }],
  ),
  unit(
    'demo-unit-kebele-lalibela',
    '00000000-0000-4000-8000-000000000010',
    'demo-subunit',
    'demo-unit-woreda-lalibela',
    'Synthetic Lalibela Subunit',
  ),
  unit(
    'demo-unit-central-b',
    '00000000-0000-4000-8000-000000000011',
    'demo-locality',
    'demo-unit-kebele-lalibela',
    'Central',
  ),
];

export const syntheticHotelRoutingRules: readonly HotelRoutingRuleInput[] = [
  {
    id: '00000000-0000-4000-8000-000000000101',
    matchUnitId: 'demo-unit-woreda-gondar',
    matchMode: 'exact',
    organizationId: 'demo-org-hotel-bureau',
    scopeUnitId: 'demo-geo-area-a',
    enabled: true,
  },
  {
    id: '00000000-0000-4000-8000-000000000102',
    matchUnitId: 'demo-unit-woreda-lalibela',
    matchMode: 'exact',
    organizationId: 'demo-org-hotel-bureau-b',
    scopeUnitId: 'demo-geo-area-b',
    enabled: true,
  },
];

export const syntheticHotelReleasePairImport: SyntheticHotelReleasePairImport = {
  geography: {
    id: SYNTHETIC_HOTEL_GEOGRAPHY_RELEASE_ID,
    sourceName: 'EthioTour synthetic directory fixture',
    sourceEdition: 'synthetic-fixture-v1',
    sourceReference: 'repository:packages/db/src/synthetic-hotel-location-fixture.ts',
    synthetic: true,
    units: syntheticHotelGeographyUnits,
  },
  routing: {
    id: SYNTHETIC_HOTEL_ROUTING_RELEASE_ID,
    geographyReleaseId: SYNTHETIC_HOTEL_GEOGRAPHY_RELEASE_ID,
    sourceName: 'EthioTour synthetic routing fixture',
    sourceEdition: 'synthetic-routing-v1',
    provenance: 'Synthetic software fixture only; no institutional jurisdiction claim.',
    synthetic: true,
    rules: syntheticHotelRoutingRules,
  },
};

function unit(
  unitId: string,
  revisionId: string,
  unitType: string,
  parentUnitId: string | null,
  displayName: string,
  aliases: HotelGeographyUnitInput['names'] = [],
  externalIdentifiers: HotelGeographyUnitInput['externalIdentifiers'] = [],
): HotelGeographyUnitInput {
  return {
    unitId,
    revisionId,
    unitType,
    parentUnitId,
    names: [{ value: displayName, languageTag: 'en', script: 'Latn', kind: 'display' }, ...aliases],
    externalIdentifiers,
  };
}
