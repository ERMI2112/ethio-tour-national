// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
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

    await waitFor(() => expect(within(baharCard).getByText('Unsaved draft changes')).toBeDefined());

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
    await waitFor(() =>
      expect(within(restoredCard).getByText('Unsaved draft changes')).toBeDefined(),
    );
  });

  it('submits only a successfully saved draft version and keeps the target through filtering', async () => {
    const target = createMockApp('app-target', 'Target Lodge', {
      status: 'draft',
      version: 8,
    });
    const other = createMockApp('app-other', 'Other Lodge', { status: 'draft' });
    mockApi.getMyHotelApplications.mockResolvedValueOnce({ items: [target, other] });

    render(
      <HotelPilotSessionProvider accessToken="test-applicant-token">
        <HotelApplicantScreen />
      </HotelPilotSessionProvider>,
    );

    let targetCard = await screen.findByRole('article', { name: 'Target Lodge' });
    const submit = within(targetCard).getByRole('button', {
      name: 'Submit this version for review',
    });
    await waitFor(() => expect((submit as HTMLButtonElement).disabled).toBe(false));

    const notes = within(targetCard).getByLabelText('Application notes') as HTMLTextAreaElement;
    fireEvent.change(notes, { target: { value: 'Unsaved notes must not be submitted.' } });
    expect((submit as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(submit);
    expect(mockApi.submitHotelApplication).not.toHaveBeenCalled();

    const search = screen.getByRole('searchbox', { name: 'Search your applications' });
    fireEvent.change(search, { target: { value: 'Other Lodge' } });
    expect(screen.queryByRole('article', { name: 'Target Lodge' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Clear search' }));
    targetCard = await screen.findByRole('article', { name: 'Target Lodge' });
    expect(
      (within(targetCard).getByLabelText('Application notes') as HTMLTextAreaElement).value,
    ).toBe('Unsaved notes must not be submitted.');

    const saved = {
      ...target,
      version: 9,
      content: { ...target.content, applicantNotes: 'Unsaved notes must not be submitted.' },
    };
    mockApi.createHotelApplicationRevision.mockResolvedValueOnce(saved);
    fireEvent.click(within(targetCard).getByRole('button', { name: 'Save private draft' }));
    await screen.findByText('Private draft saved on the server.');
    await waitFor(() =>
      expect(
        (within(targetCard).getByLabelText('Application notes') as HTMLTextAreaElement).value,
      ).toBe(saved.content.applicantNotes),
    );
    await waitFor(() => expect((submit as HTMLButtonElement).disabled).toBe(false));

    const submitted = {
      ...saved,
      status: 'submitted' as const,
      currentVersion: 1,
      currentVersionId: 'submitted-version-1',
      version: 10,
      locationState: 'submitted_snapshot' as const,
    };
    mockApi.submitHotelApplication.mockResolvedValueOnce(submitted);
    fireEvent.click(
      within(targetCard).getByRole('button', { name: 'Submit this version for review' }),
    );
    await waitFor(() =>
      expect(mockApi.submitHotelApplication).toHaveBeenCalledWith(
        'app-target',
        { expectedVersion: saved.version },
        { accessToken: 'test-applicant-token' },
      ),
    );
    expect(mockApi.createHotelApplicationRevision).toHaveBeenCalledWith(
      'app-target',
      {
        expectedVersion: target.version,
        content: {
          ...target.content,
          applicantNotes: 'Unsaved notes must not be submitted.',
        },
      },
      { accessToken: 'test-applicant-token' },
    );
  });

  it('preserves unsaved inputs and never reports a failed save as successful', async () => {
    const draft = createMockApp('app-save-failure', 'Save Failure Lodge', {
      status: 'draft',
      version: 4,
    });
    mockApi.getMyHotelApplications.mockResolvedValueOnce({ items: [draft] });
    mockApi.createHotelApplicationRevision.mockRejectedValueOnce(new Error('offline'));

    render(
      <HotelPilotSessionProvider accessToken="test-applicant-token">
        <HotelApplicantScreen />
      </HotelPilotSessionProvider>,
    );

    const card = await screen.findByRole('article', { name: 'Save Failure Lodge' });
    const notes = within(card).getByLabelText('Application notes') as HTMLTextAreaElement;
    fireEvent.change(notes, { target: { value: 'Keep this input after a failed save.' } });
    fireEvent.click(within(card).getByRole('button', { name: 'Save private draft' }));

    expect(await screen.findByRole('alert')).toBeDefined();
    expect(screen.queryByText('Private draft saved on the server.')).toBeNull();
    expect(notes.value).toBe('Keep this input after a failed save.');
    expect(within(card).getByText('Unsaved draft changes')).toBeDefined();
    expect(
      (
        within(card).getByRole('button', {
          name: 'Submit this version for review',
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
  });

  it('preserves the saved draft inputs and state when submission fails', async () => {
    const draft = createMockApp('app-submit-failure', 'Submit Failure Lodge', {
      status: 'draft',
      version: 11,
    });
    mockApi.getMyHotelApplications.mockResolvedValueOnce({ items: [draft] });
    mockApi.submitHotelApplication.mockRejectedValueOnce(new Error('offline'));

    render(
      <HotelPilotSessionProvider accessToken="test-applicant-token">
        <HotelApplicantScreen />
      </HotelPilotSessionProvider>,
    );

    const card = await screen.findByRole('article', { name: 'Submit Failure Lodge' });
    const notes = within(card).getByLabelText('Application notes') as HTMLTextAreaElement;
    const submit = within(card).getByRole('button', { name: 'Submit this version for review' });
    await waitFor(() => expect((submit as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(submit);

    expect(await screen.findByRole('alert')).toBeDefined();
    expect(notes.value).toBe(draft.content.applicantNotes);
    expect(within(card).getByText('Saved on server')).toBeDefined();
    expect(within(card).getByText('draft')).toBeDefined();
    expect(mockApi.submitHotelApplication).toHaveBeenCalledWith(
      draft.id,
      { expectedVersion: draft.version },
      { accessToken: 'test-applicant-token' },
    );
  });

  it('keeps the stale location until the applicant selects and saves an active-release location', async () => {
    const stale = createMockApp('app-stale-location', 'Stale Location Lodge', {
      status: 'draft',
      version: 6,
      locationState: 'stale',
      content: {
        claimedHotelName: 'Stale Location Lodge',
        applicantNotes: 'Keep this draft note.',
        locationSelection: {
          geographyReleaseId: 'old-release',
          unitId: 'old-unit',
          unitRevisionId: 'old-unit-revision',
        },
      },
    });
    mockApi.getMyHotelApplications.mockResolvedValueOnce({ items: [stale] });

    render(
      <HotelPilotSessionProvider accessToken="test-applicant-token">
        <HotelApplicantScreen />
      </HotelPilotSessionProvider>,
    );

    const card = await screen.findByRole('article', { name: 'Stale Location Lodge' });
    const locationSelect = within(card).getByLabelText('Choose a location') as HTMLSelectElement;
    await waitFor(() => expect(locationSelect.disabled).toBe(false));
    expect(locationSelect.value).toBe('');
    fireEvent.change(locationSelect, { target: { value: 'unit-gondar' } });

    const submit = within(card).getByRole('button', { name: 'Submit this version for review' });
    await waitFor(() => expect((submit as HTMLButtonElement).disabled).toBe(true));
    const activeSelection = {
      geographyReleaseId: mockDirectoryRelease.id,
      unitId: 'unit-gondar',
      unitRevisionId: 'rev-gondar-1',
    };
    const saved = {
      ...stale,
      version: 7,
      locationState: 'current' as const,
      content: { ...stale.content, locationSelection: activeSelection },
    };
    mockApi.createHotelApplicationRevision.mockResolvedValueOnce(saved);
    fireEvent.click(within(card).getByRole('button', { name: 'Save private draft' }));
    await screen.findByText('Private draft saved on the server.');
    expect(mockApi.createHotelApplicationRevision).toHaveBeenCalledWith(
      stale.id,
      { expectedVersion: stale.version, content: saved.content },
      { accessToken: 'test-applicant-token' },
    );
    expect(mockApi.submitHotelApplication).not.toHaveBeenCalled();
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

  it('does not restore an earlier identity list when its request resolves after an identity change', async () => {
    const firstIdentity = deferred<{ items: HotelApplicationResponse[] }>();
    const secondIdentity = deferred<{ items: HotelApplicationResponse[] }>();
    const firstApp = createMockApp('private-a', 'Identity A Private Hotel');
    const secondApp = createMockApp('private-b', 'Identity B Private Hotel');
    mockApi.getMyHotelApplications.mockImplementation(({ accessToken }: { accessToken: string }) =>
      accessToken === 'token-a' ? firstIdentity.promise : secondIdentity.promise,
    );

    const { rerender } = render(
      <HotelPilotSessionProvider accessToken="token-a">
        <HotelApplicantScreen />
      </HotelPilotSessionProvider>,
    );
    await waitFor(() => expect(mockApi.getMyHotelApplications).toHaveBeenCalledTimes(1));

    rerender(
      <HotelPilotSessionProvider accessToken="token-b">
        <HotelApplicantScreen />
      </HotelPilotSessionProvider>,
    );
    await waitFor(() => expect(mockApi.getMyHotelApplications).toHaveBeenCalledTimes(2));
    await act(async () => secondIdentity.resolve({ items: [secondApp] }));
    await screen.findByRole('article', { name: 'Identity B Private Hotel' });

    await act(async () => firstIdentity.resolve({ items: [firstApp] }));
    expect(screen.queryByRole('article', { name: 'Identity A Private Hotel' })).toBeNull();
    expect(screen.getByRole('article', { name: 'Identity B Private Hotel' })).toBeDefined();
  });

  it('does not add a created application after the creating identity changes', async () => {
    const pendingCreate = deferred<HotelApplicationResponse>();
    mockApi.createHotelApplication.mockReturnValueOnce(pendingCreate.promise);
    const { rerender } = render(
      <HotelPilotSessionProvider accessToken="token-a">
        <HotelApplicantScreen />
      </HotelPilotSessionProvider>,
    );

    fireEvent.change(screen.getByLabelText('Hotel name stated in this application'), {
      target: { value: 'Identity A new hotel' },
    });
    fireEvent.change(screen.getByLabelText('Application notes'), {
      target: { value: 'Identity A private draft input' },
    });
    const locationSelect = screen.getByLabelText('Choose a location') as HTMLSelectElement;
    await waitFor(() => expect(locationSelect.disabled).toBe(false));
    fireEvent.change(locationSelect, { target: { value: 'unit-gondar' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create private draft' }));
    await waitFor(() => expect(mockApi.createHotelApplication).toHaveBeenCalledTimes(1));

    rerender(
      <HotelPilotSessionProvider accessToken="token-b">
        <HotelApplicantScreen />
      </HotelPilotSessionProvider>,
    );
    await waitFor(() => expect(mockApi.getMyHotelApplications).toHaveBeenCalledTimes(2));
    await act(async () =>
      pendingCreate.resolve(createMockApp('created-a', 'Identity A new hotel')),
    );

    expect(screen.queryByText('Identity A new hotel')).toBeNull();
    expect(screen.queryByText('Identity A private draft input')).toBeNull();
    expect(
      (screen.getByLabelText('Hotel name stated in this application') as HTMLInputElement).value,
    ).toBe('');
  });

  it.each(['save', 'submit'] as const)(
    'does not restore a pending %s response after the applicant identity changes',
    async (operation) => {
      const pendingMutation = deferred<HotelApplicationResponse>();
      const firstApp = createMockApp(`identity-a-${operation}`, 'Identity A Private Application', {
        status: 'draft',
        version: 5,
      });
      mockApi.getMyHotelApplications.mockResolvedValueOnce({ items: [firstApp] });
      if (operation === 'save') {
        mockApi.createHotelApplicationRevision.mockReturnValueOnce(pendingMutation.promise);
      } else {
        mockApi.submitHotelApplication.mockReturnValueOnce(pendingMutation.promise);
      }

      const { rerender } = render(
        <HotelPilotSessionProvider accessToken="token-a">
          <HotelApplicantScreen />
        </HotelPilotSessionProvider>,
      );
      const card = await screen.findByRole('article', { name: 'Identity A Private Application' });
      if (operation === 'save') {
        fireEvent.change(within(card).getByLabelText('Application notes'), {
          target: { value: 'Pending save from identity A' },
        });
        fireEvent.click(within(card).getByRole('button', { name: 'Save private draft' }));
        await waitFor(() =>
          expect(mockApi.createHotelApplicationRevision).toHaveBeenCalledTimes(1),
        );
      } else {
        const submit = within(card).getByRole('button', { name: 'Submit this version for review' });
        await waitFor(() => expect((submit as HTMLButtonElement).disabled).toBe(false));
        fireEvent.click(submit);
        await waitFor(() => expect(mockApi.submitHotelApplication).toHaveBeenCalledTimes(1));
      }

      rerender(
        <HotelPilotSessionProvider accessToken="token-b">
          <HotelApplicantScreen />
        </HotelPilotSessionProvider>,
      );
      await waitFor(() => expect(mockApi.getMyHotelApplications).toHaveBeenCalledTimes(2));
      await act(async () =>
        pendingMutation.resolve({
          ...firstApp,
          content: { ...firstApp.content, applicantNotes: 'Late response for identity A' },
        }),
      );

      expect(screen.queryByRole('article', { name: 'Identity A Private Application' })).toBeNull();
      expect(screen.queryByText('Late response for identity A')).toBeNull();
    },
  );

  it('clears unsaved new-application fields and location selection on direct identity change', async () => {
    const { rerender } = render(
      <HotelPilotSessionProvider accessToken="token-a">
        <HotelApplicantScreen />
      </HotelPilotSessionProvider>,
    );

    fireEvent.change(screen.getByLabelText('Hotel name stated in this application'), {
      target: { value: 'Identity A unsaved hotel' },
    });
    fireEvent.change(screen.getByLabelText('Application notes'), {
      target: { value: 'Private notes from identity A' },
    });
    const locationSelect = screen.getByLabelText('Choose a location') as HTMLSelectElement;
    await waitFor(() => expect(locationSelect.disabled).toBe(false));
    fireEvent.change(locationSelect, { target: { value: 'unit-gondar' } });

    rerender(
      <HotelPilotSessionProvider accessToken="token-b">
        <HotelApplicantScreen />
      </HotelPilotSessionProvider>,
    );

    expect(
      (screen.getByLabelText('Hotel name stated in this application') as HTMLInputElement).value,
    ).toBe('');
    expect((screen.getByLabelText('Application notes') as HTMLTextAreaElement).value).toBe('');
    await waitFor(() =>
      expect((screen.getByLabelText('Choose a location') as HTMLSelectElement).value).toBe(''),
    );
    expect(screen.queryByText('Identity A unsaved hotel')).toBeNull();
    expect(screen.queryByText('Private notes from identity A')).toBeNull();
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
        /Applies only to submitted version 2 and its submitted location. The current private draft and its declared location have not been reviewed./,
      ),
    ).toBeDefined();
  });

  it('keeps a current draft distinct from the version that granted private workspace access', async () => {
    const draft = createMockApp('app-admitted-draft', 'New unsubmitted hotel name', {
      status: 'draft',
      admissionStatus: 'admitted',
      workspaceAccess: 'private_only',
      currentVersion: 3,
      currentVersionId: 'submitted-version-3',
      admittedVersion: 1,
      bureauDecision: {
        decision: 'approve',
        applicationVersion: 3,
        reason: 'Synthetic approval for version 3.',
        decidedAt: '2026-10-20T10:00:00Z',
      },
      admissionDecision: {
        decision: 'admit',
        applicationVersion: 1,
        reason: 'Synthetic admission for version 1.',
        decidedAt: '2026-10-19T10:00:00Z',
      },
    });
    mockApi.getMyHotelApplications.mockResolvedValueOnce({ items: [draft] });
    mockApi.getAdmittedHotelWorkspace.mockResolvedValueOnce(draft);

    render(
      <HotelPilotSessionProvider accessToken="test-applicant-token">
        <HotelApplicantScreen />
      </HotelPilotSessionProvider>,
    );

    const card = await screen.findByRole('article', { name: 'New unsubmitted hotel name' });
    fireEvent.click(within(card).getByRole('button', { name: 'View admitted workspace' }));

    const details = await screen.findByLabelText('Admitted hotel workspace details');
    const admittedVersionLabel = within(details).getByText('Admitted version:');
    expect(admittedVersionLabel.parentElement?.textContent).toContain('1');
    const draftHotelLabel = within(details).getByText('Current private draft hotel name:');
    expect(draftHotelLabel.parentElement?.textContent).toContain('New unsubmitted hotel name');
    expect(
      within(details).getByText('Draft for next Bureau review · previous submitted version 3'),
    ).toBeDefined();
    expect(
      within(details).getByText(
        'This is private draft content, not a submitted or approved version. Earlier decisions do not approve this draft.',
      ),
    ).toBeDefined();
    expect(admittedVersionLabel.parentElement?.textContent).not.toContain('3');
  });
});
