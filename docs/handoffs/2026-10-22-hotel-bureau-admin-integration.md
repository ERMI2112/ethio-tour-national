# Hotel Bureau and Administrator Integration Handoff

- **Status:** locally integrated candidate; browser acceptance pending.
- **Branch:** `integration/hotel-bureau-admin-usability-20261022`.
- **Worktree:** `C:\Users\Ermias\Projects\ethio-tour-national-hotel-bureau-admin-integration-20261022`.
- **Base:** `25537552407e47960fe9d3fa85e128b3c2473e4b`.
- **Backend source:** `0e405d7c2dc08fa3eb62dffe736790e2892e9dfa`, containing `37185778dcc1cc00b1dd5b790f368c1c073c0e8e` and `6c817c70be267c39a8ea14fefb026f81ff0be943`.
- **UI source:** `d3157c7ef06b8fe9203ff94614c720b5faf7d4e4`, cherry-picked here as `433a12cb0e235dd63dde77efa092c65347b5795a` without modifying its source worktree.

## Integration changes

- Bureau and Administrator queue rows, errors, and success notices are associated
  with the access token that fetched them. A token change immediately renders no
  prior actor's private rows while the new queue loads; stale responses are
  ignored, and a 401/403 leaves no private rows displayed.
- Decision requests use synchronous in-flight refs at both screen and card level,
  preventing rapid keyboard/click duplicates before React renders a busy state.
- A 409 preserves the typed reason but clears the old outcome. Resubmission stays
  blocked until the user successfully refreshes from the conflict action, chooses
  an outcome again, and explicitly confirms the retained reason for the current
  application version. A failed refresh does not clear the conflict gate.
- Bureau outcomes (`approve`, `request_changes`, `reject`) and Administrator
  outcomes (`admit`, `decline`) use the same reason rule as the API: a defined
  string, trimmed non-empty and no more than 1,000 characters. The UI tests cover
  each outcome; the backend validation is in
  `apps/backend/api/src/hotels/hotel-onboarding.dto.ts` and
  `packages/backend-domain/src/hotels/hotel-onboarding-service.ts`.

## Checks on the integrated tree at `89732fe` (historical)

- `pnpm test`: **247 passed, 0 failed, 77 skipped**. The skipped cases are the
  opt-in PostgreSQL suites (60 location-directory, 16 hotel-onboarding, and 1
  migration-upgrade case); no database was provisioned for this UI-only delta.
- Workspace tests: **66 passed, 0 failed**, including 23 Bureau/Administrator
  usability tests.
- `pnpm lint`: passed.
- `pnpm typecheck`: passed; its required build completed successfully.
- `pnpm exec prettier --check` on the five changed UI/test files: passed.
- Repository `pnpm format:check`: failed on **151 repository files**. The listed
  failures are outside this focused integration patch; they were not reformatted.
- `git diff --check`: passed for the tracked integration diff. The handoff file
  also passed the scoped Prettier check.
- No live browser, Keycloak, Docker, or PostgreSQL acceptance was run here.
  Browser acceptance remains pending. Contributor PostgreSQL results are
  separate evidence and are not counted as tests executed on this integrated
  tree.

## Latest Local Checkpoint: `f64e5ab`

The integration branch was fast-forwarded from `89732fea5c5cfb7372d8a828bd8d6795d175f68c`
to its direct child `f64e5ab5a21c8017df208e5b432fa1e685bbd7fe`. This checkpoint
changes the PostgreSQL mixed-grant test fixture only; it keeps the production
provisioning and authorization rules unchanged.

- `pnpm --filter @ethio-tour/db build`: passed before the PostgreSQL run, avoiding
  stale ignored `packages/db/dist` output.
- `pnpm test:hotel:migration`: **18 passed, 0 failed, 0 skipped**. The guarded
  `pnpm db:migrate:hotel-test` migration step completed successfully.
- The guarded `hotel-postgis` integration command and
  `node scripts/assert-hotel-tests-executed.cjs <report>`: **81 passed, 0 failed,
  0 skipped**. Suite breakdown: hotel onboarding 16/16, hotel location directory
  64/64, and directory upgrade 1/1. The JSON report remains outside the
  repository at
  `C:\Users\Ermias\AppData\Local\Temp\hotel-fixture-fix-9b75e8df5e2e.json`.
- Focused service-free tests, typecheck, lint, formatting, build, and
  `git diff --check` for the fixture fix passed.
- The full root `pnpm test` and browser acceptance were **not rerun** at
  `f64e5ab`. The historical 247/77 root-test result above is not evidence for
  this checkpoint. Real-auth browser acceptance remains pending.
- The PostgreSQL run used only newly created, task-owned disposable PostGIS
  storage on loopback port `64862`; that task-owned container was removed after
  verification. No existing stack or database was used or changed.

## Review handoff

Review the final commit on this branch, especially token-keyed private queue
rendering and late-response guards, synchronous submit locks, and the refreshed
version/reason confirmation following 409. The integration contains no backend,
contract, migration, dependency, or lockfile change. No push or canonical-branch
merge was performed.
