// @vitest-environment jsdom
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { HotelApplicantScreen } from './hotels/applicant-screen';
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
  getMyHotelApplications: vi.fn(),
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
  content: { claimedHotelName: 'Synthetic sample hotel', applicantNotes: 'Sample notes' },
  bureauDecision: {
    decision: 'approve',
    applicationVersion: 3,
    reason: 'Synthetic pilot test decision',
    decidedAt: '2026-10-20T10:00:00.000Z',
  },
  admissionDecision: null,
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
  caseId: 'case-1',
  caseStatus: 'in_review',
  ...overrides,
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
      content: { claimedHotelName: 'Grand Lalibela Hotel', applicantNotes: 'Draft application' },
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
      expect(mockApiClient.getAdmittedHotelWorkspace).toHaveBeenCalledWith(
        admittedApp.id,
        { accessToken: token },
      );
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
    const admittedApp = mockAdmittedApplication();
    mockApiClient.getAdmittedHotelWorkspace.mockResolvedValueOnce(admittedApp);

    render(
      <HotelPilotSessionProvider accessToken={token}>
        <AdmittedHotelWorkspacePage params={Promise.resolve({ id: admittedApp.id })} />
      </HotelPilotSessionProvider>,
    );

    await waitFor(() => {
      expect(mockApiClient.getAdmittedHotelWorkspace).toHaveBeenCalledWith(
        admittedApp.id,
        { accessToken: token },
      );
    });

    await waitFor(() => {
      expect(screen.getByText('Administrator pilot admission approved')).toBeDefined();
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
