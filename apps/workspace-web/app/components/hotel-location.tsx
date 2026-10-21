'use client';

import React from 'react';
import type { HotelLocation } from '@ethio-tour/contracts';

export function HotelLocationDetails({
  location,
  submitted = false,
}: Readonly<{
  location: HotelLocation | null;
  submitted?: boolean;
}>) {
  return (
    <div aria-label={submitted ? 'Submitted location' : 'Location preview'}>
      <strong>{submitted ? 'Submitted location' : 'Location'} · Applicant-provided</strong>
      <p>
        {location
          ? location.hierarchy.map((node) => node.label).join(' / ')
          : 'No location recorded.'}
      </p>
    </div>
  );
}

export function HotelLocationSelector({
  id,
  locations,
  value,
  onChange,
  loading,
  error,
  onRetry,
}: Readonly<{
  id: string;
  locations: HotelLocation[];
  value: string;
  onChange: (value: string) => void;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
}>) {
  const selected = locations.find((location) => location.id === value) ?? null;
  return (
    <div className="form-field">
      <label htmlFor={id}>Hotel location</label>
      <select
        id={id}
        name="administrativeUnitId"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={loading || !!error}
      >
        <option value="">Choose a location</option>
        {value && !selected && (
          <option value={value}>Previously selected location unavailable</option>
        )}
        {locations.map((location) => (
          <option key={location.id} value={location.id}>
            {location.label}
          </option>
        ))}
      </select>
      {loading && <p role="status">Loading locations...</p>}
      {error && (
        <div>
          <p className="error-message" role="alert">
            {error}
          </p>
          <button type="button" onClick={onRetry}>
            Retry locations
          </button>
        </div>
      )}
      {!loading && !error && locations.length === 0 && (
        <p>No selectable locations are available.</p>
      )}
      {selected && <HotelLocationDetails location={selected} />}
    </div>
  );
}
