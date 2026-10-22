# Hotel Directory Review Follow-up

**Status:** two focused fixes committed locally; live browser acceptance remains
pending. No push or merge was performed.

## Candidate

- Base: `25537552407e47960fe9d3fa85e128b3c2473e4b`.
- Branch: `fix/hotel-directory-review-followup-20261022`.
- Worktree: `C:\Users\Ermias\Projects\ethio-tour-national-hotel-directory-review-followup-20261022`.
- Preview privacy fix: `37185778dcc1cc00b1dd5b790f368c1c073c0e8e`.
- Release-scope provisioning implementation: `6c817c70be267c39a8ea14fefb026f81ff0be943`.
- Documentation-only handoff checkpoint: recorded in Git after this file is
  committed.
- The reviewed source worktree remains at `25537552407e47960fe9d3fa85e128b3c2473e4b`
  and was clean when rechecked. No changes from Antigravity's `c790073` branch
  were applied.

## Changes

The preview fix limits draft location labels and hierarchy to valid,
activated synthetic geography releases. Guessed references from unpublished,
invalid, non-synthetic, missing or incompatible releases stay in the owner's
draft as stale input but return no location labels or hierarchy. Submission
fails with the same stale-selection conflict. Active directory search remains
restricted to the activated release pair. An owner's saved location snapshot
for a legitimate historical submitted version remains available.

The provisioner adds a `--review-scope` mode to the existing guarded local
hotel-directory tool. An explicit request binds an existing active profile,
membership and synthetic administrative Bureau organization to exactly one of
the two Bureau capabilities and one activated synthetic geography release/unit.
The release must have a compatible activated synthetic routing release and an
enabled rule for that office. The client connection target is checked against
the guarded loopback disposable target before a transaction; the effective
database name is checked inside it.

The transaction adds only the requested release scope and writes an audit event.
The existing complete-grant authorization checks still decide each case.
Identical requests are idempotent. Conflicting scope flags, inactive bindings,
non-demo grants, and invalid release/office/unit combinations fail closed.
Revoked state is never repaired, and an explicit B scope does not copy an A
scope. No schema, migration, API, or application authorization changes were
needed. Migrations 0000 through 0005, schema and lockfile match the base.

## Operator Command

See [the directory provisioning instructions](../hotel-versioned-location-directory.md#explicit-review-scopes-for-another-release).
In brief: after activating the synthetic release pair, provision each intended
read or decision capability with its own private explicit JSON request:

```powershell
pnpm --filter @ethio-tour/db db:provision:hotel-directory:test --review-scope <private-synthetic-scope.json>
```

The process must set `NODE_ENV=test` or `development`,
`REGISTRY_POLICY_MODE=demo`, `HOTEL_PILOT_TEST_DISPOSABLE=true`, and an explicit
guarded `HOTEL_PILOT_TEST_DATABASE_URL`. It never loads `.env` or uses the
ordinary `DATABASE_URL`. Identity issuer/subject, membership and organization
IDs must come from the task's trusted synthetic setup manifest. Do not put
credentials or the request JSON in Git. This local provisioner does not grant
production authority and is not a release-administration API.

## Verification

Node `22.14.0`; pnpm `12.5.1`. `pnpm install --frozen-lockfile` completed with
no lockfile change. Commands executed on the final implementation source before
this documentation-only handoff:

- `pnpm format:check`: passed after normalizing the Windows checkout's tracked
  text line endings for the check. No unrelated file content was changed;
  checkout line endings were restored afterward. Prettier also passed on all
  six implementation files with the focused check.
- `pnpm lint`: passed.
- `pnpm test`: passed; **224 passed, 0 failed, 77 skipped**. The default skips
  were the three opt-in hotel PostgreSQL suites. Unit counts included 65 DB
  tests, 41 domain tests, 46 API tests, 43 workspace UI tests, 15 API-client
  tests, 11 authorization tests, 1 contracts test, 1 public-web test and 1 worker
  test.
- `pnpm typecheck`: passed, including the production builds and recursive package
  type checks. Build-only public API and identity URLs were process-local test
  placeholders; no application service was started from them.
- `pnpm --filter @ethio-tour/db exec vitest run src/provision-hotel-location-directory.test.ts`:
  **25 passed, 0 failed, 0 skipped**.
- On a fresh task-owned PostGIS container, after fresh migrations 0000-0005:

  ```powershell
  pnpm --filter @ethio-tour/backend-domain exec vitest run --config vitest.hotel-integration.config.ts --reporter=verbose --reporter=json --outputFile=<restricted-task-directory>/scopes-postgres-report.json
  node scripts/assert-hotel-tests-executed.cjs <restricted-task-directory>/scopes-postgres-report.json
  ```

  **77 passed, 0 failed, 0 skipped**: onboarding 16, directory 60, and
  0004-to-0005 preservation upgrade 1. This includes unpublished-reference
  preview privacy, old submitted snapshots, explicit release-B scopes, no
  implicit release-A access, profile/membership/grant revocation, organization
  and release validation, mixed-grant denial, concurrent idempotency, and audit
  rollback.

- `git diff --check`: passed. No migration or schema generation was needed.

The root full-format command passed on normalized text contents. The local
Windows `core.autocrlf=true` setting makes untouched CRLF checkout files fail
Prettier's LF check if tested without normalization; this is an existing
checkout-format interaction. Changed files pass the scoped Prettier check.

## Runtime Limits And Review Follow-up

The live Keycloak/API browser journey was **not run**. The earlier API startup
was rejected by shell policy before it executed; this task did not retry that
launch or use an alternate method. Browser acceptance therefore remains
blocked until an approved runtime action is available. Application Docker image
verification is also unverified. Do not treat the unit or PostgreSQL tests as a
browser acceptance result.

This follow-up does not change Administrator geographic authority, legacy
access policy, case reassignment, or queue behavior. Broader Freebuff findings
remain for separate review; this handoff records only the two requested fixes.

The new PostGIS test container was created for this task only, with a tmpfs
database and no persistent volume. Its ownership labels and no-volume state
were rechecked; it was stopped and its `--rm` cleanup completed. The restricted
task directory and test state/logs remain; the earlier rejected cleanup was not
retried. Older exited resources from the previous task were not touched.
