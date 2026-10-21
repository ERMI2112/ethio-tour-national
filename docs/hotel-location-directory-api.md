# Hotel Location Directory API Contract

**Status:** shared implementation contract checkpoint; synthetic pilot only.

## Search

`GET /api/hotels/locations?query=&language=&limit=&cursor=` is authenticated and
reads only the currently active, validated geography release. It returns public
location labels and stable references, never Bureau routes, organizations,
reviewer identities, grants, or authorization scopes.

Parameters:

- `query`: optional trimmed search text, at most 100 Unicode characters. Search
  covers names and explicitly stored aliases; it does not promise transliteration.
- `language`: optional BCP 47 language tag, at most 35 characters. It controls
  preferred label ordering, not geographic filtering.
- `limit`: optional integer from 1 through 50; default 20.
- `cursor`: optional opaque continuation cursor bound to the active release and
  normalized query/language and keyset tuple. It is not an authorization token;
  malformed or mismatched cursors return `400 INVALID_QUERY`.

Search normalization is Unicode NFKC, trim, then lowercase. Query text matches
within a stored display name or alias; wildcard characters are treated
literally. If `language` is supplied, label choice prefers that exact tag, then
the same base language, then English, then the lexicographically smallest
language tag/script/name. Matching names collapse to one result per unit; the
chosen matching value is returned as `matchedName`. Results are deterministically
ordered by the normalized selected display label, unit ID, then unit-revision
ID. Each result includes a full root-to-selected hierarchy, so duplicate names
and variable-depth paths remain distinguishable.

```json
{
  "directoryRelease": {
    "id": "synthetic-geography-a",
    "sourceEdition": "synthetic-fixture-v1",
    "effectiveFrom": null,
    "synthetic": true
  },
  "items": [
    {
      "unitId": "synthetic-unit-17",
      "unitRevisionId": "synthetic-unit-revision-17-a",
      "unitType": "demo-locality",
      "displayName": "Example Place",
      "hierarchy": [
        {
          "unitId": "synthetic-root",
          "unitRevisionId": "synthetic-root-a",
          "unitType": "demo-area",
          "displayName": "Example Area"
        },
        {
          "unitId": "synthetic-unit-17",
          "unitRevisionId": "synthetic-unit-revision-17-a",
          "unitType": "demo-locality",
          "displayName": "Example Place"
        }
      ],
      "matchedName": { "value": "Example Place", "language": "en", "script": "Latn" }
    }
  ],
  "nextCursor": null
}
```

## Draft and submission

New draft content uses `locationSelection`:

```json
{
  "geographyReleaseId": "synthetic-geography-a",
  "unitId": "synthetic-unit-17",
  "unitRevisionId": "synthetic-unit-revision-17-a"
}
```

The server revalidates the selection and the active geography/routing release
pair in the submission transaction. The client cannot provide route, Bureau,
organization, scope, release activation, synthetic status, or permission fields.
The submission snapshot records the selected revision and complete hierarchy.
The applicant sees “Applicant-declared location — unverified.” Bureau assignment
is not returned in applicant responses. Application responses return `location`
and `locationState`: `current` or `stale` for an unsubmitted draft selection,
`submitted_snapshot` for a release-bound submitted version, `legacy` for a
pre-directory snapshot, or `unselected` when no location is selected. Historical
legacy locations are displayed from their saved snapshot only; no current
hierarchy is inferred for authorization.

## Errors and stale state

- `400 INVALID_QUERY`: malformed, oversized, or mismatched search cursor. HTTP
  query/body validation also returns `400` for unsupported fields or invalid DTOs.
- `401`: no valid authenticated session.
- `409 LOCATION_RELEASE_STALE`: cursor or submitted selection references a
  release/unit revision that is no longer active for new submissions. Search
  again and ask the applicant to confirm; never silently map to a successor.
- `503 HOTEL_ROUTING_UNAVAILABLE`: no enabled route or multiple applicable
  routes. The private draft remains saved and submission has not occurred.
- `503 LOCATION_DIRECTORY_UNAVAILABLE`: no single valid active geography release.

The exact error envelope follows the existing hotel onboarding exception
filter with an optional `code`: `{ "statusCode": 409, "message": "...", "code":
"LOCATION_RELEASE_STALE" }`. The typed client preserves status and code without
copying server error text. These codes do not expose private routing details.

`getHotelLocations(options)` remains a first-page convenience alias returning
the same `HotelLocationSearchResponse`; all callers deploy with this coordinated
contract update. Legacy `HotelLocation` describes historical snapshots only.

## Authorized case projection

An authorized Bureau case response contains `submittedLocation` and an
`assignment` with routing-release ID, rule ID, organization ID, and scope-unit
ID. It is available only after server-side authorization against the case's
immutable routing and geography releases. Applicant DTOs never include this
assignment. Every decision remains bound to the exact submitted application
version; a later release does not change historical location, route, or scope.
