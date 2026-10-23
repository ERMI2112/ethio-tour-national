# Applicant Portal Integration Handoff

**Status:** applicant UI locally integrated; service-free checks passed. No
visual or real-auth browser acceptance.
**Branch:** `integration/hotel-applicant-portal-20261023`.
**Worktree:** `C:\Users\Ermias\Projects\ethio-tour-national-applicant-portal-integration-20261023`.
**Base:** `2f22eff391a42df345f9058c88f5be8af80b63eb`.
**Contributor commit:** `c5b2f6bf810f87fbd4b1495c8dfc2a117b001394`, a direct child
of the base.
**Application/test source:** `279ce92c4f3bb2166a59a9c08a531d24ad34632e`.

## Integrated Work

Antigravity's six-file applicant contribution is preserved as an ancestor; its
worktree remains unchanged. The integration correction in the applicant screen
now blocks submission while any input differs from the server-saved draft.
Only a successful revision save reports the draft as saved, and submission
continues to send the saved application's ID and API concurrency version.
Routing copy describes the configured synthetic pilot mapping and does not
claim official jurisdiction. Prior Bureau decisions are explicitly tied to
their submitted version and location. Admitted workspace views distinguish the
admitted version from later private draft content.

Identity changes immediately hide old applicant inputs and location selection.
The dedicated admitted-workspace route tags data, errors, and loading state to
both the current session token and application ID, preventing stale responses
from displaying for a different identity or route. Existing API authorization
and private history behavior are unchanged.

## Executed Checks

Final application/test source was `279ce92` (before this documentation-only
commit). Commands and results:

- `pnpm --filter @ethio-tour/workspace-web exec vitest run app/hotels/applicant-screen.test.tsx "app/hotels/workspace/[id]/page.test.tsx"`:
  **21 passed, 0 failed, 0 skipped**.
- `pnpm --filter @ethio-tour/workspace-web exec vitest run app/hotel-pilot-ui.test.tsx`:
  **23 passed, 0 failed, 0 skipped**.
- `pnpm --filter @ethio-tour/workspace-web test`:
  **12 files; 125 passed, 0 failed, 0 skipped**.
- `pnpm --filter @ethio-tour/workspace-web lint`: passed.
- `pnpm build`, with process-only
  `NEXT_PUBLIC_WORKSPACE_URL=http://localhost:3001` and
  `NEXT_PUBLIC_PUBLIC_URL=http://localhost:3000`: passed. Both public-web and
  workspace-web production builds completed. These are explicit local/CI test
  origins, not deployment defaults.
- `pnpm --filter @ethio-tour/workspace-web typecheck`: passed after the root
  build generated workspace package declarations. An initial app-only
  typecheck before that build failed to resolve those generated declarations;
  it was a build-order issue, not a source type error.
- Scoped Prettier check on the five changed TypeScript files: passed.
- `git diff --check`: passed.

One full-suite attempt exposed an existing test that clicked Submit with an
unsaved note, contrary to the new guard. The test now verifies that this
submission is blocked, then submits the saved version and checks routing-error
retention. A separate immediate assertion in the filter-preservation test was
made asynchronous with `waitFor`; the final full workspace suite passed as
reported above.

## Not Verified

- PostgreSQL **81/81** remains evidence for source
  `f64e5ab5a21c8017df208e5b432fa1e685bbd7fe`; it was not rerun for this UI-only
  integration.
- Real-auth browser acceptance remains pending. No browser tests, services,
  Docker, Keycloak, or databases were started or accessed.
- No manual visual or full accessibility audit was performed; JSDOM tests are
  structural behavior checks only.
- GitHub Actions was not run for this candidate.
