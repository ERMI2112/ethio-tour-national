// @vitest-environment jsdom
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type {
  HotelLocation,
  HotelLocationSearchResponse,
  HotelLocationSearchResult,
  HotelLocationSelection,
} from '@ethio-tour/contracts';
import { HotelApplicantScreen } from './hotels/applicant-screen';
import { HotelLocationSelector } from './components/hotel-location';
import { BureauHotelCasesScreen } from './bureau/hotel-cases/screen';
import { AdminHotelAdmissionsScreen } from './admin/hotel-admissions/screen';
import AdmittedHotelWorkspacePage from './hotels/workspace/[id]/page';
import { HotelPilotSessionProvider } from './lib/hotel-pilot-session';
import {
  applicationVersionLabel,
  canEditHotelApplication,
  canDecideBureauCase,
  canDecideHotelAdmission,
  canSubmitHotelApplication,
  describeApiFailure,
  type HotelApplicationResponse,
  type HotelBureauCaseResponse,
} from './lib/hotel-pilot-ui-state';
import { ApiClientError } from '@ethio-tour/api-client';

const mockApiClient = vi.hoisted(() => ({
  API_UNAUTHORIZED_EVENT: 'ethio-tour:unauthorized',
  getMyHotelApplications: vi.fn(),
  searchHotelLocations: vi.fn(),
  getHotelApplication: vi.fn(),
  createHotelApplication: vi.fn(),
  submitHotelApplication: vi.fn(),
  createHotelApplicationRevision: vi.fn(),
  getAdmittedHotelWorkspace: vi.fn(),
  getBureauHotelCases: vi.fn(),
  getBureauHotelCase: vi.fn(),
  decideHotelApplication: vi.fn(),
  getHotelAdmissionQueue: vi.fn(),
  decideHotelAdmission: vi.fn(),
  getApiHealth: vi.fn(),
}));

vi.mock('@ethio-tour/api-client', () => ({
  ...mockApiClient,
  ApiClientError: class ApiClientError extends Error {
    public constructor(
      message: string,
      public readonly status: number,
      public readonly code?: string,
    ) {
      super(message);
    }
  },
}));

const mockApplication = (
  overrides: Partial<HotelApplicationResponse> = {},
): HotelApplicationResponse => ({
  id: 'app-1',
  status: 'approved',
  admissionStatus: 'pending',
  currentVersion: 3,
  currentVersionId: 'revision-3',
  admittedVersion: null,
  content: { claimedHotelName: 'Synthetic sample hotel', applicantNotes: 'Sample notes' },
  location: null,
  locationState: 'unselected',
  bureauDecision: {
    decision: 'approve',
    applicationVersion: 3,
    reason: 'Synthetic pilot test decision',
    decidedAt: '2026-10-20T10:00:00.000Z',
  },
  admissionDecision: null,
  historicalBureauDecisions: [],
  historicalAdmissionDecisions: [],
  workspaceAccess: 'not_admitted',
  notice:
    'Synthetic pilot review result; not a license or proof of authority to represent a hotel.',
  version: 4,
  ...overrides,
});

const mockAdmittedApplication = (
  overrides: Partial<HotelApplicationResponse> = {},
): HotelApplicationResponse => ({
  ...mockApplication({
    id: 'app-admitted-1',
    status: 'approved',
    admissionStatus: 'admitted',
    workspaceAccess: 'private_only',
    admittedVersion: 3,
    admissionDecision: {
      decision: 'admit',
      applicationVersion: 3,
      reason: 'Administrator pilot admission approved',
      decidedAt: '2026-10-20T11:00:00.000Z',
    },
    ...overrides,
  }),
});

const mockBureauCase = (
  overrides: Partial<HotelBureauCaseResponse> = {},
): HotelBureauCaseResponse => ({
  ...mockApplication({ status: 'submitted' }),
  locationState: 'submitted_snapshot',
  caseId: 'case-1',
  caseStatus: 'in_review',
  submittedLocation: {
    geographyReleaseId: directoryRelease.id,
    unitId: searchResults[0]!.unitId,
    unitRevisionId: searchResults[0]!.unitRevisionId,
    unitType: searchResults[0]!.unitType,
    displayName: searchResults[0]!.displayName,
    hierarchy: searchResults[0]!.hierarchy,
  },
  assignment: {
    routingReleaseId: 'synthetic-routing-a',
    routingRuleId: 'synthetic-route-rule-a',
    organizationId: 'demo-org-hotel-bureau',
    scopeUnitId: searchResults[0]!.unitId,
  },
  ...overrides,
});

const makeLocation = (name: string): HotelLocation => ({
  id: `demo-unit-woreda-${name}`,
  label: `Synthetic ${name}`,
  parentId: 'synthetic-region',
  hierarchy: [
    { id: 'synthetic-region', label: 'Synthetic region', parentId: null },
    { id: `demo-unit-woreda-${name}`, label: `Synthetic ${name}`, parentId: 'synthetic-region' },
  ],
});
const locations: [HotelLocation, HotelLocation] = [
  makeLocation('gondar'),
  makeLocation('lalibela'),
];

const directoryRelease = {
  id: 'synthetic-geography-a',
  sourceEdition: 'synthetic-fixture-v1',
  effectiveFrom: null,
  synthetic: true,
};

const searchResults: HotelLocationSearchResult[] = locations.map((location, index) => ({
  unitId: location.id,
  unitRevisionId: `synthetic-revision-${index + 1}`,
  unitType: index === 0 ? 'demo-locality' : 'demo-town',
  displayName: location.label,
  hierarchy: location.hierarchy.map((node, nodeIndex) => ({
    unitId: node.id,
    unitRevisionId: `synthetic-parent-revision-${index + 1}-${nodeIndex + 1}`,
    unitType: nodeIndex === 0 ? 'demo-area' : index === 0 ? 'demo-locality' : 'demo-town',
    displayName: node.label,
  })),
  matchedName: { value: location.label, language: 'en', script: 'Latn' },
}));

const locationSelections: [HotelLocationSelection, HotelLocationSelection] = searchResults.map(
  (result) => ({
    geographyReleaseId: directoryRelease.id,
    unitId: result.unitId,
    unitRevisionId: result.unitRevisionId,
  }),
) as [HotelLocationSelection, HotelLocationSelection];

function mockSearchResponse(
  items = searchResults,
  overrides: Partial<HotelLocationSearchResponse> = {},
): HotelLocationSearchResponse {
  return {
    directoryRelease,
    items,
    nextCursor: null,
    ...overrides,
  };
}

beforeEach(() => {
  mockApiClient.searchHotelLocations.mockReset().mockResolvedValue(mockSearchResponse());
});

describe('hotel pilot screens - signed out state', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it('renders sign-in unavailable panel and does not request protected data when no session is connected', () => {
    for (const Screen of [
      HotelApplicantScreen,
      BureauHotelCasesScreen,
      AdminHotelAdmissionsScreen,
    ]) {
      const markup = renderToStaticMarkup(<Screen />);
      expect(markup).toContain('Authenticated workspace session unavailable');
      expect(markup).toContain('Do not enter or paste a token here.');
      expect(markup).toContain('not a license or proof of authority');
      expect(markup).toContain('Sign In with Keycloak');
    }

    expect(mockApiClient.getMyHotelApplications).not.toHaveBeenCalled();
    expect(mockApiClient.searchHotelLocations).not.toHaveBeenCalled();
    expect(mockApiClient.getBureauHotelCases).not.toHaveBeenCalled();
    expect(mockApiClient.getHotelAdmissionQueue).not.toHaveBeenCalled();
    expect(mockApiClient.getAdmittedHotelWorkspace).not.toHaveBeenCalled();
  });

  it('renders signed out state on direct admitted workspace page without calling API', async () => {
    const markup = renderToStaticMarkup(
      <AdmittedHotelWorkspacePage params={Promise.resolve({ id: 'app-admitted-1' })} />,
    );
    expect(markup).toContain('Authenticated workspace session unavailable');
    expect(mockApiClient.getAdmittedHotelWorkspace).not.toHaveBeenCalled();
  });
});

describe('hotel location selection, snapshots, and error retention', () => {
  const session = (children: React.ReactNode) => (
    <HotelPilotSessionProvider accessToken="test-session">{children}</HotelPilotSessionProvider>
  );
  beforeEach(() => {
    vi.clearAllMocks();
    mockApiClient.getMyHotelApplications.mockReset().mockResolvedValue({ items: [] });
  });
  afterEach(() => {
    cleanup();
    document.documentElement.lang = '';
  });

  it('searches with language and cursor and disambiguates duplicate names by full hierarchy', async () => {
    const duplicateA: HotelLocationSearchResult = {
      ...searchResults[0]!,
      displayName: 'Synthetic Town',
      unitId: 'town-a',
      hierarchy: [
        { ...searchResults[0]!.hierarchy[0]!, displayName: 'North demo area' },
        { ...searchResults[0]!.hierarchy[1]!, unitId: 'town-a', displayName: 'Synthetic Town' },
      ],
    };
    const duplicateB: HotelLocationSearchResult = {
      ...searchResults[1]!,
      displayName: 'Synthetic Town',
      unitId: 'town-b',
      hierarchy: [
        { ...searchResults[1]!.hierarchy[0]!, displayName: 'South demo area' },
        { ...searchResults[1]!.hierarchy[1]!, unitId: 'town-b', displayName: 'Synthetic Town' },
      ],
    };
    const onChange = vi.fn();
    const onValidity = vi.fn();
    const originalLanguage = document.documentElement.lang;
    document.documentElement.lang = 'am';
    mockApiClient.searchHotelLocations
      .mockResolvedValueOnce(mockSearchResponse())
      .mockResolvedValueOnce(
        mockSearchResponse([duplicateA, duplicateB], { nextCursor: 'next-page' }),
      )
      .mockResolvedValueOnce(mockSearchResponse([searchResults[0]!]));

    render(
      session(
        <HotelLocationSelector
          id="search-test"
          accessToken="test-session"
          value={null}
          locationSnapshot={null}
          onChange={onChange}
          onSelectionValidityChange={onValidity}
        />,
      ),
    );
    await screen.findByText('2 locations shown.');
    const search = screen.getByLabelText('Search locations');
    fireEvent.change(search, { target: { value: 'town' } });
    fireEvent.keyDown(search, { key: 'Enter' });
    await waitFor(() => expect(mockApiClient.searchHotelLocations).toHaveBeenCalledTimes(2));
    expect(mockApiClient.searchHotelLocations).toHaveBeenLastCalledWith(
      { query: 'town', language: 'am', limit: 20 },
      { accessToken: 'test-session' },
    );
    const select = screen.getByLabelText('Choose a location') as HTMLSelectElement;
    expect(select.options[1]?.textContent).toContain('North demo area / Synthetic Town');
    expect(select.options[2]?.textContent).toContain('South demo area / Synthetic Town');
    fireEvent.click(screen.getByRole('button', { name: 'Load more locations' }));
    await waitFor(() => expect(mockApiClient.searchHotelLocations).toHaveBeenCalledTimes(3));
    expect(mockApiClient.searchHotelLocations).toHaveBeenLastCalledWith(
      { query: 'town', language: 'am', limit: 20, cursor: 'next-page' },
      { accessToken: 'test-session' },
    );
    document.documentElement.lang = originalLanguage;
  });

  it('keeps a stale server-reported selection invalid without mapping it to a new location', async () => {
    const onValidity = vi.fn();
    render(
      session(
        <HotelLocationSelector
          id="stale-test"
          accessToken="test-session"
          value={{
            geographyReleaseId: 'old-release',
            unitId: locations[0].id,
            unitRevisionId: 'old-unit-revision',
          }}
          locationSnapshot={locations[0]}
          locationState="stale"
          onChange={vi.fn()}
          onSelectionValidityChange={onValidity}
        />,
      ),
    );
    expect(await screen.findByText(/Saved location is stale/)).toBeDefined();
    expect(screen.getByRole('alert').textContent).toContain('saved unit revision differs');
    await waitFor(() => expect(onValidity).toHaveBeenLastCalledWith(false));
    expect((screen.getByLabelText('Choose a location') as HTMLSelectElement).value).toBe('');
  });

  it('labels a legacy location snapshot and requires a fresh directory selection', async () => {
    render(
      session(
        <HotelLocationSelector
          id="legacy-test"
          accessToken="test-session"
          value={{
            geographyReleaseId: 'legacy-release',
            unitId: locations[0].id,
            unitRevisionId: 'legacy-unit-revision',
          }}
          locationSnapshot={locations[0]}
          locationState="legacy"
          onChange={vi.fn()}
          onSelectionValidityChange={vi.fn()}
        />,
      ),
    );
    expect(await screen.findByText(/Legacy location snapshot/)).toBeDefined();
    expect(screen.getByRole('alert').textContent).toContain('legacy location is not a current');
  });

  it('retains create inputs and selection after failure, retries, and resets only after success', async () => {
    mockApiClient.createHotelApplication
      .mockReset()
      .mockRejectedValueOnce(new ApiClientError('invalid', 400))
      .mockResolvedValueOnce(
        mockApplication({
          id: 'created',
          status: 'draft',
          currentVersionId: null,
          content: {
            claimedHotelName: 'Entered hotel',
            applicantNotes: 'Entered notes',
            locationSelection: locationSelections[0],
          },
        }),
      );
    render(session(<HotelApplicantScreen />));
    const form = within(screen.getByRole('region', { name: 'Start an application' }));
    await waitFor(() =>
      expect(form.getByLabelText('Choose a location').querySelectorAll('option')).toHaveLength(3),
    );
    fireEvent.change(form.getByLabelText('Hotel name stated in this application'), {
      target: { value: 'Entered hotel' },
    });
    fireEvent.change(form.getByLabelText('Application notes'), {
      target: { value: 'Entered notes' },
    });
    fireEvent.change(form.getByLabelText('Choose a location'), {
      target: { value: locations[0].id },
    });
    expect(form.getByLabelText('Location preview').textContent).toContain(
      'Applicant-declared location — unverified.',
    );
    expect(form.getByLabelText('Location preview').textContent).toContain(
      'Synthetic region / Synthetic gondar',
    );
    fireEvent.click(form.getByRole('button', { name: 'Create private draft' }));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('HTTP 400'));
    expect(
      (form.getByLabelText('Hotel name stated in this application') as HTMLInputElement).value,
    ).toBe('Entered hotel');
    expect((form.getByLabelText('Application notes') as HTMLTextAreaElement).value).toBe(
      'Entered notes',
    );
    expect((form.getByLabelText('Choose a location') as HTMLSelectElement).value).toBe(
      locations[0].id,
    );
    fireEvent.click(form.getByRole('button', { name: 'Create private draft' }));
    await waitFor(() => expect(mockApiClient.createHotelApplication).toHaveBeenCalledTimes(2));
    expect(mockApiClient.createHotelApplication).toHaveBeenLastCalledWith(
      {
        content: {
          claimedHotelName: 'Entered hotel',
          applicantNotes: 'Entered notes',
          locationSelection: locationSelections[0],
        },
      },
      { accessToken: 'test-session' },
    );
    await waitFor(() =>
      expect((form.getByLabelText('Choose a location') as HTMLSelectElement).value).toBe(''),
    );
    expect(
      (form.getByLabelText('Hotel name stated in this application') as HTMLInputElement).value,
    ).toBe('');
  });

  it('retries directory loading without clearing typed inputs and shows an empty directory honestly', async () => {
    mockApiClient.searchHotelLocations
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(mockSearchResponse([]));
    render(session(<HotelApplicantScreen />));
    const form = within(screen.getByRole('region', { name: 'Start an application' }));
    fireEvent.change(form.getByLabelText('Application notes'), {
      target: { value: 'Keep these notes' },
    });
    await waitFor(() =>
      expect(form.getByRole('alert').textContent).toContain('connection and retry'),
    );
    fireEvent.click(form.getByRole('button', { name: 'Retry search' }));
    await waitFor(() =>
      expect(form.getByText('No locations matched. Try another name or language.')).toBeDefined(),
    );
    expect((form.getByLabelText('Application notes') as HTMLTextAreaElement).value).toBe(
      'Keep these notes',
    );
  });

  it('uses the structured stale-release code without displaying server error details', async () => {
    mockApiClient.searchHotelLocations
      .mockResolvedValueOnce(mockSearchResponse())
      .mockRejectedValueOnce(
        new ApiClientError('The API request failed', 409, 'LOCATION_RELEASE_STALE'),
      );
    render(session(<HotelApplicantScreen />));
    const form = within(screen.getByRole('region', { name: 'Start an application' }));
    await form.findByText('2 locations shown.');
    fireEvent.change(form.getByLabelText('Hotel name stated in this application'), {
      target: { value: 'Unsaved hotel name' },
    });
    fireEvent.change(form.getByLabelText('Application notes'), {
      target: { value: 'Unsaved application notes' },
    });
    const location = form.getByLabelText('Choose a location') as HTMLSelectElement;
    fireEvent.change(location, { target: { value: locations[0]!.id } });
    const search = form.getByLabelText('Search locations');
    fireEvent.change(search, { target: { value: 'updated query' } });
    fireEvent.click(form.getByRole('button', { name: 'Search' }));
    const alert = await form.findByRole('alert');
    await waitFor(() => expect(mockApiClient.searchHotelLocations).toHaveBeenCalledTimes(2));
    expect(alert.textContent).toContain(
      'The location directory changed. Search again and select a current location.',
    );
    expect(form.queryByText('The API request failed')).toBeNull();
    expect(
      (form.getByLabelText('Hotel name stated in this application') as HTMLInputElement).value,
    ).toBe('Unsaved hotel name');
    expect((form.getByLabelText('Application notes') as HTMLTextAreaElement).value).toBe(
      'Unsaved application notes',
    );
    expect(location.value).toBe(locations[0]!.id);
  });

  it('requires a saved selection before submitting a legacy draft and retains correction inputs on save and submit errors', async () => {
    const legacy = mockApplication({ status: 'draft', currentVersionId: null });
    mockApiClient.getMyHotelApplications.mockResolvedValueOnce({ items: [legacy] });
    mockApiClient.createHotelApplicationRevision
      .mockReset()
      .mockRejectedValueOnce(new ApiClientError('invalid', 400))
      .mockResolvedValueOnce({
        ...legacy,
        content: {
          claimedHotelName: 'Corrected',
          applicantNotes: 'Keep correction',
          locationSelection: locationSelections[1],
        },
        version: 5,
      });
    mockApiClient.submitHotelApplication
      .mockReset()
      .mockRejectedValueOnce(new ApiClientError('conflict', 409));
    render(session(<HotelApplicantScreen />));
    const article = within(await screen.findByRole('article'));
    expect(article.getByText('No location recorded.')).toBeDefined();
    const submit = article.getByRole('button', {
      name: 'Submit this version for review',
    }) as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
    await waitFor(() =>
      expect(article.getByLabelText('Choose a location').querySelectorAll('option')).toHaveLength(
        3,
      ),
    );
    fireEvent.change(article.getByLabelText('Hotel name stated in this application'), {
      target: { value: 'Corrected' },
    });
    fireEvent.change(article.getByLabelText('Application notes'), {
      target: { value: 'Keep correction' },
    });
    fireEvent.change(article.getByLabelText('Choose a location'), {
      target: { value: locations[1].id },
    });
    fireEvent.click(article.getByRole('button', { name: 'Save private draft' }));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('HTTP 400'));
    expect(
      (article.getByLabelText('Hotel name stated in this application') as HTMLInputElement).value,
    ).toBe('Corrected');
    expect((article.getByLabelText('Choose a location') as HTMLSelectElement).value).toBe(
      locations[1].id,
    );
    expect(submit.disabled).toBe(true);
    fireEvent.click(article.getByRole('button', { name: 'Save private draft' }));
    await waitFor(() => expect(submit.disabled).toBe(false));
    fireEvent.click(submit);
    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toContain('Refresh the list'),
    );
    expect((article.getByLabelText('Application notes') as HTMLTextAreaElement).value).toBe(
      'Keep correction',
    );
    expect((article.getByLabelText('Choose a location') as HTMLSelectElement).value).toBe(
      locations[1].id,
    );
  });

  it('explains unavailable routing and preserves saved and unsaved draft fields', async () => {
    const draft = mockApplication({
      status: 'draft',
      currentVersionId: null,
      content: {
        claimedHotelName: 'Saved draft',
        applicantNotes: 'Saved notes',
        locationSelection: locationSelections[0],
      },
      location: locations[0],
      locationState: 'current',
    });
    mockApiClient.getMyHotelApplications.mockResolvedValueOnce({ items: [draft] });
    mockApiClient.submitHotelApplication
      .mockReset()
      .mockRejectedValueOnce(
        new ApiClientError('The API request failed', 503, 'HOTEL_ROUTING_UNAVAILABLE'),
      );
    render(session(<HotelApplicantScreen />));
    const card = within(await screen.findByRole('article'));
    await waitFor(() =>
      expect(
        (card.getByRole('button', { name: 'Submit this version for review' }) as HTMLButtonElement)
          .disabled,
      ).toBe(false),
    );
    fireEvent.change(card.getByLabelText('Application notes'), {
      target: { value: 'Unsaved correction' },
    });
    const submitButton = card.getByRole('button', { name: 'Submit this version for review' });
    expect((submitButton as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(card.getByRole('button', { name: 'Submit this version for review' }));
    expect(mockApiClient.submitHotelApplication).not.toHaveBeenCalled();
    fireEvent.change(card.getByLabelText('Application notes'), {
      target: { value: 'Saved notes' },
    });
    fireEvent.click(card.getByRole('button', { name: 'Submit this version for review' }));
    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toBe(
        'Review routing is unavailable for this location. Your draft is saved; submission has not occurred.',
      ),
    );
    expect(mockApiClient.submitHotelApplication).toHaveBeenCalledWith(
      draft.id,
      { expectedVersion: draft.version },
      { accessToken: 'test-session' },
    );
    fireEvent.change(card.getByLabelText('Application notes'), {
      target: { value: 'Unsaved correction' },
    });
    expect((card.getByLabelText('Application notes') as HTMLTextAreaElement).value).toBe(
      'Unsaved correction',
    );
    expect(card.getByText('Saved notes', { selector: 'p' })).toBeDefined();
    expect(mockApiClient.createHotelApplicationRevision).not.toHaveBeenCalled();
  });

  it('does not label a post-approval draft location as submitted when the previous submission ID remains', async () => {
    const draft = mockApplication({
      status: 'draft',
      currentVersionId: 'previous-approved-submission',
      location: locations[1],
      content: {
        claimedHotelName: 'Changed-location draft',
        applicantNotes: 'New draft after approval',
        locationSelection: locationSelections[1],
      },
      locationState: 'current',
    });
    mockApiClient.getMyHotelApplications.mockResolvedValueOnce({ items: [draft] });
    render(session(<HotelApplicantScreen />));
    const card = within(await screen.findByRole('article'));
    expect(card.queryByLabelText('Submitted location')).toBeNull();
    expect(card.queryByText(/Submitted location/)).toBeNull();
    expect(card.getAllByLabelText('Location preview')[0]?.textContent).toContain(
      'Synthetic region / Synthetic lalibela',
    );
    expect(card.getAllByLabelText('Location preview')[0]?.textContent).toContain(
      'Applicant-declared location — unverified.',
    );
    expect(card.getByText(/previous submitted version 3/)).toBeDefined();
  });

  it('shows the DTO snapshot in every private view independently of directory labels or a correction selection', async () => {
    const snapshot = {
      geographyReleaseId: directoryRelease.id,
      unitId: searchResults[0]!.unitId,
      unitRevisionId: searchResults[0]!.unitRevisionId,
      unitType: searchResults[0]!.unitType,
      displayName: searchResults[0]!.displayName,
      hierarchy: [
        { ...searchResults[0]!.hierarchy[0]!, displayName: 'Submitted region' },
        { ...searchResults[0]!.hierarchy[1]!, displayName: 'Submitted town' },
      ],
    };
    const application = mockAdmittedApplication({
      location: snapshot,
      content: {
        claimedHotelName: 'Snapshot hotel',
        applicantNotes: '',
        locationSelection: locationSelections[0],
      },
      locationState: 'submitted_snapshot',
    });
    mockApiClient.getMyHotelApplications.mockResolvedValueOnce({ items: [application] });
    mockApiClient.getAdmittedHotelWorkspace.mockResolvedValue(application);
    const applicant = render(session(<HotelApplicantScreen />));
    await screen.findByText('Snapshot hotel');
    expect(screen.getByLabelText('Submitted location').textContent).toContain(
      'Submitted region / Submitted town',
    );
    fireEvent.change(
      screen.getByLabelText('Choose a location', {
        selector: `#hotel-location-${application.id}-selection`,
      }),
      { target: { value: locations[1].id } },
    );
    expect(screen.getByLabelText('Submitted location').textContent).toContain('Submitted town');
    fireEvent.click(screen.getByRole('button', { name: 'View admitted workspace' }));
    await waitFor(() => expect(screen.getAllByLabelText('Submitted location')).toHaveLength(2));
    for (const element of screen.getAllByLabelText('Submitted location'))
      expect(element.textContent).toContain('Submitted town');
    applicant.unmount();
    mockApiClient.getBureauHotelCases.mockResolvedValueOnce({
      items: [mockBureauCase({ ...application, submittedLocation: snapshot })],
    });
    mockApiClient.getHotelAdmissionQueue.mockResolvedValueOnce({ items: [application] });
    for (const element of [
      <BureauHotelCasesScreen key="bureau" />,
      <AdminHotelAdmissionsScreen key="admin" />,
      <AdmittedHotelWorkspacePage
        key="workspace"
        params={Promise.resolve({ id: application.id })}
      />,
    ]) {
      const view = render(session(element));
      await waitFor(() =>
        expect(screen.getByLabelText('Submitted location').textContent).toContain('Submitted town'),
      );
      view.unmount();
    }
  });

  it.each(['bureau', 'admin'])(
    'preserves the %s reason but requires renewed action after a 409',
    async (actor) => {
      mockApiClient.getBureauHotelCases.mockResolvedValueOnce({ items: [mockBureauCase()] });
      mockApiClient.getHotelAdmissionQueue.mockResolvedValueOnce({ items: [mockApplication()] });
      mockApiClient.decideHotelApplication.mockRejectedValueOnce(
        new ApiClientError('conflict', 409),
      );
      mockApiClient.decideHotelAdmission.mockRejectedValueOnce(new ApiClientError('conflict', 409));
      render(
        session(actor === 'bureau' ? <BureauHotelCasesScreen /> : <AdminHotelAdmissionsScreen />),
      );
      const label =
        actor === 'bureau'
          ? 'Decision for this submitted version'
          : 'Private platform admission decision';
      const decision = (await screen.findByLabelText(label)) as HTMLSelectElement;
      fireEvent.change(decision, { target: { value: actor === 'bureau' ? 'approve' : 'admit' } });
      fireEvent.change(screen.getByLabelText('Reason'), { target: { value: 'Keep my reason' } });
      fireEvent.click(
        screen.getByRole('button', {
          name: actor === 'bureau' ? 'Record Bureau decision' : 'Record private admission decision',
        }),
      );
      await waitFor(() =>
        expect(screen.getByRole('alert').textContent).toContain('Refresh the list'),
      );
      expect(decision.value).toBe('');
      expect((screen.getByLabelText('Reason') as HTMLTextAreaElement).value).toBe('Keep my reason');
      expect(
        screen
          .getByRole('button', {
            name:
              actor === 'bureau' ? 'Record Bureau decision' : 'Record private admission decision',
          })
          .hasAttribute('disabled'),
      ).toBe(true);
    },
  );
});

describe('hotel pilot screens - authenticated applicant workflow and admitted workspace read path', () => {
  const token = 'real-bearer-session-token-123';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it('loads applications and allows draft creation and submission', async () => {
    const draftApp = mockApplication({
      id: 'app-draft-1',
      status: 'draft',
      admissionStatus: 'pending',
      currentVersion: 1,
      currentVersionId: null,
      content: {
        claimedHotelName: 'Grand Lalibela Hotel',
        applicantNotes: 'Draft application',
        locationSelection: locationSelections[1],
      },
    });

    mockApiClient.getMyHotelApplications.mockResolvedValueOnce({ items: [draftApp] });
    mockApiClient.submitHotelApplication.mockResolvedValueOnce({
      ...draftApp,
      status: 'submitted',
      version: 2,
    });

    render(
      <HotelPilotSessionProvider accessToken={token}>
        <HotelApplicantScreen />
      </HotelPilotSessionProvider>,
    );

    expect(mockApiClient.getMyHotelApplications).toHaveBeenCalledWith({ accessToken: token });

    await waitFor(() => {
      expect(screen.getByText('Grand Lalibela Hotel')).toBeDefined();
    });

    const submitButton = screen.getByRole('button', { name: 'Submit this version for review' });
    await waitFor(() => expect((submitButton as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(mockApiClient.submitHotelApplication).toHaveBeenCalledWith(
        'app-draft-1',
        { expectedVersion: draftApp.version },
        { accessToken: token },
      );
    });
  });

  it('executes admitted-workspace read path when viewing admitted application', async () => {
    const admittedApp = mockAdmittedApplication();

    mockApiClient.getMyHotelApplications.mockResolvedValueOnce({ items: [admittedApp] });
    mockApiClient.getAdmittedHotelWorkspace.mockResolvedValueOnce(admittedApp);

    render(
      <HotelPilotSessionProvider accessToken={token}>
        <HotelApplicantScreen />
      </HotelPilotSessionProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText('Synthetic sample hotel')).toBeDefined();
    });

    const viewWorkspaceButton = screen.getByRole('button', { name: 'View admitted workspace' });
    fireEvent.click(viewWorkspaceButton);

    await waitFor(() => {
      expect(mockApiClient.getAdmittedHotelWorkspace).toHaveBeenCalledWith(admittedApp.id, {
        accessToken: token,
      });
    });

    await waitFor(() => {
      expect(screen.getByText('Confirmed Admitted Workspace')).toBeDefined();
      expect(screen.getByText('Administrator pilot admission approved')).toBeDefined();
      expect(screen.getAllByText('Synthetic pilot test decision').length).toBeGreaterThanOrEqual(1);
    });

    // Test toggle close
    const hideButton = screen.getByRole('button', { name: 'Hide admitted workspace' });
    fireEvent.click(hideButton);

    expect(screen.queryByText('Confirmed Admitted Workspace')).toBeNull();
  });

  it('labels old decisions and retained workspace access by the version they cover', async () => {
    const resubmitted = mockAdmittedApplication({
      status: 'submitted',
      currentVersion: 4,
      currentVersionId: 'revision-4',
      admittedVersion: 3,
      content: {
        claimedHotelName: 'Synthetic changed-location hotel',
        applicantNotes: 'New submitted location',
        locationSelection: locationSelections[1],
      },
      location: locations[1],
      bureauDecision: null,
      admissionDecision: null,
      historicalBureauDecisions: [
        {
          decision: 'approve',
          applicationVersion: 3,
          reason: 'Prior version review',
          decidedAt: '2026-10-20T10:00:00.000Z',
        },
      ],
      historicalAdmissionDecisions: [
        {
          decision: 'admit',
          applicationVersion: 3,
          reason: 'Prior private admission',
          decidedAt: '2026-10-20T11:00:00.000Z',
        },
      ],
    });
    mockApiClient.getMyHotelApplications.mockResolvedValueOnce({ items: [resubmitted] });
    mockApiClient.getAdmittedHotelWorkspace.mockResolvedValueOnce(resubmitted);

    render(
      <HotelPilotSessionProvider accessToken={token}>
        <HotelApplicantScreen />
      </HotelPilotSessionProvider>,
    );

    expect(await screen.findByText('Bureau approve · submitted version 3')).toBeDefined();
    expect(screen.getByText('Administrator admit · submitted version 3')).toBeDefined();
    expect(screen.getByText('These decisions apply only to the versions shown.')).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'View admitted workspace' }));

    expect(
      await screen.findByText(
        'Current application version 4 is separate. Earlier Bureau and Administrator decisions do not approve this version.',
      ),
    ).toBeDefined();
    expect(
      screen.getByText(/Private workspace admission was recorded for submitted version 3/),
    ).toBeDefined();
    expect(screen.queryByText('Admitted version 4')).toBeNull();
  });

  it('displays error message when admitted-workspace read path fails', async () => {
    const admittedApp = mockAdmittedApplication();

    mockApiClient.getMyHotelApplications.mockResolvedValueOnce({ items: [admittedApp] });
    mockApiClient.getAdmittedHotelWorkspace.mockRejectedValueOnce(
      new ApiClientError('Not Found', 404),
    );

    render(
      <HotelPilotSessionProvider accessToken={token}>
        <HotelApplicantScreen />
      </HotelPilotSessionProvider>,
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'View admitted workspace' })).toBeDefined();
    });

    fireEvent.click(screen.getByRole('button', { name: 'View admitted workspace' }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeDefined();
      expect(screen.getByText('This record is unavailable or could not be found.')).toBeDefined();
    });
  });

  it('loads direct admitted workspace page for authenticated user', async () => {
    const admittedApp = mockAdmittedApplication({
      status: 'submitted',
      currentVersion: 4,
      currentVersionId: 'revision-4',
      admittedVersion: 3,
      bureauDecision: null,
      admissionDecision: null,
      historicalBureauDecisions: [
        {
          decision: 'approve',
          applicationVersion: 3,
          reason: 'Prior version review',
          decidedAt: '2026-10-20T10:00:00.000Z',
        },
      ],
      historicalAdmissionDecisions: [
        {
          decision: 'admit',
          applicationVersion: 3,
          reason: 'Prior private admission',
          decidedAt: '2026-10-20T11:00:00.000Z',
        },
      ],
    });
    mockApiClient.getAdmittedHotelWorkspace.mockResolvedValueOnce(admittedApp);

    render(
      <HotelPilotSessionProvider accessToken={token}>
        <AdmittedHotelWorkspacePage params={Promise.resolve({ id: admittedApp.id })} />
      </HotelPilotSessionProvider>,
    );

    await waitFor(() => {
      expect(mockApiClient.getAdmittedHotelWorkspace).toHaveBeenCalledWith(admittedApp.id, {
        accessToken: token,
      });
    });

    const workspaceCard = await screen.findByRole('article', { name: 'Admitted hotel workspace' });
    await waitFor(() => {
      expect(workspaceCard.textContent).toContain('Admission recorded for submitted version: 3');
      expect(workspaceCard.textContent).toContain(
        'Current version 4 is a separate submission; earlier decisions do not approve it.',
      );
      expect(workspaceCard.textContent).toContain('Bureau approve · submitted version 3');
    });
  });
});

describe('hotel pilot screens - authenticated Bureau reviewer workflow', () => {
  const token = 'bureau-bearer-session-token-456';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it('loads assigned Bureau cases and allows recording an approval decision', async () => {
    const caseItem = mockBureauCase();
    mockApiClient.getBureauHotelCases.mockResolvedValueOnce({ items: [caseItem] });
    mockApiClient.decideHotelApplication.mockResolvedValueOnce({
      ...caseItem,
      caseStatus: 'approved',
    });
    // Second call for reload
    mockApiClient.getBureauHotelCases.mockResolvedValueOnce({ items: [] });

    render(
      <HotelPilotSessionProvider accessToken={token}>
        <BureauHotelCasesScreen />
      </HotelPilotSessionProvider>,
    );

    expect(mockApiClient.getBureauHotelCases).toHaveBeenCalledWith({ accessToken: token });

    await waitFor(() => {
      expect(screen.getByText('Cases available for review')).toBeDefined();
      expect(screen.getByText('Synthetic sample hotel')).toBeDefined();
    });

    const select = screen.getByLabelText('Decision for this submitted version');
    fireEvent.change(select, { target: { value: 'approve' } });

    const reasonInput = screen.getByLabelText('Reason');
    fireEvent.change(reasonInput, { target: { value: 'Verified local licensing documentation.' } });

    const submitBtn = screen.getByRole('button', { name: 'Record Bureau decision' });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(mockApiClient.decideHotelApplication).toHaveBeenCalledWith(
        caseItem.caseId,
        {
          expectedVersion: caseItem.version,
          decision: 'approve',
          reason: 'Verified local licensing documentation.',
        },
        { accessToken: token },
      );
    });
  });
});

describe('hotel pilot screens - authenticated Administrator admission workflow', () => {
  const token = 'admin-bearer-session-token-789';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it('loads eligible admission applications and allows recording private admission', async () => {
    const eligibleApp = mockApplication({
      status: 'approved',
      admissionStatus: 'pending',
      bureauDecision: {
        decision: 'approve',
        applicationVersion: 3,
        reason: 'Bureau approval recorded',
        decidedAt: '2026-10-20T10:00:00.000Z',
      },
    });

    mockApiClient.getHotelAdmissionQueue.mockResolvedValueOnce({ items: [eligibleApp] });
    mockApiClient.decideHotelAdmission.mockResolvedValueOnce({
      ...eligibleApp,
      admissionStatus: 'admitted',
      workspaceAccess: 'private_only',
    });
    mockApiClient.getHotelAdmissionQueue.mockResolvedValueOnce({ items: [] });

    render(
      <HotelPilotSessionProvider accessToken={token}>
        <AdminHotelAdmissionsScreen />
      </HotelPilotSessionProvider>,
    );

    expect(mockApiClient.getHotelAdmissionQueue).toHaveBeenCalledWith({ accessToken: token });

    await waitFor(() => {
      expect(screen.getByText('Applications eligible for admission')).toBeDefined();
    });

    const select = screen.getByLabelText('Private platform admission decision');
    fireEvent.change(select, { target: { value: 'admit' } });

    const reasonInput = screen.getByLabelText('Reason');
    fireEvent.change(reasonInput, { target: { value: 'Platform admission criteria satisfied.' } });

    const submitBtn = screen.getByRole('button', { name: 'Record private admission decision' });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(mockApiClient.decideHotelAdmission).toHaveBeenCalledWith(
        eligibleApp.id,
        {
          expectedVersion: eligibleApp.version,
          decision: 'admit',
          reason: 'Platform admission criteria satisfied.',
        },
        { accessToken: token },
      );
    });
  });
});

describe('hotel pilot contract rules and state transitions', () => {
  it('only offers actions allowed by the contract state and exact approved version', () => {
    expect(canSubmitHotelApplication(mockApplication({ status: 'draft' }))).toBe(true);
    expect(canSubmitHotelApplication(mockApplication({ status: 'submitted' }))).toBe(false);
    expect(canEditHotelApplication(mockApplication({ status: 'draft' }))).toBe(true);
    expect(canEditHotelApplication(mockApplication({ status: 'changes_requested' }))).toBe(true);
    expect(canEditHotelApplication(mockApplication({ status: 'approved' }))).toBe(true);
    expect(
      canEditHotelApplication(mockApplication({ status: 'approved', admissionStatus: 'declined' })),
    ).toBe(false);
    expect(canEditHotelApplication(mockApplication({ status: 'submitted' }))).toBe(false);
    expect(applicationVersionLabel(mockApplication({ status: 'approved' }))).toBe(
      'Submitted application version 3',
    );
    expect(
      applicationVersionLabel(mockApplication({ status: 'draft', currentVersionId: 'version-3' })),
    ).toContain('previous submitted version 3');
    expect(canDecideBureauCase(mockBureauCase({ caseStatus: 'in_review' }))).toBe(true);
    expect(canDecideBureauCase(mockBureauCase({ caseStatus: 'rejected' }))).toBe(false);
    expect(canDecideHotelAdmission(mockApplication())).toBe(true);
    expect(
      canDecideHotelAdmission(
        mockApplication({
          bureauDecision: {
            decision: 'approve',
            applicationVersion: 2,
            reason: 'Older approved version',
            decidedAt: '2026-10-20T10:00:00.000Z',
          },
        }),
      ),
    ).toBe(false);
  });

  it('shows safe, actionable API failure messages without treating failures as empty success', () => {
    expect(describeApiFailure(new ApiClientError('generic', 401), 'loading the queue')).toContain(
      'session is missing or has expired',
    );
    expect(describeApiFailure(new ApiClientError('generic', 403), 'loading the queue')).toContain(
      'not permitted',
    );
    expect(describeApiFailure(new ApiClientError('generic', 404), 'loading the queue')).toContain(
      'unavailable or could not be found',
    );
    expect(describeApiFailure(new ApiClientError('generic', 409), 'loading the queue')).toContain(
      'Refresh the list',
    );
    expect(describeApiFailure(new Error('network'), 'loading the queue')).toContain(
      'connection and retry',
    );
  });
});
