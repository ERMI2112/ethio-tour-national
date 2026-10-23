# Homepage, Bureau, and Administrator Integration Handoff

**Status:** locally integrated; service-free checks passed. Not a visual or
real-auth browser acceptance.
**Branch:** `integration/homepage-bureau-admin-config-20261023`.
**Worktree:** `C:\Users\Ermias\Projects\ethio-tour-national-homepage-bureau-admin-integration-20261023`.
**Common base:** `0d0fb3fcd5e7507606828d53024874d35d419371`.
**Application/test source:** `f297671` (controlled session-expiry test plus both
contributions, without this handoff document).
**Contributor commits:** build/config `642ae96558fb49b791bdca1228e2939095845f25`;
Administrator UI `ea65fe44ceeb3b38d3508826cfdca789c9c755b9`.

## Integration

Both contributions are direct children of the common base. They were merged
without rewriting their commits or changing either contributor worktree. The
build/config contribution covers the CI quality job, explicit Compose origin
requirements, and README guidance. The Administrator contribution adds its
loaded-queue screen, scoped styles, and screen tests.

The integration correction in
`apps/workspace-web/app/page.test.tsx` replaces the 50ms wall-clock expiry
checks with Vitest fake timers and a fixed system time. It verifies that session
identity and all three workflow links are initially visible, advances beyond
the real `AuthProvider` expiry timeout, and verifies identity/links disappear
while the sign-in heading returns. Timer cleanup restores real timers after the
test. This does not change application expiry behavior.

## Review Evidence

- CI sets `NEXT_PUBLIC_WORKSPACE_URL=http://localhost:3001` and
  `NEXT_PUBLIC_PUBLIC_URL=http://localhost:3000` at the quality-job level.
  Root `typecheck`, `test`, and `build` recursively build both Next.js apps;
  the separate `hotel-postgis` job builds backend packages only.
- Production URL helpers remain strict: missing production values and invalid
  origins still throw. No CI bypass or relaxed validation was added.
- Compose documentation passes `.env` explicitly, and both web build args
  require their variables. `.env.example` remains a local-only example.
- Public-home links and workspace applicant/Bureau/Administrator links target
  existing routes; public/workspace and workspace home tests assert the paths.
- Administrator tests cover loaded-only filtering/counts, empty versus no
  matches, denial/failure, form state retained while a card is filtered away,
  and submitting that card's application ID and concurrency version.
- Integrated workspace tests also cover identity-change privacy, duplicate
  submission prevention, required reasons, and 409 refresh/reconfirmation.

## Executed Checks

All commands below ran against application/test source `f297671`, with the two
explicit CI origin values set in the invoking PowerShell process unless noted.

- `pnpm install --frozen-lockfile`: passed; lockfile unchanged.
- Focused expiry test via
  `node node_modules/vitest/vitest.mjs run --pool=threads apps/workspace-web/app/page.test.tsx -t "clears identity and workflow links when the session expires"`:
  **1 passed**; 15 other tests in that file filtered out.
- `pnpm test`: **306 passed, 0 failed, 81 skipped**. The skips are opt-in
  PostgreSQL integration cases; database opt-in variables were unset and no
  database was connected. Public web: 22 passed; workspace web: 104 passed,
  including Administrator screen: 5 passed and shared Bureau/Administrator
  reliability: 23 passed.
- `pnpm lint`: passed.
- `pnpm typecheck`: passed (includes repository build).
- `pnpm build`: passed; public-web and workspace-web production builds
  completed with the explicit origins.
- Scoped Prettier check on the seven changed project files: passed.
- `docker compose --env-file .env.example --profile core config --quiet`:
  passed.
- `docker compose --env-file .env.example --profile core --profile identity --profile search --profile app config --quiet`:
  passed. No images or containers were built or started.
- `git diff --check`: passed.

An initial scoped Prettier check reported drift in the seven integrated files;
only those files were formatted, then the scoped check passed. No repository-wide
format operation was run in this integration worktree.

## Not Verified

- Antigravity previously reported a timing-sensitive failure in the full
  workspace suite; its focused Administrator tests passed. The integrated suite
  was rerun here and passed as recorded above.
- GitHub Actions has not run for this candidate.
- PostgreSQL `81/81` evidence remains anchored to source `f64e5ab5a21c8017df208e5b432fa1e685bbd7fe`; it was not rerun for these UI/configuration/test changes.
- Visual/browser accessibility review and real-auth browser acceptance remain
  pending. No browser journey was launched.
