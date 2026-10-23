# EthioTour National

EthioTour National is a new pnpm monorepo for the national tourism platform. Phase 1A contains only the development foundation and infrastructure. The attraction workflow is intentionally not implemented yet.

## Prerequisites

- Docker Desktop with the Linux engine enabled
- Node.js `22.14.0` (the repository pins this in `.nvmrc` and `.node-version`)
- pnpm `12.5.1` (pinned in `package.json`)

## Local startup

1. Copy `.env.example` to `.env`.
2. Replace the local-only password and user placeholders. These values are ignored by Git and must never be committed.
3. Keep the two `NEXT_PUBLIC_*_URL` values set to the local browser origins for this setup.
4. Start the core services:

   ```powershell
   docker compose --env-file .env --profile core up -d
   ```

5. Start the full Phase 1A development stack:

   ```powershell
   docker compose --env-file .env --profile core --profile identity --profile search --profile app up --build
   ```

The API applies Drizzle migrations on startup when `RUN_MIGRATIONS=true`. The API is available at `http://localhost:4000/api/health`; the public web shell is at `http://localhost:3000`; the workspace shell is at `http://localhost:3001`.

Local service consoles:

- Mailpit: `http://localhost:8025`
- MinIO: `http://localhost:9001`
- Keycloak: `http://localhost:8080`
- Meilisearch: `http://localhost:7700`

## Browser-facing origins and builds

Next.js embeds the cross-application URLs in each web build. The local values in
`.env.example` are for local Compose use only. Pass the environment file
explicitly with `docker compose --env-file .env`; both origins are required by
the web build configuration and Compose reports a clear missing-variable error.

For deployed builds, set `NEXT_PUBLIC_WORKSPACE_URL` and
`NEXT_PUBLIC_PUBLIC_URL` to the actual HTTP(S) origins that a visitor's browser
can reach. Do not use Docker-only service names or assume localhost is reachable
from remote users. Supply both values during the Next.js image or application
build. The production URL helpers intentionally fail when either origin is
missing or invalid; CI uses explicit localhost test origins without relaxing
that validation.

## Keycloak

Keycloak is an optional `identity` profile for Phase 1A infrastructure checks. It is required before the protected Phase 1B workflow is implemented. It owns passwords and authentication credentials; EthioTour will store only external subject IDs, profiles, memberships, organizations, and grants.

The local realm import contains no users, passwords, private keys, tokens, or client secrets. Set `KEYCLOAK_ADMIN_PASSWORD` only in the ignored `.env` file. No temporary authentication implementation is planned.

## Commands

```powershell
pnpm install
pnpm lint
pnpm format:check
pnpm typecheck
pnpm test
pnpm build
```

Database commands use `DATABASE_URL`:

```powershell
pnpm db:generate
pnpm db:migrate
```

The root `pnpm typecheck`, `pnpm test`, and `pnpm build` scripts build the Next.js
applications. For local non-Compose builds in PowerShell, supply the local
browser origins explicitly before running them:

```powershell
$env:NEXT_PUBLIC_WORKSPACE_URL = "http://localhost:3001"
$env:NEXT_PUBLIC_PUBLIC_URL = "http://localhost:3000"
pnpm typecheck
pnpm test
pnpm build
```

These process values are for local development only. Deployed origins must be
configured for the actual browser-reachable deployment URLs.

## Repository boundaries

The web applications communicate only with the NestJS API. They do not contain database, Redis, MinIO, or Meilisearch clients. The API and worker share the backend-domain, authorization, contracts, and database packages.

No booking, payment, museum, event, AI, mobile, or attraction workflow code belongs in Phase 1A.
