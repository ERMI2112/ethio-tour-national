# Phase 1B Registry Slice

This is a synthetic backend demonstration, not a government service or an assertion of legal authority. The slice implements destination and attraction drafts, immutable revisions, scoped review, approval, publication, public discovery, withdrawal, audit, and an outbox-backed notification record.

## API

All routes use the `/api` prefix. Protected registry routes require a Keycloak-signed bearer access token. The API validates issuer, subject, bearer token type, and allowed authorized party; authorization then resolves the external issuer/subject to an active EthioTour profile, membership, capability grant, organization, and geographic scope. Every part of the grant must match the same grant. A submitted organization or unit identifier is only a selection: it grants no authority by itself. `OIDC_API_AUDIENCE` can bind tokens to this API and must be explicitly configured before production use.

Create a destination:

```http
POST /api/registry/destinations
Authorization: Bearer <access-token>
Content-Type: application/json

{
  "organizationId": "demo-org-woreda-gondar",
  "administrativeUnitId": "demo-unit-woreda-gondar",
  "content": { "title": "Synthetic destination", "summary": "Demonstration text." }
}
```

Create an attraction with the same fields plus `destinationId` at `POST /api/registry/attractions`. The caller must be assigned to the selected organization and unit, and must have a read grant for the destination in that same organization and scope.

| Operation                       | Route                                | Required request fields                               |
| ------------------------------- | ------------------------------------ | ----------------------------------------------------- |
| Read scoped private record      | `GET /api/registry/:id`              | none                                                  |
| Create a new immutable revision | `POST /api/registry/:id/revisions`   | `expectedVersion`, `content`                          |
| Submit current revision         | `POST /api/registry/:id/submit`      | `expectedVersion`, `revisionId`                       |
| Review a submission             | `POST /api/registry/:id/review`      | `expectedVersion`, `revisionId`, `decision`, `reason` |
| Publish an approved revision    | `POST /api/registry/:id/publish`     | `expectedVersion`, `revisionId`                       |
| Withdraw current release        | `POST /api/registry/:id/withdraw`    | `expectedVersion`, `reason`                           |
| Public destination list/detail  | `GET /api/public/destinations[/:id]` | none                                                  |
| Public attraction list/detail   | `GET /api/public/attractions[/:id]`  | none                                                  |

Review decisions are `approve`, `request_changes`, or `reject`. Mutations use optimistic `expectedVersion` checks and return stable HTTP status classes for unauthenticated, forbidden/not-found, invalid, and conflicting state. Private responses include ownership, scope, current revision, revision state, and version. Public responses contain only IDs, destination relationship where applicable, title, summary, and the released revision ID.

The web applications must use the API and must not connect to PostgreSQL, Redis, object storage, or search directly. This backend/contracts slice exposes the endpoints; wiring new review and discovery screens is not included. Public discovery reads the released projection from the API and currently queries PostgreSQL as authority. Meilisearch, media, and private evidence are not part of this slice.

## Workflow Guarantees

- Each resource belongs to one organization and synthetic administrative unit.
- Content revisions, submissions, review decisions, releases, withdrawals, and audit events are append-only in PostgreSQL where history applies.
- A reviewer cannot be the revision author or submitter. A publisher cannot be the author or reviewer.
- Publishing requires an approval for the exact submitted revision. An edit creates a new private revision; the prior public release remains live until the new revision is approved and released.
- Public reads select the active release, require its linked approval, exclude withdrawn releases, and return a strict public DTO. Withdrawal clears the active release pointer in the same transaction as its history, audit event, and outbox event.
- Protected reads and decisions append audit records. Successful state changes, audit, and outbox records share one database transaction.
- The worker drains outbox rows with row locks and idempotent notification inserts. Delivery is an in-database notification record in this slice; email or external push delivery is not implemented.
- Decision grants must be demo-only. The database rejects `production_decision_enabled=true`, and policy evaluation denies production decision grants.

## Synthetic Setup

`pnpm db:migrate` applies additive Drizzle migrations. `pnpm db:seed:demo` inserts only clearly labeled synthetic Federal, Region A/B, Gondar/Lalibela Woreda, and Gondar/Lalibela Kebele units and organizations. The Gondar/Lalibela parent relationships are deliberately synthetic and must not be read as official geography.

The seed command requires `REGISTRY_POLICY_MODE=demo`, rejects `NODE_ENV=production`, and requires `DEMO_ISSUER` to match the Keycloak realm issuer. `DEMO_ACTORS_JSON` is optional and maps role keys to the `sub` of already existing Keycloak users, for example:

```json
{
  "woreda-gondar.editor": "<existing-editor-subject>",
  "woreda-gondar.reviewer": "<different-reviewer-subject>",
  "woreda-gondar.publisher": "<different-publisher-subject>"
}
```

Supported scope keys are `federal`, `regional-a`, `regional-b`, `woreda-gondar`, `woreda-lalibela`, `kebele-gondar`, and `kebele-lalibela`; each has `editor`, `reviewer`, and `publisher` slots. The seed stores no passwords, tokens, private keys, or authentication credentials. It does not create Keycloak users. It is additive and refuses mismatched pre-existing synthetic units, organizations, or grant scopes rather than overwriting them.

## Official Confirmation Required

Before any real data or authority is enabled, an authorized institution must confirm:

- Official organization names, administrative-unit names, parent relationships, boundaries, and their authoritative source/version.
- Which organizations own registry resources, how stewardship can be delegated, and which roles at each level may create, edit, review, approve, publish, or withdraw.
- Whether reviewer/publisher separation, review steps, reasons, appeal paths, and withdrawal authority match approved policy.
- What makes content restricted, embargoed, unsafe, or otherwise ineligible for public delivery. This slice has no separate restriction/embargo workflow; withdrawal is the only modeled public-delivery block.
- Required public fields, language/translation review, privacy and media rules, audit retention/access, and the production OIDC audience/session/MFA configuration.

Until those confirmations are recorded, these organizations and workflow powers are synthetic demonstration scaffolding only. No booking, payment, museum, event, provider licensing, review, AI, or mobile feature is included.
