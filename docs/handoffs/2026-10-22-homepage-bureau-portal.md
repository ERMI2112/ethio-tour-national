# Homepage and Bureau Portal Integration

Status: locally committed UI candidate; real-auth browser acceptance pending.

## Provenance

- Base: `e73ce2d286d10d28dc63b0bff18d37cbdb6e40e2`.
- Codex Bureau contribution: `67b8fce81b2afc23d4fe9496e74e26fc0eb57b18`, direct
  child of the base, on `feature/bureau-reviewer-portal-20261022` in
  `C:\Users\Ermias\Projects\ethio-tour-national-bureau-portal-20261022`.
- Antigravity homepage contribution: `cbb606c1b5e0a801294a01b5e3a877a1f8530656`,
  direct child of the base, on `task/homepage-workspace-portal-entry-20261022`.
- Integration branch: `integration/homepage-bureau-portal-20261022`, worktree
  `C:\Users\Ermias\Projects\ethio-tour-national-homepage-bureau-integration-20261022`.
- Contributions were applied with `git cherry-pick -x`, respectively as
  `c61443d6acc2e2aa7e42b108a461e0f130097efb` and
  `8fd028453c2a08a8077af96981bbb60f05ebb1cf`. Contributor worktrees remain intact.
  This handoff accompanies the subsequent integration-fix commit. All application
  checks below ran on the application tree committed alongside this document;
  no application changes followed those successful checks.

## Bureau Behavior

Search uses only returned hotel names and submitted-location hierarchy text.
Review-state filtering and counts refer explicitly to the loaded queue, retaining
server ordering. Empty queues and filter misses have distinct messages. Hidden
cards stay mounted to preserve the reason and chosen outcome; identity changes,
session loss, and denied reads remove private cards and their form state.
Filtering cannot bypass conflict recovery or change case/version request targets.
Applicant notes retain line breaks, and the scoped layout wraps long content on
narrow screens. Existing submitted-location and decision-version labels remain.

The Bureau source changed only `screen.tsx`, a scoped CSS module, and a separate
test file. It required no shared component, session, API, or backend change.

## Homepage Review and Corrections

- Reproduced mobile navigation defects in service-free DOM tests: clicking the
  open toggle did not close it; Escape left focus on a hidden menu link. Both
  regressions now pass with the outside-click guard and focus restoration.
- Removed claims of government verification, established office jurisdiction,
  and an available public discovery interface. The homepage now describes the
  actual synthetic private hotel pilot and its limits.
- Cross-app origin configuration rejects non-HTTP(S) destinations, credentials,
  paths, queries, and fragments, and normalizes trailing slashes before joining
  existing private routes.
- Workspace entry still uses the real AuthProvider and its sign-in/sign-out
  actions. Initiation errors remain in its alert without unhandled rejections.
  Tests cover identity replacement, API 401, sign-out, and expiry. Displayed links
  do not confer authority; backend permission checks remain unchanged.

## Executed Checks

Node `22.14.0`, pnpm `12.5.1`. Commands below exited 0 on the final integrated
application tree:

- `pnpm install --frozen-lockfile`: passed; no dependency or lockfile changes.
- `pnpm --filter @ethio-tour/public-web --filter @ethio-tour/workspace-web test`:
  public web **20 passed, 0 failed, 0 skipped**; workspace **94 passed, 0 failed,
  0 skipped**. These are service-free unit/component tests, not live API/browser
  tests. The 114 executed tests are an actual combined-tree run, not a sum of
  contributor claims.
- `pnpm --filter @ethio-tour/public-web --filter @ethio-tour/workspace-web lint`:
  passed.
- `pnpm --filter @ethio-tour/public-web --filter @ethio-tour/workspace-web typecheck`:
  passed after the production builds.
- `pnpm --filter @ethio-tour/public-web... --filter @ethio-tour/workspace-web... build`:
  contracts, API client, public web, and workspace production builds passed.
  Next reported the existing non-fatal ESLint plugin warning.
- Prettier check on all changed TypeScript, TSX, CSS and this handoff: passed.
- `git diff --check`: passed.

Separately, Codex executed the Bureau contribution's workspace suite: **73 passed,
0 failed, 0 skipped**, with workspace lint, typecheck, scoped formatting, dependency
and workspace build, and diff checks passing. An initial test type-import lint
violation was corrected before commit. During integration the new navigation
regression tests initially gave 1 pass/2 failures; the final results above include
the fixes. These earlier counts are not added to the final combined-tree totals.

## Limitations and Next Gate

- Real-auth browser acceptance remains pending. No server, Docker, database,
  Keycloak, browser run, deployment, or cleanup was attempted for this task.
- Semantic controls, accessible names, hidden-card behavior and keyboard-related
  events were checked through DOM tests. Mobile visual layout, actual browser
  focus behavior, contrast and full accessibility compliance were not verified.
- The new `NEXT_PUBLIC_WORKSPACE_URL` and `NEXT_PUBLIC_PUBLIC_URL` are build-time
  origins documented in `.env.example`, defaulting to local ports 3001 and 3000.
  Custom values must be supplied to each Next build. The existing Dockerfile and
  Compose build configuration do not yet forward these two variables; changing
  ports or deployment origins through Compose needs a separately coordinated
  infrastructure patch and verification. This task did not modify that shared
  configuration or verify application images.
- No PostgreSQL tests were rerun for this UI-only integration. The existing
  81/81 PostgreSQL evidence remains attached to `f64e5ab5a21c8017df208e5b432fa1e685bbd7fe`;
  its documentation checkpoint is the base `e73ce2d`. It is not new browser or
  runtime acceptance of this integrated UI.
- Root tests and unrelated backend gates were not rerun. Freebuff has not reviewed
  this new integrated candidate. No push or main merge occurred.

## Changed Files Since Base

```text
.env.example
apps/public-web/app/components/mobile-nav.test.tsx
apps/public-web/app/components/mobile-nav.tsx
apps/public-web/app/globals.css
apps/public-web/app/layout.tsx
apps/public-web/app/lib/config.test.ts
apps/public-web/app/lib/config.ts
apps/public-web/app/page.test.tsx
apps/public-web/app/page.tsx
apps/public-web/vitest.config.ts
apps/workspace-web/app/bureau/hotel-cases/bureau-queue.module.css
apps/workspace-web/app/bureau/hotel-cases/bureau-queue.test.tsx
apps/workspace-web/app/bureau/hotel-cases/screen.tsx
apps/workspace-web/app/page.test.tsx
apps/workspace-web/app/page.tsx
apps/workspace-web/app/portal-config.test.ts
apps/workspace-web/app/portal-config.ts
docs/handoffs/2026-10-22-homepage-bureau-portal.md
```
