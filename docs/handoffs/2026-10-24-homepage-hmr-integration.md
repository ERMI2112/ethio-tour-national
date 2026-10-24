# Homepage and Workspace HMR Integration Handoff

**Status:** locally integrated at `18bd80ec6c9c0bc080ae268a6ea66c9070a5718c`;
service-free checks passed with one root test-command OOM followed by a
successful serial package test run. Development HMR and real-auth browser
acceptance remain pending.
**Branch:** `integration/frontend-polish-hmr-20261024`.
**Worktree:** `C:\Users\Ermias\Projects\ethio-tour-national-frontend-integration-20261024`.
**Base:** `53326583d0d71dfce02230f12aabe56c44227403`.
**Previous integration checkpoint:** `710d2517cf2d030e18072353844b58de79fc1c19`.
**Homepage follow-up:** `18bd80ec6c9c0bc080ae268a6ea66c9070a5718c`
(verified direct child of the previous checkpoint; preserved unchanged).
**Contributor commits:** workspace HMR fix
`53e5f04f87842088513dd53517e3710682056e2e`; homepage polish
`78faf2c95f8a387f3adef80daa8503cd9d374259`; homepage follow-up
`18bd80ec6c9c0bc080ae268a6ea66c9070a5718c`.

Both original contributions descend directly from the agreed base and remain
ancestors of `18bd80e`. Their commits were preserved without rewriting, and
both source worktrees remain intact. The follow-up makes the homepage workflow
presentation a labeled section with a heading association, removes an
unsupported fragment target, and clarifies that private admission does not
publish a hotel or activate a subscription. Its test checks those semantics.
The six source files in the integrated delta remain the four public-web
homepage/style/test files and the two workspace Next configuration/test files.

Freebuff's read-only review of `18bd80e` found no blockers. Non-blocking notes:
the hero CTA text contrast was measured at 4.47:1, the hero focus ring at 1.79:1
against the green background, feature-icon contrast at 3.99:1, admission wording
is duplicated and omits actor/current-version detail, and one mobile padding
rule is redundant. No visual, server, browser, or build acceptance was claimed
by that review. These observations were not changed in this integration step.

## Verification

The checks below ran against exact application source
`18bd80ec6c9c0bc080ae268a6ea66c9070a5718c`. Build/test commands received explicit
process-only test origins: public web `http://localhost:3120`, workspace web
`http://localhost:3121`, API base `http://localhost:3122/api`, and a synthetic
test issuer at `http://localhost:3123/realms/synthetic-ci`; the workspace
callback was `http://localhost:3121/auth/callback`. No service was started.

- `pnpm test`: **failed, exit 1**. The default parallel Vitest run exhausted
  Node heap with `FATAL ERROR: NewSpace::EnsureCurrentCapacity Allocation
failed` and JavaScript heap out of memory while running workspace-web,
  backend-domain, and public-web suites. This is not a passing root test result.
- `pnpm -r --workspace-concurrency=1 --if-present test`: **331 passed, 0 failed,
  81 skipped**, exit 0. The 81 skips are guarded PostgreSQL hotel integration
  cases; no database was started or connected. Counts by package: authz 11,
  contracts 1, db 65, API client 15, backend-domain 41 passed/81 skipped,
  worker 1, public-web 25, workspace-web 126, API 46. This serial run is the
  successful test evidence for this source, not a successful `pnpm test` run.
- `pnpm lint`: passed.
- `pnpm typecheck`: passed.
- `pnpm build`: passed for the public and workspace applications with the
  explicit test origins. Next.js emitted a non-fatal ESLint-plugin warning.
- Freebuff independently reports public-web tests **25/25 passed**, plus
  typecheck, lint, and diff-check passed on `18bd80e`.
- The scoped Prettier check of the six source files and this handoff exited 1:
  Prettier reports formatting differences in `apps/public-web/app/globals.css`,
  `apps/public-web/app/page.test.tsx`, `apps/public-web/app/page.tsx`, and this
  handoff. Source files were left unchanged to preserve the reviewed
  fast-forwarded commit. The handoff was formatted separately and its scoped
  check passed.
- `git diff --check`: passed.

The serial package tests, lint, typecheck, and build were executed after the
fast-forward to `18bd80e`. The test suites were serialized after the root
parallel run hit the host's available heap limit. The follow-up did not change
dependencies, so frozen install was not repeated.

## Limits

The HMR change configures Next.js to transpile the workspace's shared API
client, and its configuration test plus production build passed. Neither proves
development-mode HMR; dev-server validation remains pending because server
launch is prohibited for this task. No browser session, API, Keycloak, Docker,
or database was launched. Real-auth browser acceptance remains pending.
PostgreSQL `81/81` evidence remains attached to source
`f64e5ab5a21c8017df208e5b432fa1e685bbd7fe`; it was not rerun here. The
documentation update follows `18bd80e` as a separate local checkpoint.
GitHub Actions has not run for this candidate.
