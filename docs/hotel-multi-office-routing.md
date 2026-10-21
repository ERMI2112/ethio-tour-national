# First Synthetic Multi-office Hotel Routing Slice

This is a private synthetic pilot, not nationwide coverage, a real office
assignment, licensing, or government authority. It extends private onboarding,
not listings, rooms, booking, billing, transfers or appeals.

## Shared API Contract

All endpoints require a real Keycloak bearer token; browsers use
`@ethio-tour/api-client`, never the database or identity administration API.

- `GET /api/hotels/locations` (`getHotelLocations`) returns
  `{ items: HotelLocation[] }`. A location contains only `id`, `label`,
  `parentId` and `hierarchy` (root-to-selected nodes containing the same three
  fields). No offices, mappings, identity records, memberships or grants appear.
  The directory is flat/selectable with an arbitrary-depth hierarchy preview;
  it does not infer levels from array positions.
- Create/update content adds optional `administrativeUnitId` to
  `{ claimedHotelName, applicantNotes }`. It is optional for saving a private
  draft and for reading legacy content, but every new submission requires it.
  Only a server-provided synthetic location with exactly one enabled route can
  submit. A location is applicant-provided information, not verified geography.
- Every private application/case DTO adds `location: HotelLocation | null`.
  For a submitted version this is its stored immutable hierarchy snapshot,
  not a lookup of today's labels. Drafts show their selected current directory
  location when available. This field contains no internal office assignment.
- `POST /api/hotels/applications/:id/submit` still accepts only
  `{ expectedVersion }`; the browser never supplies routing authority.
  Unavailable, inactive or ambiguous routing returns 503 without committing
  a submission, case or success audit. The private draft survives.
- `GET /api/bureau/hotel-cases` returns only current open cases readable through
  one complete active grant for the saved office and geographic scope.
- `GET /api/bureau/hotel-cases/:caseId` (`getHotelBureauCase`) returns the private
  case only when the caller is authorized. Unknown and inaccessible IDs return
  the same 404. Knowing an ID does not authorize a decision.
- Bureau decisions and Administrator admission retain the exact submitted-version
  and optimistic-version checks. Administrator admission requires that current
  version's independent Bureau approval. Changing a draft/location creates no
  new decision authority and cannot reuse a superseded approval.

Example directory item:

```json
{
  "id": "demo-unit-woreda-gondar",
  "label": "Synthetic Gondar Demo Woreda",
  "parentId": "demo-unit-region-a",
  "hierarchy": [
    { "id": "demo-unit-federal", "label": "Synthetic Federal Demo Unit", "parentId": null },
    {
      "id": "demo-unit-region-a",
      "label": "Synthetic Region A Demo Unit",
      "parentId": "demo-unit-federal"
    },
    {
      "id": "demo-unit-woreda-gondar",
      "label": "Synthetic Gondar Demo Woreda",
      "parentId": "demo-unit-region-a"
    }
  ]
}
```

## Server-owned Assignment And Legacy Records

Server-owned location/route tables replace the single environment-based office
assignment for new submissions. Two explicit synthetic locations route to two
separate synthetic offices. The selected location is also the case's geographic
scope. Assignment is rechecked while submitting inside the database transaction,
then recorded with the immutable version and case. No transfer/reassignment API
is introduced. Ancestors are resolved server-side for descendant-scoped grants;
capability, assigned office, active membership and geography must be satisfied
by one grant, never combined from separate grants.

Migration 0002 remains unchanged. The additive migration introduces nullable
version metadata so existing immutable versions need no update and existing
whole-version immutability remains enforced. No legacy location is invented.
Location-less drafts can still be read/saved, but must select a valid location
before another submission. Already-submitted cases, decisions and admissions
retain their original saved assignment and history even if current routing changes.
Existing admitted private access remains; a new version needs new Bureau review.
No historical approval is reinterpreted as approval of newly supplied geography.

## Decisions Still Outside This Slice

Real administrative datasets, office authority, representation/evidence criteria,
retention, national routing ownership, route administration and reassignment,
appeals, production identity policy and public verification wording remain open.
The two demo routes and demo grants establish no real territorial mandate.
Runtime evidence, exact tested source and cleanup will be recorded in the task
handoff separately; this design/API description does not claim tests passed.
