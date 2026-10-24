# Homepage and Workspace HMR Integration Handoff

**Status:** locally integrated at merge commit
`7cca186204fa44981b5f87ef466370790f8f3560`; service-free checks passed using
serial tests. Development HMR, visual review, and real-auth browser acceptance
remain pending.
**Branch:** `integration/frontend-polish-hmr-20261024`.
**Worktree:** `C:\Users\Ermias\Projects\ethio-tour-national-frontend-integration-20261024`.
**Base:** `53326583d0d71dfce02230f12aabe56c44227403`.
**Previous integration checkpoint:** `710d2517cf2d030e18072353844b58de79fc1c19`.
**Preserved integration handoff:** `41c4c9e89e931fa8030b939134bcbf0ccdcd7cce`
(descends from `18bd80e`).
**Contributor commits:** workspace HMR fix
`53e5f04f87842088513dd53517e3710682056e2e`; homepage polish
`78faf2c95f8a387f3adef80daa8503cd9d374259`; homepage follow-up
`18bd80ec6c9c0bc080ae268a6ea66c9070a5718c`; homepage contrast/copy follow-up
`29204197142c7179910d4c54fde0a6ad8d6e3e4e`.

The latest homepage follow-up is a sibling of the integration handoff after
`18bd80e`. Merge commit `7cca186204fa44981b5f87ef466370790f8f3560` has parents
`41c4c9e89e931fa8030b939134bcbf0ccdcd7cce` and
`29204197142c7179910d4c54fde0a6ad8d6e3e4e`; neither history was rewritten.
The follow-up adjusts the hero CTA/focus styling, removes redundant mobile
spacing overrides, and restores concise admission-audience copy.

Both original contributions descend directly from the agreed base and remain
ancestors of `18bd80e`. Their commits were preserved without rewriting, and
both source worktrees remain intact. The follow-up makes the homepage workflow
presentation a labeled section with a heading association, removes an
unsupported fragment target, and clarifies that private admission does not
publish a hotel or activate a subscription. Its test checks those semantics.
The six source files in the integrated delta are the public-web homepage,
styles, and tests plus the workspace Next configuration and its test.

Freebuff's read-only review of `2920419` found no blockers and verified its
parent is `18bd80e`. The prior review of `18bd80e` had noted CTA/focus contrast,
feature-icon contrast, duplicated admission wording, and redundant mobile
spacing; the latest contribution targets CTA/focus contrast, admission copy,
and spacing. The review supplied no new measured contrast ratios and did not
claim build, server, browser, or visual acceptance.

## Verification

The checks below ran against merged application source
`7cca186204fa44981b5f87ef466370790f8f3560`. Build/test commands received explicit
process-only test origins: public web `http://localhost:3120`, workspace web
`http://localhost:3121`, API base `http://localhost:3122/api`, and a synthetic
test issuer at `http://localhost:3123/realms/synthetic-ci`; the workspace
callback was `http://localhost:3121/auth/callback`. No service was started.

- Earlier parallel-test evidence: `pnpm test` on source `18bd80e` **failed,
  exit 1**, because Vitest exhausted Node heap while running workspace-web,
  backend-domain, and public-web suites. The captured diagnostic was
  `FATAL ERROR: NewSpace::EnsureCurrentCapacity Allocation failed` followed by
  `JavaScript heap out of memory`. This earlier failure is retained here and is not
  represented as a test result for merged source `7cca186`.
- `pnpm -r --workspace-concurrency=1 --if-present test`: **331 passed, 0 failed,
  81 skipped**, exit 0, against merged source `7cca186`. The 81 skips are
  guarded PostgreSQL hotel integration
  cases; no database was started or connected. Counts by package: authz 11,
  contracts 1, db 65, API client 15, backend-domain 41 passed/81 skipped,
  worker 1, public-web 25, workspace-web 126, API 46.
- `pnpm --filter @ethio-tour/public-web test`: **25 passed, 0 failed**, exit 0.
- `pnpm lint`: passed.
- `pnpm typecheck`: passed.
- `pnpm build`: passed for the public and workspace applications with the
  explicit test origins. Next.js emitted a non-fatal ESLint-plugin warning.
- Freebuff independently reported public-web tests **25/25 passed**, plus
  typecheck, lint, and diff-check passed on `18bd80e`.
- The scoped Prettier check of the six source files and this handoff exited 1:
  Prettier reports formatting differences in `apps/public-web/app/globals.css`,
  `apps/public-web/app/page.test.tsx`, and `apps/public-web/app/page.tsx`.
  Those reviewed source files were left unchanged. The handoff was formatted
  separately and its scoped check passed.
- `git diff --check`: passed.

The serial package tests, lint, typecheck, and build were executed on merged
source `7cca186`. The historical parallel OOM was on earlier source `18bd80e`;
the current root test run used workspace concurrency 1. The follow-up did not
change dependencies, so frozen install was not repeated.

## Limits

The HMR change configures Next.js to transpile the workspace's shared API
client, and its configuration test plus production build passed. Neither proves
development-mode HMR; dev-server validation remains pending because server
launch is prohibited for this task. No browser session, API, Keycloak, Docker,
or database was launched. Real-auth browser acceptance remains pending.
PostgreSQL `81/81` evidence remains attached to source
`f64e5ab5a21c8017df208e5b432fa1e685bbd7fe`; it was not rerun here. The
documentation update follows merge commit `7cca186` as a separate local
checkpoint.
GitHub Actions has not run for this candidate.
