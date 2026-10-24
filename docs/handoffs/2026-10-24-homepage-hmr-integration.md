# Homepage and Workspace HMR Integration Handoff

**Status:** locally integrated at `459eaf116c0e93f23de549ba8029baa31e17503d`;
service-free checks passed. Development HMR and real-auth browser acceptance
remain pending.
**Branch:** `integration/frontend-polish-hmr-20261024`.
**Worktree:** `C:\Users\Ermias\Projects\ethio-tour-national-frontend-integration-20261024`.
**Base:** `53326583d0d71dfce02230f12aabe56c44227403`.
**Previous integrated source:** `27d32b40daeb9afef9df8ca9bbc69495e8279989`.
**Fast-forwarded homepage follow-up:** `459eaf116c0e93f23de549ba8029baa31e17503d`
(direct child of the previous source; preserved unchanged).
**Contributor commits:** workspace HMR fix
`53e5f04f87842088513dd53517e3710682056e2e`; homepage polish
`78faf2c95f8a387f3adef80daa8503cd9d374259`.
**Integration commits:** `777df7754c33fa111302d2f7e6cd55bc12a94176`
(HMR fix), then `27d32b40daeb9afef9df8ca9bbc69495e8279989` (homepage polish),
then the fast-forwarded follow-up `459eaf116c0e93f23de549ba8029baa31e17503d`.

Both original contributions descend directly from the agreed base and remain
ancestors of `459eaf1`. Their commits were preserved without rewriting, and
both source worktrees remain intact. The follow-up makes the homepage workflow
presentation a labeled section with a heading association, removes an
unsupported fragment target, and clarifies that private admission does not
publish a hotel or activate a subscription. Its test checks those semantics.
The six source files in the integrated delta remain the four public-web
homepage/style/test files and the two workspace Next configuration/test files.

## Verification

The root gates below ran against exact application source
`459eaf116c0e93f23de549ba8029baa31e17503d`. Build/test commands received explicit
process-only test origins: public web `http://localhost:3120`, workspace web
`http://localhost:3121`, API base `http://localhost:3122/api`, and a synthetic
test issuer at `http://localhost:3123/realms/synthetic-ci`; the workspace
callback was `http://localhost:3121/auth/callback`. No service was started.

- `pnpm --filter @ethio-tour/public-web test`: **25 passed, 0 failed** after
  the homepage follow-up.
- `pnpm --filter @ethio-tour/workspace-web test`: **126 passed, 0 failed**,
  including the `next.config.mjs` transpilation regression test.
- `pnpm test`: **331 passed, 0 failed, 81 skipped**. All 81 skips are the
  guarded PostgreSQL hotel integration cases; no database was started or
  connected. The root run also built the application packages.
- `pnpm lint`: passed.
- `pnpm typecheck`: passed.
- `pnpm build`: passed for the public and workspace applications with the
  explicit test origins. Next.js emitted a non-fatal ESLint-plugin warning.
- The first scoped Prettier check identified formatting drift in only
  `apps/public-web/app/page.tsx` and `apps/public-web/app/page.test.tsx`. Only
  those working copies were normalized; their Git blob IDs remain identical
  to commit `459eaf1`, so the commit itself is unchanged. The focused
  public-web suite then passed 25/25.
- Scoped Prettier check on all six source files and this handoff: passed.
- `git diff --check`: passed.

The root tests, lint, typecheck, and build were executed after the fast-forward
to `459eaf1`. The follow-up did not change dependencies, so frozen install was
not repeated.

## Limits

The HMR change configures Next.js to transpile the workspace's shared API
client, and its configuration test plus production build passed. Neither proves
development-mode HMR; dev-server validation remains pending because server
launch is prohibited for this task. No browser session, API, Keycloak, Docker,
or database was launched. Real-auth browser acceptance remains pending.
PostgreSQL `81/81` evidence remains attached to source
`f64e5ab5a21c8017df208e5b432fa1e685bbd7fe`; it was not rerun here. The
documentation update follows `459eaf1` as a separate local checkpoint.
GitHub Actions has not run for this candidate.
