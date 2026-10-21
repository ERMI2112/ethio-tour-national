'use client';

import { searchHotelLocations } from '@ethio-tour/api-client';
import type {
  HotelLocation,
  HotelLocationSearchResult,
  HotelLocationSelection,
  HotelSubmittedLocation,
} from '@ethio-tour/contracts';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { describeApiFailure } from '../lib/hotel-pilot-ui-state';

const SEARCH_LIMIT = 20;

type DisplayLocation = HotelLocation | HotelSubmittedLocation | HotelLocationSearchResult;

export function HotelLocationDetails({
  location,
  selection,
  locationState,
  submitted = false,
  applicationVersion,
}: Readonly<{
  location: DisplayLocation | null;
  selection?: HotelLocationSelection | undefined;
  locationState?: 'unselected' | 'current' | 'stale' | 'legacy' | 'submitted_snapshot' | undefined;
  submitted?: boolean;
  applicationVersion?: number | undefined;
}>) {
  const hierarchy = location?.hierarchy ?? [];
  const releaseId =
    location && 'geographyReleaseId' in location
      ? location.geographyReleaseId
      : selection?.geographyReleaseId;
  const unitRevisionId =
    location && 'unitRevisionId' in location ? location.unitRevisionId : selection?.unitRevisionId;
  const locationLabel =
    locationState === 'unselected'
      ? 'No location selected.'
      : locationState === 'legacy'
        ? 'Legacy location snapshot · Applicant-declared location — unverified.'
        : locationState === 'stale'
          ? 'Saved location is stale · Applicant-declared location — unverified.'
          : locationState === 'submitted_snapshot' || submitted
            ? 'Submitted location snapshot · Applicant-declared location — unverified.'
            : 'Applicant-declared location — unverified.';

  return (
    <div aria-label={submitted ? 'Submitted location' : 'Location preview'}>
      <strong>{locationLabel}</strong>
      <p>
        {hierarchy.length > 0
          ? hierarchy.map(locationNodeName).join(' / ')
          : 'No location recorded.'}
      </p>
      {applicationVersion !== undefined && (
        <p className="muted">Application version: {applicationVersion}</p>
      )}
      {releaseId && <p className="muted">Directory release: {releaseId}</p>}
      {unitRevisionId && <p className="muted">Location revision: {unitRevisionId}</p>}
      {locationState === 'stale' && (
        <p className="notice" role="note">
          Search the active directory and confirm a current location before submitting. No successor
          has been selected automatically.
        </p>
      )}
    </div>
  );
}

export function HotelLocationSelector({
  id,
  accessToken,
  value,
  locationSnapshot,
  locationState = 'unselected',
  onChange,
  onSelectionValidityChange,
}: Readonly<{
  id: string;
  accessToken: string;
  value: HotelLocationSelection | null;
  locationSnapshot: DisplayLocation | null;
  locationState?: 'unselected' | 'current' | 'stale' | 'legacy' | 'submitted_snapshot';
  onChange: (value: HotelLocationSelection | null) => void;
  onSelectionValidityChange: (valid: boolean) => void;
}>) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<HotelLocationSearchResult[]>([]);
  const [directoryReleaseId, setDirectoryReleaseId] = useState<string | null>(null);
  const [directoryIsSynthetic, setDirectoryIsSynthetic] = useState<boolean | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedResult, setSelectedResult] = useState<HotelLocationSearchResult | null>(null);
  const requestSequence = useRef(0);
  const activeReleaseRef = useRef<string | null>(null);
  const lastQuery = useRef('');

  const search = useCallback(
    async (searchQuery: string, cursor?: string) => {
      const requestId = ++requestSequence.current;
      lastQuery.current = searchQuery;
      if (cursor) setLoadingMore(true);
      else setLoading(true);
      setError(null);

      try {
        const language =
          typeof document === 'undefined' ? undefined : document.documentElement.lang || undefined;
        const response = await searchHotelLocations(
          {
            query: searchQuery,
            ...(language ? { language } : {}),
            limit: SEARCH_LIMIT,
            ...(cursor ? { cursor } : {}),
          },
          { accessToken },
        );
        if (requestId !== requestSequence.current) return;

        const releaseChanged =
          cursor !== undefined &&
          activeReleaseRef.current !== null &&
          response.directoryRelease.id !== activeReleaseRef.current;
        activeReleaseRef.current = response.directoryRelease.id;
        setDirectoryReleaseId(response.directoryRelease.id);
        setDirectoryIsSynthetic(response.directoryRelease.synthetic);
        setResults((current) =>
          cursor && !releaseChanged ? [...current, ...response.items] : response.items,
        );
        setNextCursor(releaseChanged ? null : response.nextCursor);
        if (releaseChanged) {
          setError('The directory changed during paging. Search again before choosing a location.');
        }
      } catch (requestError) {
        if (requestId !== requestSequence.current) return;
        setNextCursor(null);
        if (
          requestError instanceof Error &&
          'status' in requestError &&
          requestError.status === 409
        ) {
          setError('The location directory changed. Search again and select a current location.');
        } else {
          setError(describeApiFailure(requestError, 'searching locations'));
        }
      } finally {
        if (requestId === requestSequence.current) {
          setLoading(false);
          setLoadingMore(false);
        }
      }
    },
    [accessToken],
  );

  useEffect(() => {
    void search('');
    return () => {
      requestSequence.current += 1;
    };
  }, [search]);

  useEffect(() => {
    if (!value) setSelectedResult(null);
  }, [value]);

  const selectedUnitRevisionMismatch = results.some(
    (result) => result.unitId === value?.unitId && result.unitRevisionId !== value.unitRevisionId,
  );

  const selectionIsCurrent = Boolean(
    value &&
      directoryReleaseId &&
      value.geographyReleaseId === directoryReleaseId &&
      !selectedUnitRevisionMismatch &&
      (selectedResult !== null || (locationState !== 'stale' && locationState !== 'legacy')) &&
      !loading &&
      !loadingMore &&
      !error,
  );

  useEffect(() => {
    onSelectionValidityChange(selectionIsCurrent);
  }, [onSelectionValidityChange, selectionIsCurrent]);

  const staleSelection = Boolean(
    value &&
      !selectedResult &&
      ((directoryReleaseId && value.geographyReleaseId !== directoryReleaseId) ||
        selectedUnitRevisionMismatch ||
        locationState === 'stale' ||
        locationState === 'legacy'),
  );
  const hasSavedSelection = Boolean(
    value && directoryReleaseId && value.geographyReleaseId === directoryReleaseId,
  );
  const selectedUnitStillListed = results.some(
    (result) => result.unitId === value?.unitId && result.unitRevisionId === value?.unitRevisionId,
  );
  const selectValue =
    hasSavedSelection && !selectedUnitRevisionMismatch ? (value?.unitId ?? '') : '';
  const previewLocation = selectedResult ?? locationSnapshot;
  const previewSelection = selectedResult
    ? {
        geographyReleaseId: directoryReleaseId ?? '',
        unitId: selectedResult.unitId,
        unitRevisionId: selectedResult.unitRevisionId,
      }
    : (value ?? undefined);

  function chooseLocation(unitId: string) {
    const result = results.find((candidate) => candidate.unitId === unitId);
    if (!result || !directoryReleaseId) {
      onChange(null);
      setSelectedResult(null);
      return;
    }

    onChange({
      geographyReleaseId: directoryReleaseId,
      unitId: result.unitId,
      unitRevisionId: result.unitRevisionId,
    });
    setSelectedResult(result);
  }

  function searchCurrentQuery() {
    void search(query.trim());
  }

  return (
    <div className="form-field hotel-location-selector">
      <p className="hotel-location-label">Hotel location</p>
      <p className="muted" id={`${id}-help`}>
        Search the directory and choose the location you are declaring. The selection is not
        independently verified.
      </p>
      <label htmlFor={`${id}-search`}>Search locations</label>
      <div className="location-search-row">
        <input
          id={`${id}-search`}
          type="search"
          maxLength={100}
          value={query}
          aria-describedby={`${id}-help`}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              searchCurrentQuery();
            }
          }}
        />
        <button type="button" onClick={searchCurrentQuery} disabled={loading || loadingMore}>
          Search
        </button>
      </div>

      {directoryReleaseId && (
        <p className="muted" role="note">
          Directory release: {directoryReleaseId}
          {directoryIsSynthetic ? ' · Synthetic pilot data' : ''}
        </p>
      )}

      <label htmlFor={`${id}-selection`}>Choose a location</label>
      <select
        id={`${id}-selection`}
        name="locationSelection.unitId"
        value={selectValue}
        aria-describedby={`${id}-help ${id}-selection-status`}
        disabled={loading || !!error || results.length === 0}
        onChange={(event) => chooseLocation(event.target.value)}
      >
        <option value="">Choose a location from search results</option>
        {hasSavedSelection && !selectedUnitStillListed && (
          <option value={value?.unitId}>Saved selection · not in these results</option>
        )}
        {results.map((result) => (
          <option key={`${result.unitId}:${result.unitRevisionId}`} value={result.unitId}>
            {formatLocationPath(result.hierarchy)} · {result.unitType}
          </option>
        ))}
      </select>

      <p id={`${id}-selection-status`} className="muted" role="status" aria-live="polite">
        {loading
          ? 'Searching locations…'
          : loadingMore
            ? 'Loading more locations…'
            : results.length > 0
              ? `${results.length} location${results.length === 1 ? '' : 's'} shown.`
              : ''}
      </p>

      {error && (
        <div>
          <p className="error-message" role="alert">
            {error}
          </p>
          <button type="button" onClick={() => void search(lastQuery.current)} disabled={loading}>
            Retry search
          </button>
        </div>
      )}
      {!loading && !error && results.length === 0 && (
        <p className="empty-state">No locations matched. Try another name or language.</p>
      )}
      {nextCursor && !error && (
        <button
          type="button"
          onClick={() => void search(lastQuery.current, nextCursor)}
          disabled={loading || loadingMore}
        >
          {loadingMore ? 'Loading locations…' : 'Load more locations'}
        </button>
      )}
      {staleSelection && (
        <p className="error-message" role="alert">
          {locationState === 'legacy'
            ? 'This legacy location is not a current directory selection. Search and select a current location; it will not be mapped automatically.'
            : locationState === 'stale' && !selectedUnitRevisionMismatch
              ? 'This saved location is stale. Search and select a current location; it will not be mapped automatically.'
              : selectedUnitRevisionMismatch
                ? 'The saved unit revision differs from this directory result. Search and select the current location; it will not be remapped automatically.'
                : 'This saved selection belongs to an older directory release. Search and select a current location; it will not be mapped automatically.'}
        </p>
      )}
      {value && selectionIsCurrent && !selectedUnitStillListed && !selectedResult && (
        <p className="muted" role="note">
          The saved location reference is in the active release. The server will verify it again
          when you submit.
        </p>
      )}
      {value && !selectionIsCurrent && !staleSelection && !error && !loading && (
        <p className="muted" role="note">
          Search and select a location in the active directory before saving or submitting this
          version.
        </p>
      )}
      {previewLocation && (
        <HotelLocationDetails
          location={previewLocation}
          selection={previewSelection}
          locationState={selectedResult ? 'current' : value ? locationState : undefined}
          submitted={false}
        />
      )}
    </div>
  );
}

function locationNodeName(
  node: HotelLocation['hierarchy'][number] | HotelSubmittedLocation['hierarchy'][number],
) {
  return 'displayName' in node ? node.displayName : node.label;
}

function formatLocationPath(hierarchy: HotelLocationSearchResult['hierarchy']) {
  return hierarchy.map((node) => node.displayName).join(' / ');
}
