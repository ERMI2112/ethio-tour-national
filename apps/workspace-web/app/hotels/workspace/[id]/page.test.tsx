// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { HotelApplicationResponse } from '../../../lib/hotel-pilot-ui-state';
import { HotelPilotSessionProvider } from '../../../lib/hotel-pilot-session';
import AdmittedHotelWorkspacePage from './page';

const mockApi = vi.hoisted(() => ({
  API_UNAUTHORIZED_EVENT: 'ethio-tour:unauthorized',
  getAdmittedHotelWorkspace: vi.fn(),
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

function createAdmittedApp(
  id: string,
  claimedHotelName: string,
  overrides: Partial<HotelApplicationResponse> = {},
): HotelApplicationResponse {
  return {
    id,
    status: 'approved',
    admissionStatus: 'admitted',
    currentVersion: 3,
    currentVersionId: `${id}-rev-3`,
    admittedVersion: 2,
    content: {
      claimedHotelName,
      applicantNotes: `Notes for ${claimedHotelName}`,
    },
    location: {
      geographyReleaseId: 'synthetic-geography-2026',
      unitId: 'unit-admitted',
      unitRevisionId: 'rev-admitted-1',
      unitType: 'woreda',
      displayName: 'Admitted Town',
      hierarchy: [
        {
          unitId: 'unit-parent',
          unitRevisionId: 'rev-parent-1',
          unitType: 'region',
          displayName: 'Admitted Region',
        },
        {
          unitId: 'unit-admitted',
          unitRevisionId: 'rev-admitted-1',
          unitType: 'woreda',
          displayName: 'Admitted Town',
        },
      ],
    },
    locationState: 'submitted_snapshot',
    bureauDecision: {
      decision: 'approve',
      applicationVersion: 2,
      reason: 'Bureau approval for version 2.',
      decidedAt: '2026-10-21T10:00:00.000Z',
    },
    admissionDecision: {
      decision: 'admit',
      applicationVersion: 2,
      reason: 'Administrator admission for version 2.',
      decidedAt: '2026-10-21T11:00:00.000Z',
    },
    historicalBureauDecisions: [],
    historicalAdmissionDecisions: [],
    workspaceAccess: 'private_only',
    notice:
      'Synthetic pilot review result; not a license or proof of authority to represent a hotel.',
    version: 12,
    ...overrides,
  };
}

describe('AdmittedHotelWorkspacePage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => cleanup());

  it('renders confirmed admitted workspace and clearly separates admitted version from current version', async () => {
    const admittedApp = createAdmittedApp('app-admitted-1', 'Abyssinia Grand Hotel');
    mockApi.getAdmittedHotelWorkspace.mockResolvedValueOnce(admittedApp);

    render(
      <HotelPilotSessionProvider accessToken="test-token">
        <AdmittedHotelWorkspacePage params={Promise.resolve({ id: 'app-admitted-1' })} />
      </HotelPilotSessionProvider>,
    );

    await screen.findByRole('article', { name: 'Admitted hotel workspace' });

    expect(screen.getByText('Abyssinia Grand Hotel')).toBeDefined();
    expect(screen.getByText('Current application version 3')).toBeDefined();
    expect(
      screen.getByText(/Admission recorded for submitted version:/).parentElement?.textContent,
    ).toContain('2');
    expect(
      screen.getByText(
        'Private workspace access remains available from version 2. Current version 3 is a separate submission; earlier decisions do not approve it.',
      ),
    ).toBeDefined();
    expect(screen.getByText(/Administrator decision for submitted version 2:/)).toBeDefined();
    expect(screen.getByText(/Bureau outcome for submitted version 2:/)).toBeDefined();
    expect(
      screen.getByText(
        'Private workspace access only. No listing, booking, subscription, or payment is enabled.',
      ),
    ).toBeDefined();
  });

  it('refreshes the workspace when the user clicks Refresh workspace', async () => {
    const admittedApp = createAdmittedApp('app-refresh', 'Refresh Grand Hotel');
    mockApi.getAdmittedHotelWorkspace.mockResolvedValueOnce(admittedApp).mockResolvedValueOnce({
      ...admittedApp,
      currentVersion: 4,
    });

    render(
      <HotelPilotSessionProvider accessToken="test-token">
        <AdmittedHotelWorkspacePage params={Promise.resolve({ id: 'app-refresh' })} />
      </HotelPilotSessionProvider>,
    );

    await screen.findByRole('article', { name: 'Admitted hotel workspace' });
    expect(screen.getByText('Current application version 3')).toBeDefined();

    const refreshButton = screen.getByRole('button', { name: 'Refresh workspace' });
    fireEvent.click(refreshButton);

    await screen.findByText('Current application version 4');
    expect(mockApi.getAdmittedHotelWorkspace).toHaveBeenCalledTimes(2);
  });

  it('clears private workspace data when session is revoked with 403', async () => {
    const { ApiClientError } = await import('@ethio-tour/api-client');
    const admittedApp = createAdmittedApp('app-revoked', 'Revoked Hotel');
    mockApi.getAdmittedHotelWorkspace.mockResolvedValueOnce(admittedApp);

    render(
      <HotelPilotSessionProvider accessToken="test-token">
        <AdmittedHotelWorkspacePage params={Promise.resolve({ id: 'app-revoked' })} />
      </HotelPilotSessionProvider>,
    );

    await screen.findByRole('article', { name: 'Admitted hotel workspace' });

    // Refresh fails with 403 Forbidden
    mockApi.getAdmittedHotelWorkspace.mockRejectedValueOnce(
      new ApiClientError('Forbidden', 403, 'forbidden'),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Refresh workspace' }));

    await screen.findByText(/Access denied/);
    expect(screen.queryByRole('article', { name: 'Admitted hotel workspace' })).toBeNull();
  });
});
