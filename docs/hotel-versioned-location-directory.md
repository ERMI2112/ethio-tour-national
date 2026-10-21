# Versioned Synthetic Hotel Location Directory

This is a bounded foundation for future coverage. The fixtures are synthetic,
their offices have no asserted government mandate, and production hotel decision
powers remain disabled. Public hotel listings, bookings, transfers, maps, real
boundary datasets and national downloads are outside this slice.

## Geography And Routing

The new `hotel_geography_*` namespace is separate from the shared legacy
`administrative_units` table. Registry content, existing organizations and their
four-level administrative model are preserved. Directory unit types are stored
as data; no fixed hierarchy depth or sequence is required.

A geography release carries source name/reference, source edition, optional
effective dates, synthetic status, validation outcome/report, validation time,
activation time and creation time. Unknown source/effective dates remain null.
Units have internal stable IDs and a revision in each release. Parent revisions,
names/aliases and external identifiers must belong to that same release. Names
carry language and script metadata. External identifiers are unique within
`(release, source namespace, source identifier)`; a source code is neither a
global ID nor automatic proof of continuity.

Cross-release continuity is explicitly recorded with relation, confidence and
provenance. Reusing an internal unit ID in another release requires an explicit
continuity record. Splits, merges, renames and possible successors never silently
replace a saved applicant selection or migrate authority. The synthetic Ethi
alias `demo-ሀ` is an artificial search fixture, not an official translation.

Routing releases refer to exactly one compatible geography release. Each rule
records a match unit, exact/descendant match mode, target organization, and scope
unit. The scope must contain the matched unit in that geography release. Active
geography and routing are selected through one singleton compatible-pair row.
Validated, activated release contents cannot be mutated or truncated. Routing
can be released independently against the same geography.

Validation rejects cycles, missing parents, duplicate stable/revision IDs,
duplicate source identifiers, invalid references and inconsistent release
membership. Duplicate names are valid: the API returns complete hierarchy paths
for disambiguation. Structural validation does not imply nationwide coverage or
that every location has a review route. Submission requires exactly one enabled
applicable rule; zero or overlapping rules fail closed without a fallback or
priority rule.

## Submission And Access

The draft stores the applicant's `locationSelection` from the protected search
API. Submission locks the active-pair row, resolves the selected immutable
revision and route, and writes a single application-version/case transaction.
The version records geography release, unit revision, full hierarchy snapshot,
routing release/rule, organization and scope. Database constraints and insertion
guards independently check compatibility, the hierarchy, the unique applicable
route and the case/version assignment. Migration 0004's original assignment
trigger and whole-version history protections remain installed.

Case coverage is evaluated against its own geography release, never today's
hierarchy. Each allow requires one current active grant with the capability,
active membership in the assigned office, and a release-specific geography
scope. Descendant coverage uses the immutable release hierarchy. Grants from a
new release do not automatically authorize an older case, nor do old grants
authorize a new release. Provision explicit scopes for each intended release.
Membership/profile/grant deactivation still denies access. Unknown and
inaccessible Bureau details and decisions return the same non-enumerating 404.

Applicant location responses contain no Bureau assignment, office, reviewer or
grant data. Authorized Bureau case responses include the assignment release
references. Administrator admission still requires approval of the current
submitted application version. Private admitted workspace access survives a new
draft/submission; its historical admission version is identified separately.
An older decision never approves a new location or version.

## Compatibility

Migration `0005_hotel_versioned_directory.sql` adds the new tables and nullable
version/case references. Migrations 0000 through 0004 are unchanged. No existing
record is assigned invented release provenance, location, verification or new
geography grants.

- New drafts use release/unit/revision references; new submissions require an
  active release selection. Legacy `administrativeUnitId` cannot create a new
  directory submission.
- Legacy private drafts remain readable/editable. Their current hierarchy is
  not reconstructed; the applicant must select and confirm a directory result.
- Legacy submitted snapshots remain readable as saved. If their version has a
  complete saved office/scope binding, Bureau access requires an exact-unit
  legacy grant. Descendant authority is denied because no immutable historical
  hierarchy exists. Incomplete legacy case bindings fail closed.
- Existing decisions/admissions/private memberships remain history. The owner
  workspace rule is unchanged. A correction creates a new version and case.
- Stale release selections remain in the private draft, but submission returns
  409 and requires a fresh search/confirmation. No successor is selected for the
  applicant. Search cursors from a retired active release also return 409.

## Guarded Local Provisioning

There is no release-administration HTTP API. Use a new disposable PostGIS target
under the [hotel test runbook](hotel-onboarding-test-runbook.md). The new CLI reads
only `HOTEL_PILOT_TEST_DATABASE_URL`, requires the existing loopback/test-name/port
guard and `HOTEL_PILOT_TEST_DISPOSABLE=true`, and never reads `.env`. Provisioning
also requires `NODE_ENV=test` or `development` and `REGISTRY_POLICY_MODE=demo`.
It rejects production mode and non-synthetic releases.

```powershell
pnpm db:migrate:hotel-test
pnpm --filter @ethio-tour/db db:provision:hotel-directory:test <synthetic-release-pair.json>
pnpm --filter @ethio-tour/db db:provision:hotel-directory:test --routing-only <synthetic-routing-release.json>
```

The JSON shape is `SyntheticHotelReleasePairImport` in
`packages/db/src/provision-hotel-location-directory.ts`. Validation runs before
writing, then a transaction locks activation, writes/activates immutable content,
switches the compatible pair and appends an activation audit event. Do not reuse
an existing release ID to overwrite it. New versions need new release IDs and
explicit continuity where an internal stable ID is reused.

For a **fresh disposable demo** only, supply process-only `DEMO_ISSUER` and
`DEMO_ACTORS_JSON` subjects from newly provisioned identities, then run:

```powershell
pnpm --filter @ethio-tour/db db:provision:hotel-directory:test --demo
```

This uses the established synthetic role seed, adds the fixture release pair,
and binds the two reviewers to release-specific scopes on their existing
synthetic grants. It checks canonical issuer/subject, active profile/membership,
office, capability and disabled production authority. No applicant gets Bureau
or provider authority. Demo provisioning is a sequence of explicit seed phases;
inspect a failed disposable setup before retrying. It is not a production import
or an automatic startup migration.

The fixture has different hierarchy shapes, duplicate `Central` names and stored
aliases. Only the two configured synthetic hotel locations have an exact route;
other selectable units demonstrate honest unavailable-routing behavior.

API details and limits are in [the shared contract](hotel-location-directory-api.md).
Source-specific executed results belong in the evidence handoff, not this design
description. Small synthetic fixtures do not establish national-scale performance.
