# First Synthetic Multi-office Hotel Routing: Evidence Handoff

Date: 21 October 2026. Scope: private hotel onboarding only, not nationwide
coverage, licensing, or government authority. No push or main merge.

## Source And Ownership

- Base: `1cd37f5f8d8419f2911d0a99392233c508f5ad20`.
- Branch: `feature/hotel-multi-office-pilot`.
- Worktree: `C:\Users\Ermias\Projects\ethio-tour-national-hotel-multi-office-20261021`.
- Implementation checkpoint: `f4fbafd887339d359bf8ae9885e4f6daa1df46d8`.
  Its first browser attempt failed; it is not the final runtime-tested source.
- Corrected application source: **`6f18512a5b3ac88af7ad41c0329df21f54e1ad68`**.
  Full repository gates were rerun on this source.
- Final executed browser-test/candidate source:
  **`a0c464b02c6dd4be1a64c1dfa0b511028d44a12e`**. Between application checkpoint
  6f18512 and this candidate, only the live test changed; `git diff 6f18512 HEAD
-- apps packages` was empty. HEAD/status were checked before runtime execution.
  The subsequent evidence commit changes documentation only.
- Original main-checkout dirty files and all other contributor worktrees were
  left untouched. No old Laravel code or database was accessed. This task never
  connected to, bound, or inspected port 56320.

## Delivered Contract And Behavior

See [the API and legacy contract](../hotel-multi-office-routing.md).

- Protected location directory: `GET /api/hotels/locations`, client
  `getHotelLocations`. Only IDs, synthetic labels, parent IDs and root-to-selected
  hierarchy nodes are returned, with no office mapping, reviewer identity or grant.
- Content adds `administrativeUnitId`; private legacy drafts may omit it, but new
  submissions need a currently enabled synthetic location with exactly one
  enabled server-owned office route. Authority fields are rejected before Nest's
  global whitelist can silently strip them. Browser-supplied owner, office,
  scope, snapshot or permission fields do not choose authority.
- Submission holds the application lock, a route-table SHARE lock (including
  protection against ambiguous-route insertion phantoms), administrative-unit
  SHARE lock, and selected-location row SHARE lock. It rechecks routing inside
  that transaction and records location/hierarchy plus office/scope on the
  immutable version and case. Missing/inactive/ambiguous routing returns 503
  without a submission/case/success-audit commit; the private draft remains.
- Each Bureau case is filtered by a complete active capability, assigned-office
  membership and geographic grant. Ancestors come from a recursive server query,
  not fixed level positions or client data. Directory selection is not authority.
  Queues exclude the other office; unknown and inaccessible
  `GET /api/bureau/hotel-cases/:caseId` both return 404. Known IDs do not authorize
  decisions. A valid capability on a different grant's scope cannot be combined.
- Administrator admission retains independent review and current-submitted-version
  approval checks. It still creates only private provider workspace access, not
  subscriptions, commercial offers, public listings, rooms, booking or billing.
- UI adds location selection, arbitrary-depth preview, the explicit
  **Applicant-provided** label, honest unavailable/empty/retry states, and saved
  snapshot display in applicant/Bureau/Administrator/admitted-workspace views.
  API errors preserve typed form values; 503 submission errors explain that the
  draft was not submitted and may be retried or corrected. A next-version draft
  location is not mislabeled as the previous submitted location.

## Migration And History

`0003_hotel_multi_office.sql` is additive. It introduces `hotel_locations`,
`hotel_location_routes` and nullable immutable-version location/assignment
metadata. Complete-tuple/consistency checks require matching content, snapshot,
scope and location IDs for new server-written metadata. Legacy metadata stays
null; no application, decision, admission or profile is backfilled as verified.
Migration 0002 and its metadata are unchanged. Existing whole-version UPDATE,
DELETE and TRUNCATE rejection is retained; no trigger was weakened or replaced.

Location-less drafts remain readable/editable and must select a valid location
before another submission. Existing submitted cases use their saved assignment
even after routing is disabled. Their location remains unknown, not inferred.
Admitted private access/history survives a new submission; previous approval is
not approval of the new version. A correction creates a new version/case and
does not transfer or rewrite an existing case. No reassignment API is supplied.

The seed adds two explicitly synthetic routes (Gondar demo unit to office A,
Lalibela demo unit to office B), preserves office A's existing assignment, adds
office B independently, and refuses conflicting/inactive/ambiguous seed state.
Reviewer A, reviewer B and Administrator subjects must be distinct. Production
decision powers remain disabled.

## Executed Gates And Counts

Node `22.14.0`, pnpm `12.5.1`. Final commands below exited **0**. Counts are from
the final execution of each suite, not sums of retries.

- `pnpm install --frozen-lockfile`: passed; dependency versions and lockfile unchanged.
- `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm build`,
  `git diff --check`: passed. Typecheck/test root scripts also build all packages,
  API/worker and both Next applications. Existing Next ESLint-plugin and terminal
  color warnings were non-fatal. No framework upgrade was made.
- `pnpm test`: **159 passed, 0 failed, 29 skipped**. Breakdown: contracts 1,
  authorization 9, database unit/guard/seed/schema 27, client 13, domain units 39,
  public web 1, workspace web 38, API 30, worker 1. The 29 skips were the opt-in
  hotel PostgreSQL cases, executed explicitly next with the required flag.
- `pnpm test:hotel:integration`: **29 passed, 0 failed, 0 skipped**, 14.11 seconds.
  `HOTEL_PILOT_TEST_DISPOSABLE=true` and the dedicated guarded target were supplied;
  its config sets `HOTEL_PILOT_TEST_REQUIRED=true` so missing setup cannot skip.
  Coverage includes both offices, private detail/decision denials, 15-node
  ancestry and cycle rejection, mixed grants, seven routing-failure conditions,
  immutable snapshots, route/location write blocking during submission,
  superseded approvals, stale/concurrent decisions, independent review,
  legacy versions and admission rollback. Raw and API-factory clients both
  assert object JSONB storage and successful denial auditing.
- `pnpm test:hotel:migration`: **12 passed, 0 failed, 0 skipped**; shape/guard
  tests, not a substitute for actual migration execution.
- `pnpm db:generate`: no schema changes or extra migration generated.
- `pnpm exec vitest run tests/e2e/hotel-onboarding-config-policy.test.ts`:
  **6 passed, 0 failed, 0 skipped**, separately from root package totals.
- `pnpm exec tsc -p tests/e2e/tsconfig.json --noEmit` and explicit live-spec/support
  ESLint with `--max-warnings=0`: passed, including final test-only changes.
- `pnpm test:e2e:hotel`: **1 passed, 0 failed, 0 skipped**, 13.9 seconds total
  (test 11.6 seconds), on candidate a0c464b and application source 6f18512.
  Real Keycloak PKCE S256, signed token validation and genuine API/database writes;
  no injected actor, mocked success, token paste or browser-auth bypass.

The one live test executes two applications and four distinct identities: selects
each location, proves wrong-office queue exclusion, known-case 404/privacy and
decision denial in both directions, approves through the correct offices, admits
both through the Administrator, checks submitted snapshots in every private view,
and reads persisted private workspaces. A hard navigation asserts signed-out
behavior, then real PKCE reauthentication confirms persisted status and snapshots.
Both reviewers and the Administrator still receive 404 for the applicant's private
workspaces. Screenshots, traces and video remain disabled.

## Fresh Environment And Actual Migration Execution

Project: `et-hotel-multi-20261021-a`. Only two new containers, one new network,
tmpfs data and external task-owned configuration were used; no named volumes.

- PostGIS loopback `127.0.0.1:55611`. Integration database:
  `ethio_tour_hotel_test_multi_20261021_a`.
- Separate upgrade database: `ethio_tour_hotel_test_multi_upgrade_a`.
- Separate clean browser database: `ethio_tour_hotel_test_multi_browser_20261021_a`.
  It did not reuse the integration suite's randomized fixtures.
- Canonical browser issuer:
  `http://localhost:55612/realms/hotel-multi-office-pilot`.
  JWKS at its `/protocol/openid-connect/certs`; API audience `ethiotour-api`,
  allowed client `workspace-web`, no aliases. Callback exactly
  `http://localhost:55614/auth/callback`, logout `http://localhost:55614/`,
  workspace origin `http://localhost:55614`.
- API `http://localhost:55613/api`, workspace `http://localhost:55614`.
  Browser build used explicit `NEXT_PUBLIC_API_BASE_URL` and matching issuer,
  client and redirect variables. Server `API_BASE_URL=http://127.0.0.1:55613/api`.
  Compiled browser URL and server-rendered home health were verified. As in the
  baseline, the API entrypoint binds all interfaces; infrastructure/web bind loopback.
- Before each fresh database migration/seed, effective host/port/name/role,
  task ownership and empty hotel schema were verified. Environment-file existence
  was checked without opening contents; API and seed used an empty task working
  directory. No root/main `.env` or existing credential file was used.
- `pnpm db:migrate:hotel-test` applied **0000 through 0003** to integration and
  browser databases; four ledger entries verified. Synthetic seed execution from
  the empty directory assigned three officers; canonical issuer/subjects, exact
  memberships/grants and two routes were checked without displaying identity data.
- The separate real upgrade probe applied 0000 through 0002, created explicitly
  synthetic legacy profile/version/case/approval/admission/private-grant fixtures,
  then applied 0003. **One upgrade scenario passed**, comparing ten table snapshots
  including saved office/scope; legacy metadata remained null, admission/grants
  unchanged, and whole-version mutation still rejected. It created only that
  new database inside this task's new container, not an existing application DB.

Temporary commands were run through `<task-directory>\run.ps1` modes `migrate`,
`seed`, `integration`, `upgrade`, `build`, `quality`, `api`, `web` and `browser`.
Migration command: `pnpm db:migrate:hotel-test`. Seed command:
`node <repo>\packages\db\node_modules\tsx\dist\cli.mjs <repo>\packages\db\src\demo-seed-cli.ts`
from the empty working directory. API command: `node apps/backend/api/dist/main.js`
(absolute script path with `PORT=55613`). Workspace command from its package:
`node node_modules/next/dist/bin/next start --hostname 127.0.0.1 -p 55614`.
The upgrade used `<task-directory>\upgrade.cjs` with the guarded new target.

For the browser, process-only `HOTEL_E2E_DISPOSABLE=true`, workspace/API/issuer
variables above, and `HOTEL_E2E_IDENTITIES_FILE=<task-directory>\identities.json`
were supplied. Keys: `applicant`, `bureauReviewer`, `bureauReviewerB`,
`administrator`. Seed role keys: `hotel-bureau.reviewer`,
`hotel-bureau-b.reviewer`, `platform.hotel-admin`. Credentials and subjects are
intentionally omitted. Provision new credentials for any subsequent run.

## Provenance, Initial Failures And Limits

- PostGIS `postgis/postgis:16-3.5`, image ID
  `sha256:94146ac37bc61e2322f88016056c5920729cb8c64c8542ed590af8fc2abdac07`;
  container `478fe110b68f32d1d9d9e567cc6124f4d914eec98f7419f79bdf3d24000a3f57`.
- Keycloak `quay.io/keycloak/keycloak:26.1.2`, image ID
  `sha256:289bfb86e3b7d7ea6cfd54b09e1b1e33c31ee42a39317032afebb6ab54b17c9f`;
  container `d2f8816016c59262504484fd2680ea3edb68257c464d29765b552c86fb1695ee`.
  Both were task-labelled and healthy before cleanup.
- Final workspace build ID: `AhUMRhOLNQ3jBWqjmbaZ5`. Compiled hotel-store SHA-256
  change-detection fingerprint:
  `748873EF41A39CB0FD2919DB395B68203E9F3D61115ACF2147C9BA9013AE109D`.
  This is provenance/change detection, not a security guarantee. Applications ran
  as local compiled processes; application Docker-image verification is **unverified**.
- First PostgreSQL attempt: **11 passed, 14 failed**, due to double-encoded JSON
  violating the new consistency check. The first correction passed raw-client
  tests but a real API attempt exposed Drizzle's serializer overrides (500 during
  denial auditing). Final code binds JSON text with `::text::jsonb`, leaving all
  consistency checks intact. Both raw/API-factory variants now execute in the
  29-case suite; old string drafts remain readable without rewriting history.
- Earlier live attempts failed once on that API bug, once on expecting in-memory
  tokens to survive hard navigation, and once on asserting before second-workspace
  navigation completed. Each failed run is historical, not counted as a pass.
  The latter fixes are test-only: reauthenticate via real PKCE, and wait for URL/
  destination heading without weakening any private-data or permission assertion.
- Browser dependency install hit timeout/DNS failures for Winldd after Chromium
  downloaded. A normal pinned Chromium launch succeeded with no host/auth guard
  bypass, and the actual final browser suite executed. No endless download retry.
- Initial root format failure was mostly Windows CRLF checkout normalization;
  unchanged-content paths added no Git diff. One existing session-provider JSX
  line received formatting only. A test-only relative canonical-contract type
  import fixed root E2E TypeScript resolution. No dependency/lockfile changes.
- Remaining limits: coarse submission table locks and per-case queue filtering
  are suitable only for this bounded pilot, not national-scale performance claims.
  There is no route-administration/reassignment API. Production authority,
  official geography, evidence/retention and policy remain open. Existing CORS
  reflection was not changed; browser success is not a production CORS audit.
  Remote CI, mobile visual acceptance and independent Freebuff review were not
  performed. No whole-platform or independent final acceptance claim is made.

## Cleanup And Review Handoff

API/workspace processes were stopped deliberately with Ctrl-C (interrupted shell
exit 1, not failed acceptance). The exact task-only command
`docker compose --project-name et-hotel-multi-20261021-a --file <task-directory>\compose.json down --remove-orphans`
exited **0**, removing the two containers/network and their tmpfs data, including
all three new databases and the synthetic realm. Read-only checks confirmed zero
task containers/networks and released ports 55611 through 55614. No shared volume
was created, reset, removed, or pruned.

**Local-file cleanup is incomplete:** shell policy rejected removal of the verified
new restricted directory
`C:\Users\Ermias\AppData\Local\EthioTour\hotel-multi-office-20261021-a`
and this worktree's generated `test-results` directory before execution. No retry,
alternative deletion method or identity-content inspection followed. The external
directory still contains synthetic credentials/configuration and browser cache;
the generated results remain ignored. Earlier blocked-cleanup targets were not
accessed or retried.

Review from base 1cd37f5 to the evidence checkpoint, focusing on version-bound
assignment, complete-grant scope, raw-body rejection and JSON client compatibility.
Application source 6f18512 plus final test source a0c464b is the demonstrated
synthetic two-office candidate. Any further application fix needs affected-service
rebuilds and acceptance reruns, not reuse of the earlier failed candidate's claims.
