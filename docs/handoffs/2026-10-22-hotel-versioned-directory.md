# Versioned Hotel Location and Routing: Evidence Handoff

**Status:** implementation committed; service-free and disposable PostgreSQL
verification passed. Real-auth browser acceptance is blocked, not passed.
This is a synthetic expansion foundation, not nationwide coverage or legal
authority. No push, main merge, or deployment was performed.

## Candidate and Ownership

- Branch: `feature/hotel-versioned-directory-20261021`.
- Worktree: `C:\Users\Ermias\Projects\ethio-tour-national-hotel-location-integration-20261021`.
- Verified base: `899e9017f113435803add3f4dead11a4798393ac`.
- Early shared contract: `cb678ff3a6423f8e0599f7f7e79fccce973b4de9`.
- Final tested application source: `40fb65497b7649987a0a4db7ab794011b914a5a6`.
- Final PostgreSQL/config checkpoint: `249fe97cd4b41cc1d3db56cf8af2d95afec4d7da`.
  Its sole delta is sequential execution of the three hotel integration files;
  application code is identical. This subsequent handoff changes documentation only.
- Separate backend, UI and PostgreSQL-test contributor branches were preserved.
  The original candidate worktree remains clean. The main checkout's existing
  dirty files were not edited: `.env.example`, API `main.ts`, Compose, the local
  realm file and untracked API security directory. No repository `.env` was read.

## Delivered Behavior

- Separate immutable geography and routing releases, compatible active pair,
  arbitrary unit types/depth, language/script names and aliases, source-namespaced
  identifiers, explicit cross-release continuity and guarded synthetic import.
- Authenticated bounded location search, deterministic cursor pagination and full
  hierarchy disambiguation. No Bureau mapping or grants in applicant results.
- Submission locks the active pair, requires exactly one enabled applicable route,
  and saves its release/unit/hierarchy/rule/office/scope binding transactionally.
  No-route, ambiguity or stale selections preserve the private draft.
- Current identity, membership and one complete grant remain mandatory. Old cases
  use their immutable release ancestry, not the currently active hierarchy.
- Existing private owner workspace access remains; historical admission and Bureau
  decisions identify the exact version they cover. A correction is a new review.
- Searchable applicant selector, hierarchy preview, release/version context, stale
  and failure states, preserved inputs, and required unverified-location copy.
- Updated real-PKCE two-office browser spec; it has not executed on this candidate.

Contracts/limits: [API document](../hotel-location-directory-api.md).
Compatibility/provisioning: [directory design](../hotel-versioned-location-directory.md).

## Migration and Compatibility

Added `packages/db/drizzle/0005_hotel_versioned_directory.sql`, Drizzle snapshot,
journal and schema. Migrations 0000 through 0004 are unchanged (`git diff --quiet`
against the base exited 0). The shared administrative-unit enum and existing
registry/guide geography were not expanded or repurposed.

Existing data is not backfilled with invented releases, locations or verification.
Legacy drafts need a confirmed release-aware selection before a new submission.
Complete legacy submitted assignments permit exact saved-unit grants only;
historical descendant ancestry is unknown and denied. Incomplete bindings fail
closed. Versions/cases, activated contents and route assignments have database
guards. The real upgrade test compares original columns across 11 existing tables.
Server and client contract changes must deploy together.

## Executed Checks

Node `22.14.0`, pnpm `12.5.1`; frozen installation passed without lockfile changes.
Commands below exited 0 unless explicitly identified as an earlier failure.

- `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm build`,
  `git diff --check`: passed on the integrated source. After the final application
  fixes, `pnpm test` rebuilt all applications and passed; the same recursive
  typecheck command used by the root script was rerun after that build and passed.
  Final formatting and lint were rerun successfully as well.
- Final `pnpm test`: **203 passed, 0 failed, 59 skipped**. Breakdown: authorization
  11, contracts 1, database units 44, API client 15, domain units 41, public web 1,
  workspace web 43, API 46, worker 1. Skips are exclusively opt-in PostgreSQL cases,
  executed separately below. UI focused file: **23 passed** within that total.
- `pnpm exec tsc -p tests/e2e/tsconfig.json --noEmit`: passed. Scoped ESLint for
  the live spec and required-test guard passed.
- `pnpm db:generate`: no schema changes or extra migration after generation.
- `pnpm db:migrate:hotel-test`: fresh 0000-0005 migrations passed on new task DBs.
- Final exact command at `249fe97cd4b41cc1d3db56cf8af2d95afec4d7da`:

  ```powershell
  pnpm --filter @ethio-tour/backend-domain exec vitest run --config vitest.hotel-integration.config.ts --reporter=verbose --reporter=json --outputFile=<restricted-task-directory>/hotel-postgis-checkpoint-report.json
  node scripts/assert-hotel-tests-executed.cjs <restricted-task-directory>/hotel-postgis-checkpoint-report.json
  ```

  **59 passed, 0 failed, 0 skipped**, exit 0; 45.45 seconds. Breakdown: onboarding
  16, directory 42, real 0004-to-0005 upgrade 1. Required suites/nonzero/zero-skip
  guard passed. Coverage includes release-A historical authorization after B,
  current revocation, mixed-grant denial, immutable assignments, routing failures,
  stale inputs, privacy, atomic release binding and concurrent activation/submission.

- **54 production JavaScript bundles inspected**, zero injected test-session hook
  matches. Workspace production build ID: `yzHotk9em-j7o7Lm49eaL`.

Initial failures are not hidden: checkout CRLF formatting was normalized without
unrelated Git content changes. Scoped CJS lint needed explicit Node globals.
A parallel PostgreSQL rerun hit relation-lock/test timeouts (13 passed, 30 failed,
16 skipped); serialized fresh-database execution passed 59/59. The configuration
now serializes files sharing active-release/DDL fixtures without removing internal
activation/submission race assertions. The standard final command then passed
59/59 again. Earlier passes are not substituted for that final execution.

## Disposable Runtime and Remaining Blocker

Task label: `hotel-versioned-directory-20261021-7f86`. Only new resources were used:

- PostGIS `et-hotel-directory-pg-20261021-7f86`, container
  `7e300b3c4bf498cac454e5e738ea7c4bf5d2b7c99d8dc36ecbc6a94b59fec5bf`,
  image `postgis/postgis:16-3.5`, image ID
  `sha256:94146ac37bc61e2322f88016056c5920729cb8c64c8542ed590af8fc2abdac07`.
  Loopback port 57601, tmpfs data, no named volumes. Final database:
  `ethio_tour_hotel_test_directory_final`; the upgrade test created additional
  guarded random databases only inside this same task-owned server.
- Keycloak `et-hotel-directory-keycloak-20261021-7f86`, container
  `11acae926cc1139ff3ee755058ab601284d1f3026273fc0a5ec2738bd9b8eafc`,
  image `quay.io/keycloak/keycloak:26.1.2`, image ID
  `sha256:289bfb86e3b7d7ea6cfd54b09e1b1e33c31ee42a39317032afebb6ab54b17c9f`.
  Fresh tmpfs storage/realm; HTTP 61535 and management 61536. Readiness returned
  200, discovery returned the exact configured issuer. Four distinct generated
  identities were imported: applicant, two office reviewers and Administrator.
- Issuer: `http://localhost:61535/realms/hotel-directory-20261021-7f86`;
  required API audience `ethiotour-api`, allowed client `workspace-web`, S256 PKCE,
  callback `http://localhost:61538/auth/callback`, exact logout/web origin.
- Intended API `http://localhost:61537/api`, workspace `http://localhost:61538`.
  They are **not running acceptance URLs**: shell policy rejected the isolated
  API `Start-Process` launch before execution. No alternative launch/bypass was
  attempted. No workspace process or browser run was started.
- The fresh browser database was migrated and seeded with the supported guarded
  demo provisioner. It contained one active pair, three explicitly bound officer/
  Administrator profiles and memberships, six grants and four release scopes.
  Provisioning checked canonical issuer/subject and complete active grant bindings;
  the applicant had no pre-created Bureau/provider authority. Browser token-to-grant
  behavior remains unverified because the journey could not start.

The planned `HOTEL_E2E_*` process variables and `HOTEL_E2E_IDENTITIES_FILE` would
point only to these resources; run `pnpm test:e2e:hotel` after a permitted fresh
isolated environment is provisioned. No fake identities or injected auth bypass
were added. Browser result: **0 executed; blocked**, not a pass or runtime skip.
Application Docker images and GitHub Actions were **not verified**.

## Independent Review and Limits

The separate read-only review lane inspected `b9431ea`, found a P2 localized label/
hierarchy inconsistency, then inspected its fix in `40fb654` and UI-copy delta
`66debfa`. It reported no blocking issue in those deltas or config `249fe97`.
The multilingual PostgreSQL assertion subsequently executed successfully. The
reviewer did not independently execute services/tests or grant final acceptance.

Accessibility evidence is limited to labelled native selection, focus styles,
loading/error semantics and UI test interactions; no assistive-technology/manual
mobile audit was completed. Required routing copy refers to the persisted draft;
unsaved correction text is retained in the form but is not implicitly saved by
submission. No automatic transliteration, national-scale performance, real office
coverage, reassignment, public hotel listing or commercial capability is claimed.

## Cleanup

The ownership-checked cleanup command was **rejected by shell policy before
execution**. It was not retried through another method. The two task containers
and restricted task files therefore remain; cleanup is incomplete. There were
no task API/workspace processes to stop. Generated credentials remain outside Git
under the restricted directory:
`C:\Users\Ermias\AppData\Local\EthioTour\hotel-versioned-directory-20261021-7f86`.
Do not open or print identity-file contents. A permitted cleanup must verify the
exact task labels/container IDs above, remove only those resources and their
task directory, and never remove any existing volume or unrelated artifact.

No existing stack, account, database or volume was accessed/changed; port 56320
and its incident were untouched. Final acceptance awaits a permitted fresh
real-auth browser run and completion of task-owned cleanup.
