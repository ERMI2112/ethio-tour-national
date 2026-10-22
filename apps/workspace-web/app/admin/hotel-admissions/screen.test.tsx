// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import type { HotelApplicationResponse } from '../../lib/hotel-pilot-ui-state';
import { HotelPilotSessionProvider } from '../../lib/hotel-pilot-session';
import { AdminHotelAdmissionsScreen } from './screen';

const mockApi = vi.hoisted(() => ({
  API_UNAUTHORIZED_EVENT: 'ethio-tour:unauthorized',
  searchHotelLocations: vi.fn(),
  getHotelAdmissionQueue: vi.fn(),
  decideHotelAdmission: vi.fn(),
}));

vi.mock('@ethio-tour/api-client', () => ({
  ...mockApi,
  ApiClientError: class ApiClientError extends Error {
    public constructor(
      message: string,
      public readonly status: number,
      public readonly code?: string,
    ) {
      super(message);
      this.name = 'ApiClientError';
    }
  },
}));

function application(
  id: string,
  hotelName: string,
  locationName: string,
  overrides: Partial<HotelApplicationResponse> = {},
): HotelApplicationResponse {
  const currentVersion = overrides.currentVersion ?? 4;
  return {
    id,
    status: 'approved',
    admissionStatus: 'pending',
    currentVersion,
    currentVersionId: `${id}-revision-${currentVersion}`,
    admittedVersion: null,
    content: {
      claimedHotelName: hotelName,
      applicantNotes: `Notes for ${hotelName}`,
    },
    location: {
      geographyReleaseId: 'synthetic-geography-a',
      unitId: `${id}-unit`,
      unitRevisionId: `${id}-unit-revision`,
      unitType: 'woreda',
      displayName: locationName,
      hierarchy: [
        {
          unitId: `${id}-parent`,
          unitRevisionId: `${id}-parent-revision`,
          unitType: 'region',
          displayName: 'Synthetic Region',
        },
        {
          unitId: `${id}-unit`,
          unitRevisionId: `${id}-unit-revision`,
          unitType: 'woreda',
          displayName: locationName,
        },
      ],
    },
    locationState: 'submitted_snapshot',
    bureauDecision: {
      decision: 'approve',
      applicationVersion: currentVersion,
      reason: 'Synthetic pilot Bureau review completed.',
      decidedAt: '2026-10-21T10:00:00.000Z',
    },
    admissionDecision: null,
    historicalBureauDecisions: [],
    historicalAdmissionDecisions: [],
    workspaceAccess: 'not_admitted',
    notice:
      'Synthetic pilot review result; not a license or proof of authority to represent a hotel.',
    version: 18,
    ...overrides,
  };
}

describe('Administrator hotel admission queue', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockApi.getHotelAdmissionQueue.mockResolvedValue({ items: [] });
  });

  afterEach(() => cleanup());

  it('searches only loaded applications, reports loaded counts, and distinguishes no matches from an empty queue', async () => {
    const gondar = application('app-gondar', 'Gondar Horizon Hotel', 'Gondar Town');
    const lalibela = application('app-lalibela', 'Lalibela Hills Hotel', 'Lalibela Town');
    mockApi.getHotelAdmissionQueue.mockResolvedValueOnce({ items: [gondar, lalibela] });

    render(
      <HotelPilotSessionProvider accessToken="admin-token">
        <AdminHotelAdmissionsScreen />
      </HotelPilotSessionProvider>,
    );

    await screen.findByRole('article', { name: 'Gondar Horizon Hotel' });
    expect(screen.getByText('Showing 2 of 2 loaded eligible applications')).toBeDefined();

    const search = screen.getByRole('searchbox', { name: 'Search loaded applications' });
    fireEvent.change(search, { target: { value: 'Gondar Town' } });
    expect(screen.getByText('Showing 1 of 2 loaded eligible applications')).toBeDefined();
    expect(screen.getByRole('article', { name: 'Gondar Horizon Hotel' })).toBeDefined();
    expect(screen.queryByRole('article', { name: 'Lalibela Hills Hotel' })).toBeNull();
    expect(mockApi.getHotelAdmissionQueue).toHaveBeenCalledTimes(1);

    fireEvent.change(search, { target: { value: 'no loaded match' } });
    expect(screen.getByText('Showing 0 of 2 loaded eligible applications')).toBeDefined();
    expect(screen.getByText(/No loaded applications match this search/)).toBeDefined();
    expect(screen.queryByText('No eligible applications were returned by the API.')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Clear search' }));
    expect(screen.getByText('Showing 2 of 2 loaded eligible applications')).toBeDefined();
    expect(screen.getByRole('article', { name: 'Lalibela Hills Hotel' })).toBeDefined();
  });

  it('clears loaded private rows and search text when the queue request is denied', async () => {
    const { ApiClientError } = await import('@ethio-tour/api-client');
    mockApi.getHotelAdmissionQueue.mockResolvedValueOnce({
      items: [application('app-private', 'Private Synthetic Hotel', 'Gondar Town')],
    });

    render(
      <HotelPilotSessionProvider accessToken="admin-token">
        <AdminHotelAdmissionsScreen />
      </HotelPilotSessionProvider>,
    );

    await screen.findByRole('article', { name: 'Private Synthetic Hotel' });
    const search = screen.getByRole('searchbox', { name: 'Search loaded applications' });
    fireEvent.change(search, { target: { value: 'Gondar' } });
    mockApi.getHotelAdmissionQueue.mockRejectedValueOnce(
      new ApiClientError('Forbidden', 403, 'forbidden'),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Refresh queue' }));

    expect(await screen.findByText('Access denied')).toBeDefined();
    expect(screen.queryByRole('article', { name: 'Private Synthetic Hotel' })).toBeNull();
    expect(
      (screen.getByRole('searchbox', { name: 'Search loaded applications' }) as HTMLInputElement)
        .value,
    ).toBe('');
  });

  it('shows decision-time 403 as denied instead of an empty successful queue', async () => {
    const { ApiClientError } = await import('@ethio-tour/api-client');
    mockApi.getHotelAdmissionQueue.mockResolvedValueOnce({
      items: [application('app-private', 'Private Synthetic Hotel', 'Gondar Town')],
    });
    mockApi.decideHotelAdmission.mockRejectedValueOnce(
      new ApiClientError('Forbidden', 403, 'forbidden'),
    );

    render(
      <HotelPilotSessionProvider accessToken="admin-token">
        <AdminHotelAdmissionsScreen />
      </HotelPilotSessionProvider>,
    );

    const card = await screen.findByRole('article', { name: 'Private Synthetic Hotel' });
    fireEvent.change(within(card).getByLabelText('Private platform admission decision'), {
      target: { value: 'decline' },
    });
    fireEvent.change(within(card).getByLabelText('Reason'), {
      target: { value: 'Decision permission is no longer active.' },
    });
    fireEvent.click(
      within(card).getByRole('button', { name: 'Record private admission decision' }),
    );

    expect(await screen.findByText('Access denied')).toBeDefined();
    expect(screen.queryByRole('article', { name: 'Private Synthetic Hotel' })).toBeNull();
    expect(screen.queryByText('No eligible applications were returned by the API.')).toBeNull();
  });

  it('shows a sanitized queue failure and allows the Administrator to retry', async () => {
    mockApi.getHotelAdmissionQueue.mockRejectedValueOnce(
      new TypeError('Failed to fetch: connect ECONNREFUSED 127.0.0.1:4000'),
    );

    render(
      <HotelPilotSessionProvider accessToken="admin-token">
        <AdminHotelAdmissionsScreen />
      </HotelPilotSessionProvider>,
    );

    expect(await screen.findByText('Queue unavailable')).toBeDefined();
    expect(screen.getByRole('alert').textContent).toContain('Check the connection and retry');
    expect(screen.getByRole('alert').textContent).not.toContain('ECONNREFUSED');
    expect(screen.getByRole('button', { name: 'Refresh queue' })).toBeDefined();

    mockApi.getHotelAdmissionQueue.mockResolvedValueOnce({
      items: [application('app-retry', 'Retry Synthetic Hotel', 'Gondar Town')],
    });
    fireEvent.click(screen.getByRole('button', { name: 'Refresh queue' }));
    expect(await screen.findByRole('article', { name: 'Retry Synthetic Hotel' })).toBeDefined();
  });

  it('preserves a hidden card form and submits that application ID with its own concurrency version', async () => {
    const gondar = application('app-gondar', 'Gondar Horizon Hotel', 'Gondar Town', {
      currentVersion: 6,
      version: 31,
    });
    const lalibela = application('app-lalibela', 'Lalibela Hills Hotel', 'Lalibela Town', {
      currentVersion: 9,
      version: 47,
    });
    mockApi.getHotelAdmissionQueue
      .mockResolvedValueOnce({ items: [gondar, lalibela] })
      .mockResolvedValueOnce({ items: [lalibela] });
    mockApi.decideHotelAdmission.mockResolvedValueOnce(
      application('app-gondar', 'Gondar Horizon Hotel', 'Gondar Town', {
        currentVersion: 6,
        version: 32,
        admissionStatus: 'admitted',
      }),
    );

    render(
      <HotelPilotSessionProvider accessToken="admin-token">
        <AdminHotelAdmissionsScreen />
      </HotelPilotSessionProvider>,
    );

    const gondarCard = await screen.findByRole('article', { name: 'Gondar Horizon Hotel' });
    fireEvent.change(within(gondarCard).getByLabelText('Private platform admission decision'), {
      target: { value: 'admit' },
    });
    fireEvent.change(within(gondarCard).getByLabelText('Reason'), {
      target: { value: 'Reviewed the current synthetic pilot application.' },
    });

    const search = screen.getByRole('searchbox', { name: 'Search loaded applications' });
    fireEvent.change(search, { target: { value: 'Lalibela' } });
    expect(screen.queryByRole('article', { name: 'Gondar Horizon Hotel' })).toBeNull();
    expect(screen.getByRole('article', { name: 'Lalibela Hills Hotel' })).toBeDefined();

    fireEvent.click(screen.getByRole('button', { name: 'Clear search' }));
    const restoredGondarCard = await screen.findByRole('article', {
      name: 'Gondar Horizon Hotel',
    });
    expect(
      (
        within(restoredGondarCard).getByLabelText(
          'Private platform admission decision',
        ) as HTMLSelectElement
      ).value,
    ).toBe('admit');
    expect((within(restoredGondarCard).getByLabelText('Reason') as HTMLTextAreaElement).value).toBe(
      'Reviewed the current synthetic pilot application.',
    );

    fireEvent.click(
      within(restoredGondarCard).getByRole('button', { name: 'Record private admission decision' }),
    );

    await vi.waitFor(() => {
      expect(mockApi.decideHotelAdmission).toHaveBeenCalledWith(
        'app-gondar',
        {
          expectedVersion: 31,
          decision: 'admit',
          reason: 'Reviewed the current synthetic pilot application.',
        },
        { accessToken: 'admin-token' },
      );
    });
  });
});
