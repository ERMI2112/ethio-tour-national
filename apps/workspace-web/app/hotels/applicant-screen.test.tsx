// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import type { HotelApplicationResponse } from '../lib/hotel-pilot-ui-state';
import { HotelPilotSessionProvider } from '../lib/hotel-pilot-session';
import { HotelApplicantScreen } from './applicant-screen';

const mockApi = vi.hoisted(() => ({
  API_UNAUTHORIZED_EVENT: 'ethio-tour:unauthorized',
  searchHotelLocations: vi.fn(),
  getMyHotelApplications: vi.fn(),
  createHotelApplication: vi.fn(),
  createHotelApplicationRevision: vi.fn(),
  submitHotelApplication: vi.fn(),
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

const mockDirectoryRelease = {
  id: 'synthetic-geography-2026',
  sourceEdition: '2026.10',
  effectiveFrom: '2026-10-01',
  synthetic: true,
};

const mockLocationNode = {
  unitId: 'unit-gondar',
  unitRevisionId: 'rev-gondar-1',
  unitType: 'woreda',
  displayName: 'Gondar Town',
  hierarchy: [
    {
      unitId: 'unit-amhara',
      unitRevisionId: 'rev-amhara-1',
      unitType: 'region',
      displayName: 'Amhara Region',
    },
    {
      unitId: 'unit-gondar',
      unitRevisionId: 'rev-gondar-1',
      unitType: 'woreda',
      displayName: 'Gondar Town',
    },
  ],
  matchedName: {
    value: 'Gondar',
    language: 'en',
    script: null,
  },
};

function createMockApp(
  id: string,
  claimedHotelName: string,
  overrides: Partial<HotelApplicationResponse> = {},
): HotelApplicationResponse {
  const currentVersion = overrides.currentVersion ?? 1;
  return {
    id,
    status: 'draft',
    admissionStatus: 'not_eligible',
    currentVersion,
    currentVersionId: null,
    admittedVersion: null,
    content: {
      claimedHotelName,
      applicantNotes: `Notes for ${claimedHotelName}`,
      locationSelection: {
        geographyReleaseId: mockDirectoryRelease.id,
        unitId: 'unit-gondar',
        unitRevisionId: 'rev-gondar-1',
      },
    },
    location: {
      geographyReleaseId: mockDirectoryRelease.id,
      unitId: 'unit-gondar',
      unitRevisionId: 'rev-gondar-1',
      unitType: 'woreda',
      displayName: 'Gondar Town',
      hierarchy: [
        {
          unitId: 'unit-amhara',
          unitRevisionId: 'rev-amhara-1',
          unitType: 'region',
          displayName: 'Amhara Region',
        },
        {
          unitId: 'unit-gondar',
          unitRevisionId: 'rev-gondar-1',
          unitType: 'woreda',
          displayName: 'Gondar Town',
        },
      ],
    },
    locationState: 'current',
    bureauDecision: null,
    admissionDecision: null,
    historicalBureauDecisions: [],
    historicalAdmissionDecisions: [],
    workspaceAccess: 'not_admitted',
    notice:
      'Synthetic pilot review result; not a license or proof of authority to represent a hotel.',
    version: 1,
    ...overrides,
  };
}

describe('HotelApplicantScreen', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockApi.searchHotelLocations.mockResolvedValue({
      directoryRelease: mockDirectoryRelease,
      items: [mockLocationNode],
      nextCursor: null,
    });
    mockApi.getMyHotelApplications.mockResolvedValue({ items: [] });
  });

  afterEach(() => cleanup());

  it('renders overview stats and filters loaded applications with accurate counts', async () => {
    const draftApp = createMockApp('app-1', 'Simien Lodge', { status: 'draft' });
    const admittedApp = createMockApp('app-2', 'Lalibela Rock Hotel', {
      status: 'approved',
      admissionStatus: 'admitted',
      workspaceAccess: 'private_only',
      currentVersion: 2,
      currentVersionId: 'rev-2',
      admittedVersion: 2,
    });

    mockApi.getMyHotelApplications.mockResolvedValueOnce({
      items: [draftApp, admittedApp],
    });

    render(
      <HotelPilotSessionProvider accessToken="test-applicant-token">
        <HotelApplicantScreen />
      </HotelPilotSessionProvider>,
    );

    await screen.findByText('Simien Lodge');
    expect(screen.getByText('Lalibela Rock Hotel')).toBeDefined();

    // Check overview stats
    const overview = screen.getByRole('region', { name: 'Applications overview' });
    expect(within(overview).getByText('Total loaded:').parentElement?.textContent).toContain('2');
    expect(within(overview).getByText('Drafts:').parentElement?.textContent).toContain('1');
    expect(within(overview).getByText('Admitted workspace:').parentElement?.textContent).toContain(
      '1',
    );

    // Filter by name
    const searchInput = screen.getByRole('searchbox', { name: 'Search your applications' });
    fireEvent.change(searchInput, { target: { value: 'Simien' } });

    expect(screen.getByText('Showing 1 of 2 loaded applications')).toBeDefined();
    expect(screen.getByRole('article', { name: 'Simien Lodge' })).toBeDefined();
    expect(screen.queryByRole('article', { name: 'Lalibela Rock Hotel' })).toBeNull();

    // Clear search
    fireEvent.click(screen.getByRole('button', { name: 'Clear search' }));
    expect(screen.getByText('Showing 2 of 2 loaded applications')).toBeDefined();
    expect(screen.getByRole('article', { name: 'Lalibela Rock Hotel' })).toBeDefined();
  });

  it('preserves typed draft changes across search filtering without losing inputs', async () => {
    const draftApp = createMockApp('app-1', 'Bahar Dar Resort', {
      location: {
        geographyReleaseId: mockDirectoryRelease.id,
        unitId: 'unit-bahardar',
        unitRevisionId: 'rev-bahardar-1',
        unitType: 'woreda',
        displayName: 'Bahar Dar Town',
        hierarchy: [
          {
            unitId: 'unit-amhara',
            unitRevisionId: 'rev-amhara-1',
            unitType: 'region',
            displayName: 'Amhara Region',
          },
          {
            unitId: 'unit-bahardar',
            unitRevisionId: 'rev-bahardar-1',
            unitType: 'woreda',
            displayName: 'Bahar Dar Town',
          },
        ],
      },
      status: 'draft',
    });
    const secondApp = createMockApp('app-2', 'Gondar Palace', { status: 'draft' });

    mockApi.getMyHotelApplications.mockResolvedValueOnce({
      items: [draftApp, secondApp],
    });

    render(
      <HotelPilotSessionProvider accessToken="test-applicant-token">
        <HotelApplicantScreen />
      </HotelPilotSessionProvider>,
    );

    const baharCard = await screen.findByRole('article', { name: 'Bahar Dar Resort' });
    const notesField = within(baharCard).getByLabelText('Application notes');
    fireEvent.change(notesField, { target: { value: 'Lakefront private suite' } });

    // Expect unsaved badge to appear
    expect(within(baharCard).getByText('Unsaved draft changes')).toBeDefined();

    // Search for the other hotel (hiding Bahar Dar)
    const searchInput = screen.getByRole('searchbox', { name: 'Search your applications' });
    fireEvent.change(searchInput, { target: { value: 'Gondar' } });
    expect(screen.queryByRole('article', { name: 'Bahar Dar Resort' })).toBeNull();

    // Clear search and verify typing was preserved
    fireEvent.click(screen.getByRole('button', { name: 'Clear search' }));
    const restoredCard = await screen.findByRole('article', { name: 'Bahar Dar Resort' });
    expect(
      (within(restoredCard).getByLabelText('Application notes') as HTMLTextAreaElement).value,
    ).toBe('Lakefront private suite');
    expect(within(restoredCard).getByText('Unsaved draft changes')).toBeDefined();
  });

  it('displays explicit guidance and disables submission when location selection is stale', async () => {
    const staleApp = createMockApp('app-stale', 'Stale Location Hotel', {
      status: 'draft',
      locationState: 'stale',
      content: {
        claimedHotelName: 'Stale Location Hotel',
        applicantNotes: 'Draft with old location release',
        locationSelection: {
          geographyReleaseId: 'old-release-2025',
          unitId: 'unit-old',
          unitRevisionId: 'rev-old-1',
        },
      },
    });

    mockApi.getMyHotelApplications.mockResolvedValueOnce({
      items: [staleApp],
    });

    render(
      <HotelPilotSessionProvider accessToken="test-applicant-token">
        <HotelApplicantScreen />
      </HotelPilotSessionProvider>,
    );

    const card = await screen.findByRole('article', { name: 'Stale Location Hotel' });
    expect(
      within(card).getByText(
        /The saved location is stale. Search the directory and select a current location/,
      ),
    ).toBeDefined();

    const submitBtn = within(card).getByRole('button', { name: 'Submit this version for review' });
    expect((submitBtn as HTMLButtonElement).disabled).toBe(true);
  });

  it('clears private applications and search state when unauthorized or signed out', async () => {
    const draftApp = createMockApp('app-1', 'Private Guesthouse');
    mockApi.getMyHotelApplications.mockResolvedValueOnce({ items: [draftApp] });

    const { rerender } = render(
      <HotelPilotSessionProvider accessToken="session-token-1">
        <HotelApplicantScreen />
      </HotelPilotSessionProvider>,
    );

    await screen.findByText('Private Guesthouse');
    const searchInput = screen.getByRole('searchbox', { name: 'Search your applications' });
    fireEvent.change(searchInput, { target: { value: 'Guesthouse' } });

    // Transition to signed-out
    rerender(
      <HotelPilotSessionProvider accessToken={null}>
        <HotelApplicantScreen />
      </HotelPilotSessionProvider>,
    );

    expect(screen.queryByText('Private Guesthouse')).toBeNull();
    expect(screen.getByText('Authenticated workspace session unavailable')).toBeDefined();
  });

  it('explicitly labels newly selected draft locations as unreviewed after prior approval', async () => {
    const postApprovalDraft = createMockApp('app-approved', 'Axum Hotel', {
      status: 'draft',
      currentVersion: 3,
      currentVersionId: 'rev-2',
      bureauDecision: {
        decision: 'approve',
        applicationVersion: 2,
        reason: 'Approved version 2 at original location',
        decidedAt: '2026-10-20T10:00:00Z',
      },
      content: {
        claimedHotelName: 'Axum Hotel',
        applicantNotes: 'New draft after version 2 was approved',
        locationSelection: {
          geographyReleaseId: mockDirectoryRelease.id,
          unitId: 'unit-gondar',
          unitRevisionId: 'rev-gondar-1',
        },
      },
    });

    mockApi.getMyHotelApplications.mockResolvedValueOnce({
      items: [postApprovalDraft],
    });

    render(
      <HotelPilotSessionProvider accessToken="test-applicant-token">
        <HotelApplicantScreen />
      </HotelPilotSessionProvider>,
    );

    const card = await screen.findByRole('article', { name: 'Axum Hotel' });
    expect(within(card).getByText(/Previous submitted version 2 outcome approve/)).toBeDefined();
    expect(
      within(card).getByText(
        /Applies only to submitted version 2; a new draft has not been reviewed./,
      ),
    ).toBeDefined();
  });
});
