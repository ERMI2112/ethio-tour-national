export interface HotelGeographyNameInput {
  value: string;
  languageTag: string;
  script: string | null;
  kind: 'display' | 'alias';
}

export interface HotelGeographyExternalIdentifierInput {
  sourceNamespace: string;
  sourceIdentifier: string;
}

export interface HotelGeographyUnitInput {
  unitId: string;
  revisionId: string;
  unitType: string;
  parentUnitId: string | null;
  names: readonly HotelGeographyNameInput[];
  externalIdentifiers?: readonly HotelGeographyExternalIdentifierInput[];
  releaseId?: string;
}

export interface HotelRoutingRuleInput {
  id: string;
  matchUnitId: string;
  matchMode: 'exact' | 'descendants';
  organizationId: string;
  scopeUnitId: string;
  enabled: boolean;
}

export interface HotelDirectoryValidation {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export function validateHotelGeographyImport(
  releaseId: string,
  units: readonly HotelGeographyUnitInput[],
): HotelDirectoryValidation {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (!releaseId.trim()) errors.push('A geography release ID is required.');
  if (units.length === 0) errors.push('A geography release must contain at least one unit.');

  const byUnitId = new Map<string, HotelGeographyUnitInput>();
  const revisionIds = new Set<string>();
  const externalIdentifiers = new Set<string>();
  for (const unit of units) {
    if (!unit.unitId.trim() || byUnitId.has(unit.unitId)) {
      errors.push(`Duplicate or empty stable unit ID: ${unit.unitId || '(empty)'}.`);
    } else {
      byUnitId.set(unit.unitId, unit);
    }
    if (!unit.revisionId.trim() || revisionIds.has(unit.revisionId)) {
      errors.push(`Duplicate or empty unit revision ID: ${unit.revisionId || '(empty)'}.`);
    }
    revisionIds.add(unit.revisionId);
    if (unit.releaseId !== undefined && unit.releaseId !== releaseId) {
      errors.push(`Unit ${unit.unitId} belongs to a different geography release.`);
    }
    if (!unit.unitType.trim()) errors.push(`Unit ${unit.unitId} has no data-driven type.`);
    const displayNames = unit.names.filter((name) => name.kind === 'display');
    if (displayNames.length === 0) errors.push(`Unit ${unit.unitId} has no display name.`);
    for (const name of unit.names) {
      if (!name.value.trim()) errors.push(`Unit ${unit.unitId} has an empty name.`);
      if (!validLanguageTag(name.languageTag)) {
        errors.push(`Unit ${unit.unitId} has an invalid language tag.`);
      }
      if (name.script !== null && !/^[A-Z][a-z]{3}$/.test(name.script)) {
        errors.push(`Unit ${unit.unitId} has invalid script metadata.`);
      }
    }
    for (const identifier of unit.externalIdentifiers ?? []) {
      if (!identifier.sourceNamespace.trim() || !identifier.sourceIdentifier.trim()) {
        errors.push(`Unit ${unit.unitId} has an incomplete namespaced identifier.`);
        continue;
      }
      const key = `${identifier.sourceNamespace}\u0000${identifier.sourceIdentifier}`;
      if (externalIdentifiers.has(key)) {
        errors.push(`Duplicate external identifier in namespace ${identifier.sourceNamespace}.`);
      }
      externalIdentifiers.add(key);
    }
  }

  for (const unit of units) {
    if (unit.parentUnitId && !byUnitId.has(unit.parentUnitId)) {
      errors.push(`Unit ${unit.unitId} references a missing parent.`);
    }
    if (unit.parentUnitId === unit.unitId) errors.push(`Unit ${unit.unitId} is its own parent.`);
  }

  const visited = new Set<string>();
  const visiting = new Set<string>();
  const visit = (unitId: string): void => {
    if (visited.has(unitId)) return;
    if (visiting.has(unitId)) {
      errors.push(`The geography hierarchy contains a cycle at ${unitId}.`);
      return;
    }
    visiting.add(unitId);
    const parentId = byUnitId.get(unitId)?.parentUnitId;
    if (parentId && byUnitId.has(parentId)) visit(parentId);
    visiting.delete(unitId);
    visited.add(unitId);
  };
  for (const unit of units) visit(unit.unitId);

  // Duplicate labels are expected; the client disambiguates them with the full path.
  if (
    new Set(units.map((unit) => unit.names.find((name) => name.kind === 'display')?.value)).size <
    units.length
  ) {
    warnings.push('Duplicate display labels exist and require hierarchy disambiguation.');
  }
  return { valid: errors.length === 0, errors, warnings };
}

export function validateHotelRoutingRules(
  units: readonly HotelGeographyUnitInput[],
  rules: readonly HotelRoutingRuleInput[],
): HotelDirectoryValidation {
  const errors: string[] = [];
  const byUnitId = new Map(units.map((unit) => [unit.unitId, unit]));
  const seenRuleIds = new Set<string>();
  for (const rule of rules) {
    if (seenRuleIds.has(rule.id)) errors.push(`Duplicate routing rule ID: ${rule.id}.`);
    seenRuleIds.add(rule.id);
    if (!byUnitId.has(rule.matchUnitId) || !byUnitId.has(rule.scopeUnitId)) {
      errors.push(`Routing rule ${rule.id} references a unit outside its geography release.`);
      continue;
    }
    if (!rule.organizationId.trim())
      errors.push(`Routing rule ${rule.id} has no target organization.`);
    const path = pathToUnit(rule.matchUnitId, byUnitId);
    if (!path.includes(rule.scopeUnitId)) {
      errors.push(`Routing rule ${rule.id} scope does not contain its route match unit.`);
    }
  }
  return { valid: errors.length === 0, errors, warnings: [] };
}

export function resolveHotelRouteCandidates(
  selectedUnitId: string,
  rootToSelectedPath: readonly string[],
  rules: readonly HotelRoutingRuleInput[],
): HotelRoutingRuleInput[] {
  return rules.filter(
    (rule) =>
      rule.enabled &&
      (rule.matchMode === 'exact'
        ? rule.matchUnitId === selectedUnitId
        : rootToSelectedPath.includes(rule.matchUnitId)),
  );
}

function pathToUnit(unitId: string, units: ReadonlyMap<string, HotelGeographyUnitInput>): string[] {
  const path: string[] = [];
  const visited = new Set<string>();
  let current: string | null = unitId;
  while (current && !visited.has(current)) {
    visited.add(current);
    path.unshift(current);
    current = units.get(current)?.parentUnitId ?? null;
  }
  return path;
}

function validLanguageTag(value: string): boolean {
  if (!value.trim() || value.length > 35) return false;
  try {
    return Intl.getCanonicalLocales(value).length === 1;
  } catch {
    return false;
  }
}
