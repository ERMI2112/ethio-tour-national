// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
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

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
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
    expect(screen.getByText('Submitted application version 3')).toBeDefined();
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
    expect(screen.getByText('Submitted application version 3')).toBeDefined();

    const refreshButton = screen.getByRole('button', { name: 'Refresh workspace' });
    fireEvent.click(refreshButton);

    await screen.findByText('Submitted application version 4');
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

  it('hides the previous identity workspace immediately and ignores its pending refresh', async () => {
    const oldIdentityRefresh = deferred<HotelApplicationResponse>();
    const newIdentityLoad = deferred<HotelApplicationResponse>();
    const oldIdentityApp = createAdmittedApp('app-identity', 'Identity A Private Hotel');
    let oldIdentityCalls = 0;
    mockApi.getAdmittedHotelWorkspace.mockImplementation(
      (applicationId: string, { accessToken }: { accessToken: string }) => {
        if (accessToken === 'token-a') {
          oldIdentityCalls++;
          return oldIdentityCalls === 1
            ? Promise.resolve(oldIdentityApp)
            : oldIdentityRefresh.promise;
        }
        return newIdentityLoad.promise;
      },
    );
    const params = Promise.resolve({ id: 'app-identity' });
    const { rerender } = render(
      <HotelPilotSessionProvider accessToken="token-a">
        <AdmittedHotelWorkspacePage params={params} />
      </HotelPilotSessionProvider>,
    );

    await screen.findByText('Identity A Private Hotel');
    fireEvent.click(screen.getByRole('button', { name: 'Refresh workspace' }));
    await waitFor(() => expect(mockApi.getAdmittedHotelWorkspace).toHaveBeenCalledTimes(2));

    rerender(
      <HotelPilotSessionProvider accessToken="token-b">
        <AdmittedHotelWorkspacePage params={params} />
      </HotelPilotSessionProvider>,
    );
    expect(screen.queryByText('Identity A Private Hotel')).toBeNull();
    await waitFor(() => expect(mockApi.getAdmittedHotelWorkspace).toHaveBeenCalledTimes(3));
    expect(screen.queryByText('Identity A Private Hotel')).toBeNull();

    const { ApiClientError } = await import('@ethio-tour/api-client');
    await act(async () =>
      newIdentityLoad.reject(new ApiClientError('Forbidden', 403, 'forbidden')),
    );
    await screen.findByText(/Access denied/);
    await act(async () => oldIdentityRefresh.resolve(oldIdentityApp));

    expect(screen.queryByRole('article', { name: 'Admitted hotel workspace' })).toBeNull();
    expect(screen.queryByText('Identity A Private Hotel')).toBeNull();
    expect(screen.getByRole('alert').textContent).toContain('Access denied');
  });

  it('does not render an old application response after the route ID changes', async () => {
    const oldRouteResponse = deferred<HotelApplicationResponse>();
    const oldApp = createAdmittedApp('app-old-route', 'Old Route Private Hotel');
    const newApp = createAdmittedApp('app-new-route', 'New Route Private Hotel');
    mockApi.getAdmittedHotelWorkspace
      .mockImplementationOnce(() => oldRouteResponse.promise)
      .mockResolvedValueOnce(newApp);

    const { rerender } = render(
      <HotelPilotSessionProvider accessToken="same-token">
        <AdmittedHotelWorkspacePage params={Promise.resolve({ id: 'app-old-route' })} />
      </HotelPilotSessionProvider>,
    );
    await waitFor(() => expect(mockApi.getAdmittedHotelWorkspace).toHaveBeenCalledTimes(1));

    rerender(
      <HotelPilotSessionProvider accessToken="same-token">
        <AdmittedHotelWorkspacePage params={Promise.resolve({ id: 'app-new-route' })} />
      </HotelPilotSessionProvider>,
    );
    await screen.findByText('New Route Private Hotel');
    await act(async () => oldRouteResponse.resolve(oldApp));

    expect(screen.queryByText('Old Route Private Hotel')).toBeNull();
    expect(screen.getByText('New Route Private Hotel')).toBeDefined();
    expect(mockApi.getAdmittedHotelWorkspace).toHaveBeenNthCalledWith(1, 'app-old-route', {
      accessToken: 'same-token',
    });
    expect(mockApi.getAdmittedHotelWorkspace).toHaveBeenNthCalledWith(2, 'app-new-route', {
      accessToken: 'same-token',
    });
  });

  it('labels a draft separately from the already-admitted submitted version', async () => {
    const draft = createAdmittedApp('app-draft', 'Current private draft hotel');
    draft.status = 'draft';
    draft.currentVersion = 3;
    draft.currentVersionId = 'submitted-version-3';
    draft.admittedVersion = 2;
    mockApi.getAdmittedHotelWorkspace.mockResolvedValueOnce(draft);

    render(
      <HotelPilotSessionProvider accessToken="test-token">
        <AdmittedHotelWorkspacePage params={Promise.resolve({ id: 'app-draft' })} />
      </HotelPilotSessionProvider>,
    );

    await screen.findByText('Draft for next Bureau review · previous submitted version 3');
    expect(screen.getByText('Current private draft hotel')).toBeDefined();
    expect(
      screen.getByText(
        'This is private draft content, not a submitted or approved version. Workspace access remains from admitted version 2.',
      ),
    ).toBeDefined();
    expect(
      screen.getByText(/Admission recorded for submitted version:/).parentElement?.textContent,
    ).toContain('2');
  });
});
