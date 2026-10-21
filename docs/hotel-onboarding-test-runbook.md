# Hotel Onboarding Acceptance-Test Runbook

This is the single test-only runbook for the synthetic hotel pilot. It does not start services,
provision identities, read `.env`, or modify production configuration. The commands below were
prepared initially without services. This runbook is not evidence of execution;
actual source-specific results and cleanup are recorded separately in the acceptance handoffs.

## PostgreSQL Migration And Integration Suite

Provision a **new, dedicated, disposable PostgreSQL/PostGIS database** for this test run. Bind
only to loopback, choose a high host port from `50000` through `65535` other than `56320`, and
use a database name beginning `ethio_tour_hotel_test_`. The test suite creates synthetic rows
and leaves them in place; it does not reset, seed, or clean the database. Its trigger-rejection
case creates and drops only its own test trigger and function.

In a dedicated shell, set these process variables without echoing or copying the URL into logs:

- `HOTEL_PILOT_TEST_DATABASE_URL`: the disposable database connection URL.
- `HOTEL_PILOT_TEST_DISPOSABLE=true`: explicit opt-in for this test target.

Do not source a project `.env` file. The test-only migration CLI reads only
`HOTEL_PILOT_TEST_DATABASE_URL`; it ignores `DATABASE_URL`, refuses `NODE_ENV=production`,
requires the opt-in, and validates PostgreSQL scheme, loopback host, explicit safe port, and the
test database-name prefix before temporarily assigning the validated URL to the migration
client. It never prints the connection URL or credentials. The ordinary `pnpm db:migrate`
command remains the separate general development command and is not called by this test path.

Run these commands in order:

```powershell
pnpm install --frozen-lockfile
pnpm build
pnpm test:hotel:migration
pnpm db:migrate:hotel-test
pnpm test:hotel:integration
```

`pnpm db:migrate:hotel-test` applies the repository's pending Drizzle migration chain to the
validated test-only target. For a fresh database this includes the existing registry baseline
and additive hotel migrations `0002_normal_ronan.sql` and `0003_hotel_multi_office.sql`. It writes no seed data.
`pnpm test:hotel:migration` runs SQL-shape and URL-guard unit tests without connecting to a
database. `pnpm test:hotel:integration` uses a dedicated Vitest config that sets
`HOTEL_PILOT_TEST_REQUIRED=true`; an absent or invalid target fails during test loading instead
of silently reporting a skipped suite. Require the explicit report to show zero skipped tests.

The guard proves the URL has the required shape, not that the database was newly provisioned or
owned by this task. Freshness and task ownership remain operator prerequisites. Do not run this
path against an existing EthioTour database, any existing Compose project, or any shared volume.

## Real-Authentication Browser Journey

The browser journey is `tests/e2e/hotel-onboarding-live.spec.ts`, configured by
`playwright.hotel.config.ts`. It uses the real Keycloak authorization-code + PKCE S256 flow and
four distinct synthetic identities loaded from an external identity file. It creates private
application and decision history and does not clean those rows up. Use a fresh disposable API,
database, Keycloak realm/storage, and workspace-web instance. The harness accepts loopback URLs
only, rejects port `56320`, requires `HOTEL_E2E_DISPOSABLE=true`, and does not prove service or
storage freshness. Keep the identity file outside Git, limit its OS access, and do not print its
contents.

Set these process variables in a dedicated test shell:

- `HOTEL_E2E_DISPOSABLE=true`.
- `HOTEL_E2E_WORKSPACE_URL`: local workspace-web origin.
- `HOTEL_E2E_API_URL`: local API base URL with the `/api` path.
- `HOTEL_E2E_KEYCLOAK_ISSUER_URL`: browser-reachable synthetic realm issuer.
- `HOTEL_E2E_IDENTITIES_FILE`: absolute path to the external identity JSON with distinct
  `applicant`, `bureauReviewer`, `bureauReviewerB`, and `administrator` accounts.

The Keycloak client must be `workspace-web`, allow the exact callback
`<workspace-origin>/auth/callback`, and issue PKCE S256 authorization requests. Its access token
must satisfy the API's configured audience validation. Provision the applicant, synthetic
Bureau-reviewer A, Bureau-reviewer B, and platform-Administrator identities with the permissions required by the
pilot; never use real accounts. The pilot Bureau route and outcomes are synthetic and do not
establish nationwide coverage or government authority.

The committed local realm configuration is not a ready-made isolated browser environment: its
workspace client redirect is tied to `http://localhost:3001/*`. If the disposable workspace
uses another origin, provision a **new disposable realm/client configuration** whose redirect
URI is exactly `<HOTEL_E2E_WORKSPACE_URL>/auth/callback` and whose web origin matches
`HOTEL_E2E_WORKSPACE_URL`; also align its issuer and the API's expected audience. Do not edit or
reuse an existing realm to fit the test. The live spec does not provision users or database
grants, and this runbook contains no user credentials or realm secrets; provisioning and
identity-to-grant binding remain an operator prerequisite.

For this first multi-office slice the supported demo seed binds the reviewer subjects
to `hotel-bureau.reviewer` (office A) and `hotel-bureau-b.reviewer` (office B),
and the Administrator to `platform.hotel-admin`. The applicant gets no reviewer
or provider grant during setup. Use two applications selecting the directory IDs
`demo-unit-woreda-gondar` and `demo-unit-woreda-lalibela`. Never send an office or
grant from the browser as routing authority. Require both wrong-office queue
exclusion and direct detail/decision denial in the real-auth report. No account
or route is created in any existing environment by this runbook.

This journey does not test restrictive CORS policy. At this candidate the API enables CORS with
request-origin reflection (`origin: true` in `apps/backend/api/src/main.ts`), so a passing
browser journey must not be treated as evidence that only the configured workspace origin is
permitted. Resolve that application configuration separately before making a CORS-safety claim.

After the disposable application services and identities have been provisioned independently,
run:

```powershell
pnpm test:e2e:hotel
```

The Playwright config disables screenshots, traces, and video; `test-results/` and
`playwright-report/` are ignored. A service-free typecheck or passing unit tests do not establish
that sign-in, API authorization, migration, or the live browser journey works.
