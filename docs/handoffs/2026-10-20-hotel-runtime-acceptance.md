# Synthetic Hotel Runtime Checkpoint

## Source And Evidence Boundary

- Branch: `task/hotel-acceptance-canonical-20261020`.
- Worktree: `C:\Users\Ermias\Projects\ethio-tour-national-hotel-acceptance-canonical-20261020`.
- Base: `2d078c7c71285f56e3bde54c15d72c900ae3c814`.
- Runtime-tested source was that base plus the ten-file patch whose
  `git diff --binary | git hash-object --stdin` fingerprint is
  `27fd60ab974350505a45c89645914389c6bf80e0`. This fingerprint was independently
  reproduced before checkpoint review. It is a Git change-detection fingerprint,
  not a security guarantee or an application image digest.
- Checkpoint review then corrected server/browser default URL precedence and
  added three client tests. The ten-file application patch fingerprint became
  `6c2bb8db492f680ccebfeec542de3b1b7f63fef3` before adding this handoff.
  The resulting commit is therefore **not byte-identical** to the live-tested
  patch. The browser URL behavior is preserved; the new server path is unit-tested
  and rebuilt, but the live journey was not rerun for this final delta.
- The local commit containing this handoff identifies the checkpoint; obtain its
  full SHA with `git log -1 --format=%H -- docs/handoffs/2026-10-20-hotel-runtime-acceptance.md`.
  No push, main merge, remote CI run, or independent final acceptance is claimed.

## Runtime Fixes And Query Review

All changed store queries use bound parameters; no submitted identifiers are
interpolated into SQL.

- The two decision-summary subqueries now select only decisions for
  `current_submitted_version_id`. Superseded decisions remain immutable history
  and cannot describe a newly submitted version as approved/admitted.
- The admitted-workspace existence query selects `provider.id`, replacing the
  nonexistent `organizations.organization_id`. The result is used only for
  existence. Its applicant ownership, active membership, provider-organization
  relationship, exact read capability, synthetic-only and non-production grant
  predicates remain unchanged; the application DTO is loaded separately.
- Both application-lock queries now select `is_synthetic`, which downstream
  authorization requires. Ownership predicates, bound IDs and `FOR UPDATE` locks
  remain intact. This supplies the actual persisted value rather than bypassing
  the synthetic gate.
- The seed grant insert now returns `demo_only` and
  `production_decision_enabled` alongside `id`, allowing the same fail-closed
  validation as its existing-grant path. It creates no additional capabilities.
- Migration `0002_normal_ronan.sql` moves the unique index on
  `hotel_application_versions(application_id,id)` before the composite foreign
  key that references it. The original order failed on a fresh PostgreSQL target.
  No column, constraint definition, default, data rewrite or backfill was added
  by this correction; the resulting schema is unchanged.
- Integration fixtures now exercise mixed grants on a single valid membership;
  queue assertions identify the relevant application rather than requiring every
  unrelated synthetic queue item to disappear. Live selectors distinguish alerts,
  applicant versus case status, and the specific Bureau/Administrator case card.

### Migration Deployment Evidence And Limitation

Local Git records introduce migration 0002 in
`54398784d1e2af15e1a93a07a63ec7976c5e1456`. The earlier verification handoff at
`ethio-tour-national-hotel-verify-20261020/docs/handoffs/2026-10-20-hotel-onboarding-verification.md`
explicitly reports migration application, demo seed and PostgreSQL execution as
not run. The preparation runbook also records no runtime execution at its base.
The only positively established application in this acceptance work is the new
disposable database below. No evidence of application elsewhere was found.

This is **not proof that no unrecorded deployment exists**. No existing database,
migration ledger or shared stack was accessed during checkpoint review. Outside
application remains unestablished. Keep non-disposable rollout blocked until its
owner confirms the ledger and migration hash. If an applied original 0002 is
identified, preserve that deployed migration and prepare a separately reviewed
additive correction/compatible fresh-install sequence. Simply appending 0003
cannot repair a fresh chain that already fails inside 0002. No speculative 0003
was created here.

## API URL Review

`NEXT_PUBLIC_API_BASE_URL` is passed explicitly to both web builds by Compose
and `Dockerfile.web`. Browser requests use it, never the internal Docker hostname.
Server callers prefer `API_BASE_URL`, falling back to the public value for local
process operation. Explicit per-call URLs still override defaults. This matters
because both web home pages call `getApiHealth()` from server components and
Compose provides `http://api:4000/api` as their internal URL. Public-first
precedence everywhere would incorrectly direct those containers to their own
localhost. Focused tests cover both configured values, public-only server fallback,
browser exclusion of the internal URL, and explicit per-call behavior.

## Executed Isolated Runtime Evidence

These are the completed earlier runtime runs, not executions during documentation
review. Node `22.14.0`, pnpm `12.5.1`; all final commands listed here exited 0.

- Project: `et-hotel-acceptance-2d078c7-20261020`. New loopback PostGIS port
  `55471`, database `ethio_tour_hotel_test_2d078c7_20261020`; no existing database
  was used. Before mutation, task labels, port, database name and effective target
  were checked. Dedicated migration/test variables cannot fall back to a general
  `DATABASE_URL`; seed execution used an empty working directory to avoid `.env`
  loading. No application `.env` was read or changed.
- `pnpm db:migrate:hotel-test`: fresh migration chain 0000 through 0002 completed;
  three migration ledger entries confirmed. The synthetic seed CLI
  (`packages/db/src/demo-seed-cli.ts`, from the empty working directory) provisioned
  two synthetic officer actors. Canonical issuer/subject bindings, distinct active
  memberships, exact grants/scopes and disabled production decision powers were
  verified. The applicant had no provider access before admission.
- `pnpm test:hotel:integration`: **13 passed, 0 failed, 0 skipped**, final run
  5.61 seconds. Includes ownership/privacy, issuer collision, routing/grant denial,
  immutable/current-version decisions, concurrent/stale outcomes, Bureau-first
  admission, atomic rollback and private workspace gates.
- `pnpm test:e2e:hotel`: **1 passed, 0 failed, 0 skipped**, final run 9.5 seconds.
  Actual Keycloak PKCE sign-in and real API/database operations: applicant submits;
  independent Bureau actor approves; distinct Administrator admits; applicant
  signs in again and reads the persisted private workspace. Cross-role queue
  denials, foreign application privacy, and pre-admission workspace denial execute.
  No injected authentication, fake token or intercepted API success was used.
- Process-only browser settings: `HOTEL_E2E_DISPOSABLE=true`,
  `HOTEL_E2E_WORKSPACE_URL=http://localhost:55474`,
  `HOTEL_E2E_API_URL=http://localhost:55473/api`,
  `HOTEL_E2E_KEYCLOAK_ISSUER_URL=http://localhost:55472/realms/hotel-acceptance-2d078c7`,
  `HOTEL_E2E_IDENTITIES_FILE=<task-directory>\identities.json`, and
  `PLAYWRIGHT_BROWSERS_PATH=<task-directory>\playwright-browsers`.
  Identity contents and connection credentials are intentionally omitted.
- Temporary Keycloak users initially required missing synthetic profile fields;
  these were completed through Keycloak's normal login/required-action flow.
  Earlier failed migration, wrong test-role login, missing browser download, URL
  and selector attempts are failures corrected before these final runs, not passes.

### Runtime Provenance

- PostGIS: `postgis/postgis:16-3.5`, image ID
  `sha256:94146ac37bc61e2322f88016056c5920729cb8c64c8542ed590af8fc2abdac07`.
- Keycloak: `quay.io/keycloak/keycloak:26.1.2`, image ID
  `sha256:289bfb86e3b7d7ea6cfd54b09e1b1e33c31ee42a39317032afebb6ab54b17c9f`.
- Realm `hotel-acceptance-2d078c7`; canonical issuer as above, JWKS at its
  `/protocol/openid-connect/certs`, audience `ethiotour-api`, client
  `workspace-web`, exact redirect `http://localhost:55474/auth/callback`.
- API and workspace were **local compiled application processes**, not Docker
  application images. Workspace build-time API/issuer/redirect settings matched
  these URLs; its browser bundle was checked for the explicit API URL.
  Application Docker image verification remains **unverified/outside this task**.

## Scoped Checks And Review Follow-up

On the runtime-tested patch: root `pnpm build`, client tests (8), database unit
tests (10), client typecheck, client/domain/database lint, live-spec ESLint and
standalone TypeScript, scoped Prettier and `git diff --check` passed. Compose
template validation passed using
`docker compose --env-file .env.example --profile app config --quiet`; no secret
environment file was needed. These are scoped results, not full root test/lint
or GitHub Actions passes.

The final server/browser URL follow-up is checked separately below. Its extra
three tests change the client total from 8 to **11**; they do not change the
historical 13 PostgreSQL or one browser case count. No runtime services were
started again for checkpoint review.

Executed on the final URL follow-up, all exit 0:

- `pnpm --filter @ethio-tour/api-client test`: **11 passed, 0 failed, 0 skipped**.
- `pnpm --filter @ethio-tour/db test`: **10 passed, 0 failed, 0 skipped**;
  source/guard/unit checks, not another database migration execution.
- `pnpm --filter @ethio-tour/api-client typecheck`,
  `pnpm --filter @ethio-tour/backend-domain typecheck`, and
  `pnpm --filter @ethio-tour/db typecheck`: passed.
- `pnpm --filter @ethio-tour/api-client lint`: passed.
- `pnpm --filter @ethio-tour/backend-domain lint` and
  `pnpm --filter @ethio-tour/db lint`: passed.
- `pnpm exec eslint tests/e2e/hotel-onboarding-live.spec.ts --max-warnings=0` and
  `pnpm exec tsc --noEmit --target es2022 --module commonjs --esModuleInterop --skipLibCheck tests/e2e/hotel-onboarding-live.spec.ts`:
  passed; static browser-spec checks only.
- Scoped `pnpm exec prettier --check` covered the changed YAML, client, store,
  integration fixture, seed, browser spec and this handoff; `git diff --check`
  passed. `.env.example`, Dockerfile and SQL changes were manually inspected.
- `pnpm build`: all packages, API/worker and both Next applications built;
  non-fatal existing Next ESLint-plugin warning. Process-only public build values
  used the same API/issuer/client/redirect URLs above. They describe a removed
  disposable environment, not a new deployment or currently live services.

## Cleanup And Remaining Limitations

The two task-created containers, their two explicitly task-owned fresh volumes,
and task network were removed using that exact task Compose project. Local API
and workspace processes were stopped. Final earlier checks found no task-labelled
containers/volumes or listeners on 55471 through 55474. No existing stack, database
or volume was removed or reset. No connection or binding to port 56320 occurred;
the earlier preflight only checked listener state. Its incident was not altered.

Local-file cleanup is **incomplete**: shell policy rejected removal of
`C:\Users\Ermias\AppData\Local\EthioTour\hotel-acceptance-2d078c7-20261020`
(restricted task credentials/browser cache) and the ignored task metadata
`test-results/hotel-onboarding/.last-run.json`. No deletion retry, alternate method,
or identity-file inspection was performed during checkpoint review.

Synthetic routing is not national jurisdiction or legal licensing authority.
This slice grants private workspace access only: no public hotel listing,
subscription, payment or booking capability. Existing origin-reflecting API CORS
is a known limitation: the successful browser run does not establish a restrictive
production origin policy. Production deployment/policy, outside migration history,
application images and remote CI remain unverified; final independent acceptance
is not claimed by this checkpoint.

## 2026-10-21: Exact-commit URL Follow-up Runtime Verification

This section closes the earlier URL-precedence runtime gap; it does not replace
historical evidence with a claim that every suite ran again.

### Exact Source And Fresh Environment

- Tested application source: **`9d5f2e02868dc7b2a1f6096e93b77f8c58680695`**,
  branch `task/hotel-acceptance-canonical-20261020`, in the worktree above.
  HEAD and a clean tracked/untracked status were checked before provisioning,
  building, and runtime assertions. No application source changed during this run.
  Only this handoff was edited afterward; no push or merge was performed.
- Fresh project: `et-hotel-url-9d5f2e0-20261021`. Provisioning refused an existing
  project or occupied requested ports. PostGIS data and Keycloak data used fresh
  **tmpfs**, not named volumes. No previous realm, database, identity file, account,
  service or storage was reused. Port 56320 was not inspected or used.
- PostgreSQL: `127.0.0.1:55581`, database
  `ethio_tour_hotel_test_url_9d5f2e0`. Before migration, a connection probe checked
  the effective database and role, exact URL equality with the guarded test URL,
  and absence of hotel tables. Application working directories had no `.env` or
  `.env.local`; neither file's contents were opened. Migration used only the
  guarded test target; seeding/API startup used the new empty runtime directory.
- Keycloak issuer: `http://localhost:55582/realms/hotel-url-9d5f2e0`.
  New realm with three distinct synthetic subject IDs and credentials generated
  only inside a newly restricted task directory. Required synthetic names/email
  fields were provided at creation; no required-action workaround was needed.
  Client `workspace-web`, PKCE S256, audience `ethiotour-api`,
  `OIDC_ALLOWED_CLIENTS=workspace-web`, no issuer aliases, JWKS at the issuer's
  `/protocol/openid-connect/certs`. Exact callback:
  `http://localhost:55584/auth/callback`; logout target/web origin:
  `http://localhost:55584/` and `http://localhost:55584`, respectively.
- API process: `http://127.0.0.1:55583/api`. Workspace:
  `http://localhost:55584`. Browser API URL: `http://localhost:55585/api`, a
  task-only transparent relay forwarding genuine requests to the same API.
  No requests or authentication results were simulated in the live journey.
  The relay deliberately returned 503 **only for `/api/health`** to make a
  wrong server URL selection observable. This is external test configuration,
  not a repository or architecture change.
- Build variables: `NEXT_PUBLIC_API_BASE_URL=http://localhost:55585/api`,
  `NEXT_PUBLIC_KEYCLOAK_ISSUER_URL` equal to the issuer above,
  `NEXT_PUBLIC_KEYCLOAK_CLIENT_ID=workspace-web`, and
  `NEXT_PUBLIC_KEYCLOAK_REDIRECT_URI` equal to the callback above.
  Server `API_BASE_URL=http://127.0.0.1:55583/api`. The API's existing entrypoint
  binds `0.0.0.0`; the task containers, web process and relay bind loopback.
  The synthetic API policy ran in development, while workspace used a production
  Next build. No production decision authority was enabled.

### Commands And Actual Results

Temporary launchers were created outside Git in
`C:\Users\Ermias\AppData\Local\EthioTour\hotel-url-9d5f2e0-20261021`.
They supplied process environment values without printing credentials.
The commands below completed with exit **0**, except explicitly noted attempts:

- `docker compose --project-name et-hotel-url-9d5f2e0-20261021 --file <task-directory>\compose.json up -d --pull never`:
  only two new task containers and their network created; both healthy before
  acceptance. Exact images were already local; no registry retry was necessary.
- `pnpm build`: all shared packages, API, worker and both Next applications built
  from the exact source above. Existing Next ESLint-plugin warnings were non-fatal.
- `pnpm db:migrate:hotel-test`: migrations **0000 through 0002 passed** on the
  new database; three ledger entries confirmed. Normal PostGIS-already-present
  and identifier-truncation notices were non-fatal.
- The existing `packages/db/src/demo-seed-cli.ts` was executed through
  `node <repo>\packages\db\node_modules\tsx\dist\cli.mjs <repo>\packages\db\src\demo-seed-cli.ts`
  from the empty runtime directory. It assigned exactly two synthetic officers.
  A read-only probe verified each realm subject's exact pair of active demo-only
  Bureau/Administrator grants and disabled production powers. The applicant had
  no profile or grants before first authentication. No client-created authority
  was used. The Bureau route remains the existing synthetic demo route.
- `pnpm exec playwright install chromium`: fresh task-local Playwright browser
  installation completed. One Winldd download timed out at 30 seconds, then
  Playwright's normal automatic fallback completed successfully.
- Local API launch: `node <repo>\apps\backend\api\dist\main.js` with `PORT=55583`.
  Workspace launch, from its package directory:
  `node node_modules/next/dist/bin/next start --hostname 127.0.0.1 -p 55584`.
- Runtime URL assertion: internal `/api/health` **200**, browser-relay
  `/api/health` **503**, and server-rendered workspace `/` **200** containing
  `API status: ok`. Because the public URL intentionally fails health, this
  verifies that the real server component chose the configured internal URL.
  The compiled browser chunk contained the explicit port-55585 public API URL.
- `pnpm test:e2e:hotel`: **1 passed, 0 failed, 0 skipped**, 11.8 seconds total
  (test 10.4 seconds). Process variables:
  `HOTEL_E2E_DISPOSABLE=true`, `HOTEL_E2E_WORKSPACE_URL=http://localhost:55584`,
  `HOTEL_E2E_API_URL=http://localhost:55585/api`,
  `HOTEL_E2E_KEYCLOAK_ISSUER_URL=http://localhost:55582/realms/hotel-url-9d5f2e0`,
  `HOTEL_E2E_IDENTITIES_FILE=<task-directory>\identities.json`,
  `PLAYWRIGHT_BROWSERS_PATH=<task-directory>\playwright-browsers`.
  The committed spec checked the actual browser API origin/path and real PKCE
  exchange, then executed applicant submission, scoped independent Bureau review,
  Administrator admission, repeated applicant sign-in and persisted private
  workspace access, including its cross-role/privacy denials. The relay forwarded
  **37 real API requests**; bearer tokens and responses were passed through, not
  fabricated. Screenshots, traces and video stayed disabled.
- PostgreSQL integration suite: **not rerun by design**. This delta changes URL
  selection, not database behavior; the browser setup required fresh migrations
  and the synthetic seed, not another integration-suite execution. Earlier
  **13/13** results remain separately attributed above, not counted as this run.
- Initial operator-only failures: the seed launcher first referenced a nonexistent
  root `tsx` path (exit 1 before seeding), then was corrected to the package path;
  an HTTP-probe variable named `$home` collided with PowerShell's read-only HOME
  (exit 1), then the identical assertions passed with a different variable name.
  An optional multi-file artifact-hash command had a PowerShell argument error;
  it did not affect source, builds or acceptance. No application fixes, weaker
  assertions, auth bypasses, or failed live-browser test attempts were needed.

### Build And Infrastructure Provenance

- PostGIS container ID:
  `ac33137a130b5e22a69786c6c893a1bc22c66796dff8ff127f9a9418678ab757`;
  image `postgis/postgis:16-3.5`, image ID
  `sha256:94146ac37bc61e2322f88016056c5920729cb8c64c8542ed590af8fc2abdac07`.
- Keycloak container ID:
  `4e610afa3e718b95f1c8fd6fcafcf986d3840db7c07b89b78a1b9ffab2dd0e7c`;
  image `quay.io/keycloak/keycloak:26.1.2`, image ID
  `sha256:289bfb86e3b7d7ea6cfd54b09e1b1e33c31ee42a39317032afebb6ab54b17c9f`.
  Both containers carried the exact task/source labels, checked before cleanup.
- Workspace Next build ID: `bU_fJbODAG4k7GObewvZL`.
  Compiled API `dist/main.js` SHA-256 change-detection fingerprint:
  `6FF190A1D99A21A6F5388744CC72809053D916DCF00D4926C582875AE593ABFE`.
  These are local-process builds, **not application Docker images**. Application
  Docker-image verification, remote CI and independent final acceptance remain
  unverified; they are not established by healthy infrastructure containers.

### Cleanup And Remaining Limits

API, workspace and relay processes were deliberately stopped with Ctrl-C
(their interrupted launcher exit codes were 1, not failed acceptance checks).
`docker compose --project-name et-hotel-url-9d5f2e0-20261021 --file <task-directory>\compose.json down --remove-orphans`
exited **0**, removing only both new task containers and their task network.
Their tmpfs storage disappeared with them; no named volume or shared storage was
created or removed. A separate read-only check confirmed zero task containers,
zero task networks and no listeners on 55581 through 55585.

**Local-file cleanup remains incomplete.** Shell policy rejected the native
PowerShell removal command for this run's new restricted task directory before
execution. No deletion retry, alternative method or policy bypass was attempted.
The directory still contains this run's restricted synthetic identity/configuration
files and browser cache. Previous rejected cleanup targets were left untouched.
The ignored `test-results/hotel-onboarding/.last-run.json` was updated by this run;
it was not deleted or treated as fresh runtime storage. No existing application
stacks, worktrees, databases, realms, credentials or volumes were modified.

The exact-commit **URL precedence/live browser evidence gap is closed**. This is
still synthetic private hotel admission only. The previously documented production
CORS/policy, external migration history, application-image and CI limitations
remain; no whole-platform or independent final acceptance claim is made.
