# Synthetic Hotel Onboarding Pilot

This is a private, synthetic workflow ending at EthioTour workspace admission. A Bureau outcome is a pilot review result, not a license, proof of representation, or statement of legal authority. No public hotel listing, booking, subscription, commission, payment, document upload, or accountless hotel registry is included.

## Workflow And Permissions

| Step                  | State/result                    | Who may act                                                                        | Effect                                                                                                                                                                      |
| --------------------- | ------------------------------- | ---------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Create draft          | `draft`                         | Any authenticated applicant profile                                                | Creates a private application owned by the server-resolved profile. It creates no organization membership or provider grant.                                                |
| Submit                | `submitted`                     | Application owner                                                                  | Stores an immutable version and assigns its Bureau case to the one configured synthetic organization and unit.                                                              |
| Request changes       | `changes_requested`             | Authorized Bureau reviewer, on the exact current version                           | The applicant may edit a draft and submit a new immutable version. Earlier decisions remain history.                                                                        |
| Bureau approve        | `approved`, admission `pending` | Authorized independent Bureau reviewer, on the exact current version               | Makes only that version eligible for the separate Administrator queue. It does not admit a provider.                                                                        |
| Bureau reject         | `rejected`                      | Authorized independent Bureau reviewer                                             | Terminal for this pilot; no appeal or retry flow is implemented.                                                                                                            |
| Administrator admit   | admission `admitted`            | Authorized synthetic platform Administrator, after current-version Bureau approval | Atomically creates a non-geographic provider organization, the applicant's first manager membership, private workspace read/edit grants, decision history, and audit event. |
| Administrator decline | admission `declined`            | Authorized synthetic platform Administrator, after current-version Bureau approval | Terminal for this pilot; no retry flow is implemented.                                                                                                                      |

The server uses the verified identity's canonical issuer/subject to resolve the applicant profile. An explicitly configured issuer alias can map to that same canonical identity only if no existing profile under an alias collides with the subject. A collision fails closed; profiles and application ownership are never merged or moved automatically.

The Bureau route is configured on the API with `HOTEL_PILOT_BUREAU_ORGANIZATION_ID` and `HOTEL_PILOT_BUREAU_SCOPE_UNIT_ID`. Both must resolve to existing synthetic rows. A missing, partial, non-synthetic, or invalid pair fails closed. Client-supplied owner, organization, Bureau, geographic scope, and synthetic-status fields are not accepted by request DTOs. The Bureau decision grant must match the assigned organization and scope on one grant; separate grants cannot be combined. The applicant who submitted a version cannot decide that version.

The Administrator organization is configured with `HOTEL_PILOT_ADMIN_ORGANIZATION_ID`; it must be a synthetic organization of type `platform` with no geographic unit. Admission also requires one active `hotel:application:admin:decide` grant in that organization. Decision capabilities remain demo-only and production decision powers are disabled.

On admission the applicant receives only `hotel:workspace:read` and `hotel:workspace:edit` on the newly created synthetic provider organization. The provider organization has no administrative level or geographic unit. No booking, public-listing, subscription, payment, or commercial permission is granted.

If an admitted applicant later submits a new version, the previous Bureau approval is not carried forward: the new version enters Bureau review. The existing private workspace membership and access remain. This pilot has no public or commercial status to suspend.

## API

All endpoints are under `/api` and require a Keycloak bearer access token. Responses contain only the application content and workflow decision summaries appropriate to the caller; they omit external issuer/subject, applicant profile IDs, membership IDs, and provider-organization IDs. There are no public hotel discovery routes or DTOs.

| Method and path                                            | Purpose                                                          | Body                                                                                               |
| ---------------------------------------------------------- | ---------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `POST /api/hotels/applications`                            | Create applicant-owned draft                                     | `{ "content": { "claimedHotelName": "Synthetic example", "applicantNotes": "Pilot-only text." } }` |
| `GET /api/hotels/applications`                             | List caller's applications                                       | none                                                                                               |
| `GET /api/hotels/applications/:applicationId`              | Read caller's application; another owner's ID returns 404        | none                                                                                               |
| `POST /api/hotels/applications/:applicationId/revisions`   | Save draft/correction with optimistic concurrency                | `{ "expectedVersion": 1, "content": { ... } }`                                                     |
| `POST /api/hotels/applications/:applicationId/submit`      | Snapshot and route current draft                                 | `{ "expectedVersion": 2 }`                                                                         |
| `GET /api/bureau/hotel-cases`                              | Read current cases assigned to configured synthetic Bureau route | none                                                                                               |
| `POST /api/bureau/hotel-cases/:caseId/decision`            | Decide exact current submitted version                           | `{ "expectedVersion": 3, "decision": "approve", "reason": "Synthetic pilot review." }`             |
| `GET /api/admin/hotel-admissions`                          | Read current Bureau-approved versions awaiting admission         | none                                                                                               |
| `POST /api/admin/hotel-admissions/:applicationId/decision` | Admit or decline a current approved version                      | `{ "expectedVersion": 4, "decision": "admit", "reason": "Synthetic pilot admission." }`            |
| `GET /api/hotels/workspace/:applicationId`                 | Read admitted applicant's private workspace                      | none                                                                                               |

Decision reasons are required and bounded. Stale versions and already-decided cases return conflict. Missing or unauthorized private records are non-enumerating 404s where ownership/assignment is required. DTO whitelisting strips caller-supplied routing, identity, organization, and synthetic flags.

## Local Synthetic Setup

Apply migrations only to an explicitly disposable local environment. The pilot is disabled unless `HOTEL_PILOT_ENABLED=true`, and it refuses to enable when `NODE_ENV=production`. Configure:

```text
HOTEL_PILOT_ENABLED=true
HOTEL_PILOT_BUREAU_ORGANIZATION_ID=demo-org-hotel-bureau
HOTEL_PILOT_BUREAU_SCOPE_UNIT_ID=demo-unit-federal
HOTEL_PILOT_ADMIN_ORGANIZATION_ID=demo-org-platform-admin
```

The additive demo seed creates these clearly synthetic organizations and optional roles. `DEMO_ACTORS_JSON` may map already-existing Keycloak subject IDs to `hotel-bureau.reviewer` and `platform.hotel-admin`; the identities must be distinct. The seed does not create identity-provider users or store passwords/tokens. Never use real credentials or official data for this pilot. An existing `.env` is loaded by the seed CLI, so review the intended disposable environment before running it; this document contains no credentials.

Issuer configuration separates token identity from key retrieval:

- `KEYCLOAK_CANONICAL_ISSUER_URL` is the one issuer value stored with EthioTour profiles.
- `KEYCLOAK_ISSUER_ALIASES` is an explicit comma-separated list of approved issuer aliases. No localhost or internal-host alias is inferred.
- `KEYCLOAK_ISSUER_URL` is the internal Keycloak realm base used to derive its JWKS endpoint, unless `KEYCLOAK_JWKS_URL` explicitly supplies that endpoint.
- The compatibility `KEYCLOAK_PUBLIC_ISSUER_URL` is used as the canonical issuer only when `KEYCLOAK_CANONICAL_ISSUER_URL` is absent; it does not automatically authorize the internal URL as an alias.

## Data And Verification

Migration `0002_normal_ronan.sql` is additive: it creates application, immutable submitted-version, Bureau-case, Bureau-decision, and Administrator-decision tables; expands allowed demo capabilities; and adds a typed organization model while existing organizations default to `administrative`. It does not backfill hotels or mark any profile verified. Submitted versions and decisions reject database updates/deletes. Admission provisioning and its decision/audit record share one transaction, so a failed organization, membership, grant, or audit write rolls the whole admission back.

Service-free coverage includes DTO authority-field stripping, issuer configuration, capability/scope separation, production disablement, schema/migration shape, and domain workflow checks. The PostgreSQL integration suite requires both `HOTEL_PILOT_TEST_DISPOSABLE=true` and a loopback URL on a non-56320 high port whose database name begins `ethio_tour_hotel_test_`. It assumes migrations have already been applied to that fresh disposable database and intentionally does not delete immutable history. Database-backed tests, migration execution, API runtime, and browser journeys are not implied by passing the service-free checks.

Evidence criteria, retention, legal authority, real office assignments, production jurisdiction, appeals, and public verification wording remain unresolved and are outside this pilot.
