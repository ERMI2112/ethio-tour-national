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

### Explicit Review Scopes For Another Release

Use the same provisioner after activating a synthetic geography/routing release.
The operator must supply an **existing** canonical identity, active membership
and synthetic administrative organization from the disposable setup manifest.
This operation does not create accounts or memberships, map issuer aliases,
transfer ownership, change membership state or reactivate revoked grants.

Put an explicit request outside Git, using actual IDs from that task's setup.
The following values are illustrative synthetic placeholders, not credentials:

```json
{
  "issuer": "https://identity.example.test/realms/synthetic-review",
  "subjectId": "synthetic-officer-subject",
  "membershipId": "80000000-0000-4000-8000-000000000001",
  "organizationId": "synthetic-office-B",
  "capability": "hotel:application:bureau:read",
  "geographyReleaseId": "synthetic-geography-B",
  "scopeUnitId": "synthetic-area-B",
  "includeDescendants": true
}
```

With the guarded disposable URL and opt-in configured only in this task's
process environment, and `NODE_ENV=test` (or `development`) plus
`REGISTRY_POLICY_MODE=demo`, run:

```powershell
pnpm --filter @ethio-tour/db db:provision:hotel-directory:test --review-scope <private-synthetic-scope.json>
```

Provision `hotel:application:bureau:decide` separately if the operator intends
to permit decisions. Each case operation must still match one complete grant;
read authority cannot supply missing geographic coverage to a decision grant.
Only those two Bureau capabilities are accepted. No Administrator, provider,
public, commercial or production authority is granted.

The provisioner verifies the client's actual connection target against the
guarded target before connecting, then verifies the effective database name.
It requires an active exact identity/membership/organization binding, an
activated valid synthetic geography containing the scope unit, and an activated
compatible synthetic routing release with an enabled rule for that office. The
requested grant scope must both stay within that route's configured coverage
and be able to authorize at least one case scope routed to that office in the
same geography release. This follows the existing authorization rule: an exact
case-scope match is allowed, or an ancestor grant scope is allowed when
`includeDescendants` is true. It prevents successful provisioning of a scope
that is contained by a route but cannot authorize any case produced by it.

Provisioning against an activated historical routing release is intentional:
cases retain their original release, rule, office and scope, so an operator may
need to provision explicit access for those historical cases. The provisioner
does not require the release to be the current active pair and does not switch
the active pair, change existing assignments, or change future routing. Whether
new grants should remain provisionable for superseded releases indefinitely, or
be limited to a documented historical-queue need, remains an operational policy
decision; current behavior permits the explicit historical-release request.
This does not imply official jurisdiction. Synthetic identity provenance comes
from the isolated setup; profiles and memberships do not acquire an invented
verification flag.

The transaction locks the membership and existing grant, adds only the requested
release scope, and records `hotel.directory.review_scope.provisioned` under the
local-provisioner actor. Audit failure rolls back new authority. Repeating the
identical request returns the same grant/scope without duplicate authority or
success audit. A conflicting descendant flag, revoked grant/membership/profile,
non-demo or production-enabled grant, wrong identity/office, or unavailable
release/scope fails; the tool never widens or repairs a conflicting binding.
Expected refusals print static explanations only, without identity or connection
values. Other failures use the existing generic sanitized CLI error.

Stable unit IDs do not copy authority between releases. Release B needs an
explicit request even if its unit ID also appeared in A. Current revocation
still denies both new and historical case access. No migration or manual SQL
is needed for this operation; the existing release-scope keys from migration
0005 are used. This tool is not a production grant-administration interface.

API details and limits are in [the shared contract](hotel-location-directory-api.md).
Source-specific executed results belong in the evidence handoff, not this design
description. Small synthetic fixtures do not establish national-scale performance.
