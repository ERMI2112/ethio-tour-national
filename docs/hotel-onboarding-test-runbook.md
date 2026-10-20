# Hotel Onboarding Backend Test Runbook

This runbook is for a separately provisioned, disposable local test database. It is not production configuration and does not create or start any service. Do not point these commands at an existing EthioTour database, an existing Compose project, or a shared acceptance environment.

## Preconditions

Provision a new PostgreSQL/PostGIS database exclusively for this test run. Bind its published port to loopback only. Use a host port from 50000 through 65535, excluding 56320, and a database name beginning `ethio_tour_hotel_test_`. Prefer storage with an explicit disposable lifetime; the test suite leaves its randomized records in place and does not reset the database. The suite also temporarily creates and drops test-only trigger objects.

The integration test normally skips unless both `HOTEL_PILOT_TEST_DISPOSABLE=true` and `HOTEL_PILOT_TEST_DATABASE_URL` pass its target guard. The guarded runner sets `HOTEL_PILOT_TEST_REQUIRED=true`; with that flag, an absent or invalid target fails before the suite can be reported as a skip. The test also checks that the hotel application table exists, so apply migrations first. Migration command `pnpm db:migrate` reads only the process-level `DATABASE_URL`; it applies all pending migrations in the repository journal, not just the hotel migration. For a fresh database this includes the existing registry baseline and additive hotel migration `0002_normal_ronan.sql`.

Do not use a project `.env` file as the test target. In a new, dedicated PowerShell session, securely set `HOTEL_PILOT_TEST_DATABASE_URL` to the disposable database URL without echoing it. The guarded runner validates the target before migration and prints no URL or credentials:

Only after provisioning, invoke the repository test-only runner:

```powershell
./scripts/hotel-pilot-test.ps1
```

Do not treat a skipped suite as a pass. The suite is guarded with `describe.skipIf`; its report must show zero skipped tests. Review test output for errors only and never add connection URLs, usernames, passwords, or tokens to logs or reports.

Afterward, close the dedicated shell. Do not reset or reuse the database for unrelated tests; the suite intentionally leaves generated application and decision rows behind. Retire its disposable storage only through the separately approved environment-provisioning procedure, not through this test command sequence.

## Scope Limits

This runbook does not provision Keycloak users, assign production authority, or configure a national Bureau routing table. The current route is explicitly synthetic. A real-auth browser journey is prepared in `tests/e2e/hotel-onboarding-live.spec.ts` and configured by `playwright.hotel.config.ts`; it has not been executed as part of this task. It requires a separately provisioned synthetic-only Keycloak realm, the workspace/API applications, and three distinct synthetic accounts with the applicant, Bureau-reviewer, and Administrator permissions needed by the pilot. The journey signs in through Keycloak's authorization-code flow and checks PKCE S256; it does not inject browser authentication.

Set these process environment variables in a dedicated test shell, using local non-secret service URLs and an absolute identity-file path outside the repository. The identity file must contain only accounts created for the disposable synthetic realm; protect it with the operating system's file-access controls. The harness verifies its location and shape, but does not prove account provenance or inspect filesystem permissions.

- `HOTEL_E2E_DISPOSABLE=true`: explicit acknowledgement that all three endpoints target the fresh disposable test environment.
- `HOTEL_E2E_WORKSPACE_URL`: workspace-web origin.
- `HOTEL_E2E_API_URL`: API base URL whose path is exactly `/api`.
- `HOTEL_E2E_KEYCLOAK_ISSUER_URL`: browser-reachable Keycloak realm issuer URL.
- `HOTEL_E2E_IDENTITIES_FILE`: external JSON file with distinct `applicant`, `bureauReviewer`, and `administrator` objects, each containing `username` and `password` fields.

Run `pnpm test:e2e:hotel` only against a fresh disposable environment. The harness rejects non-loopback URLs and the reserved port `56320`, but the explicit opt-in is an operator assertion and cannot prove that local services or storage are fresh. The journey creates synthetic hotel application and decision records and does not clean them up. Keep the identity file out of Git and command output. The Playwright config disables screenshots, traces, and video; `test-results/` is ignored. A successful local service-free TypeScript check is not a live authentication, browser, database, or acceptance result.
