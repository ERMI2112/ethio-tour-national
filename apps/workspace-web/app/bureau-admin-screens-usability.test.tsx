// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { HotelApplicationResponse, HotelBureauCaseResponse } from './lib/hotel-pilot-ui-state';
import { BureauHotelCasesScreen } from './bureau/hotel-cases/screen';
import { AdminHotelAdmissionsScreen } from './admin/hotel-admissions/screen';
import { HotelPilotSessionProvider } from './lib/hotel-pilot-session';

const mockApiClient = vi.hoisted(() => ({
  API_UNAUTHORIZED_EVENT: 'ethio-tour:unauthorized',
  getBureauHotelCases: vi.fn(),
  decideHotelApplication: vi.fn(),
  getHotelAdmissionQueue: vi.fn(),
  decideHotelAdmission: vi.fn(),
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
      this.name = 'ApiClientError';
    }
  },
}));

const mockBureauCase = (
  overrides: Partial<HotelBureauCaseResponse> = {},
): HotelBureauCaseResponse => ({
  id: 'app-bureau-1',
  caseId: 'case-bureau-1',
  caseStatus: 'submitted',
  status: 'submitted',
  admissionStatus: 'pending',
  currentVersion: 2,
  currentVersionId: 'rev-2',
  admittedVersion: null,
  content: {
    claimedHotelName: 'Axum Heritage Hotel',
    applicantNotes: 'Please review documentation.',
  },
  location: null,
  submittedLocation: {
    geographyReleaseId: 'geo-release-1',
    unitId: 'unit-axum',
    unitRevisionId: 'rev-axum',
    unitType: 'woreda',
    displayName: 'Axum Town',
    hierarchy: [
      { unitId: 'reg-1', unitRevisionId: 'rev-reg-1', unitType: 'region', displayName: 'Tigray' },
      {
        unitId: 'unit-axum',
        unitRevisionId: 'rev-axum',
        unitType: 'woreda',
        displayName: 'Axum Town',
      },
    ],
  },
  locationState: 'submitted_snapshot',
  bureauDecision: null,
  admissionDecision: null,
  historicalBureauDecisions: [],
  historicalAdmissionDecisions: [],
  workspaceAccess: 'not_admitted',
  notice:
    'Synthetic pilot review result; not a license or proof of authority to represent a hotel.',
  version: 2,
  assignment: {
    routingReleaseId: 'route-1',
    routingRuleId: 'rule-1',
    organizationId: 'demo-org-bureau',
    scopeUnitId: 'reg-1',
  },
  ...overrides,
});

const mockAdminApplication = (
  overrides: Partial<HotelApplicationResponse> = {},
): HotelApplicationResponse => ({
  id: 'app-admin-1',
  status: 'approved',
  admissionStatus: 'pending',
  currentVersion: 3,
  currentVersionId: 'rev-3',
  admittedVersion: null,
  content: {
    claimedHotelName: 'Lalibela Rock Hotel',
    applicantNotes: 'Bureau approved, requesting admission.',
  },
  location: {
    geographyReleaseId: 'geo-release-1',
    unitId: 'unit-lalibela',
    unitRevisionId: 'rev-lalibela',
    unitType: 'woreda',
    displayName: 'Lalibela Town',
    hierarchy: [
      { unitId: 'reg-2', unitRevisionId: 'rev-reg-2', unitType: 'region', displayName: 'Amhara' },
      {
        unitId: 'unit-lalibela',
        unitRevisionId: 'rev-lalibela',
        unitType: 'woreda',
        displayName: 'Lalibela Town',
      },
    ],
  },
  locationState: 'submitted_snapshot',
  bureauDecision: {
    decision: 'approve',
    applicationVersion: 3,
    reason: 'Bureau verified property registration.',
    decidedAt: '2026-10-21T10:00:00.000Z',
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

describe('Bureau and Administrator screens usability & reliability', () => {
  const token = 'test-officer-token';

  beforeEach(() => {
    vi.clearAllMocks();
    mockApiClient.getBureauHotelCases.mockResolvedValue({ items: [] });
    mockApiClient.getHotelAdmissionQueue.mockResolvedValue({ items: [] });
  });

  afterEach(() => {
    cleanup();
  });

  describe('1. Duplicate decision submission prevention', () => {
    it('disables submit button and form controls on Bureau screen while decision is in-flight', async () => {
      let resolveDecision: (val: unknown) => void = () => {};
      const pendingPromise = new Promise((res) => {
        resolveDecision = res;
      });

      mockApiClient.getBureauHotelCases.mockResolvedValueOnce({
        items: [mockBureauCase()],
      });
      mockApiClient.decideHotelApplication.mockReturnValueOnce(pendingPromise);

      render(
        <HotelPilotSessionProvider accessToken={token}>
          <BureauHotelCasesScreen />
        </HotelPilotSessionProvider>,
      );

      const select = (await screen.findByLabelText(
        'Decision for this submitted version',
      )) as HTMLSelectElement;
      const reasonInput = screen.getByLabelText('Reason') as HTMLTextAreaElement;
      const submitBtn = screen.getByRole('button', { name: 'Record Bureau decision' });
      const refreshBtn = screen.getByRole('button', { name: 'Refresh queue' });

      fireEvent.change(select, { target: { value: 'approve' } });
      fireEvent.change(reasonInput, {
        target: { value: 'Valid licensing documentation verified.' },
      });

      expect(submitBtn.hasAttribute('disabled')).toBe(false);

      fireEvent.click(submitBtn);

      // In-flight pending state assertions
      expect(submitBtn.hasAttribute('disabled')).toBe(true);
      expect(submitBtn.textContent).toBe('Recording decision…');
      expect(submitBtn.getAttribute('aria-busy')).toBe('true');
      expect(select.hasAttribute('disabled')).toBe(true);
      expect(reasonInput.hasAttribute('disabled')).toBe(true);
      expect(refreshBtn.hasAttribute('disabled')).toBe(true);

      // Attempt second click while pending
      fireEvent.click(submitBtn);
      expect(mockApiClient.decideHotelApplication).toHaveBeenCalledTimes(1);

      // Resolve decision
      mockApiClient.getBureauHotelCases.mockResolvedValueOnce({ items: [] });
      resolveDecision(mockBureauCase({ status: 'approved', caseStatus: 'approved' }));

      await waitFor(() => {
        expect(
          screen.getByText('No cases were returned for this account and scope.'),
        ).toBeDefined();
      });
    });

    it('disables submit button and form controls on Administrator screen while admission is in-flight', async () => {
      let resolveAdmission: (val: unknown) => void = () => {};
      const pendingPromise = new Promise((res) => {
        resolveAdmission = res;
      });

      mockApiClient.getHotelAdmissionQueue.mockResolvedValueOnce({
        items: [mockAdminApplication()],
      });
      mockApiClient.decideHotelAdmission.mockReturnValueOnce(pendingPromise);

      render(
        <HotelPilotSessionProvider accessToken={token}>
          <AdminHotelAdmissionsScreen />
        </HotelPilotSessionProvider>,
      );

      const select = (await screen.findByLabelText(
        'Private platform admission decision',
      )) as HTMLSelectElement;
      const reasonInput = screen.getByLabelText('Reason') as HTMLTextAreaElement;
      const submitBtn = screen.getByRole('button', { name: 'Record private admission decision' });
      const refreshBtn = screen.getByRole('button', { name: 'Refresh queue' });

      fireEvent.change(select, { target: { value: 'admit' } });
      fireEvent.change(reasonInput, {
        target: { value: 'Workspace admitted based on Bureau approval.' },
      });

      expect(submitBtn.hasAttribute('disabled')).toBe(false);

      fireEvent.click(submitBtn);

      // In-flight pending state assertions
      expect(submitBtn.hasAttribute('disabled')).toBe(true);
      expect(submitBtn.textContent).toBe('Recording decision…');
      expect(submitBtn.getAttribute('aria-busy')).toBe('true');
      expect(select.hasAttribute('disabled')).toBe(true);
      expect(reasonInput.hasAttribute('disabled')).toBe(true);
      expect(refreshBtn.hasAttribute('disabled')).toBe(true);

      // Attempt second click while pending
      fireEvent.click(submitBtn);
      expect(mockApiClient.decideHotelAdmission).toHaveBeenCalledTimes(1);

      // Resolve admission
      mockApiClient.getHotelAdmissionQueue.mockResolvedValueOnce({ items: [] });
      resolveAdmission(mockAdminApplication({ admissionStatus: 'admitted' }));

      await waitFor(() => {
        expect(
          screen.getByText('No eligible applications were returned by the API.'),
        ).toBeDefined();
      });
    });
  });

  describe('2. Reason requirement validation', () => {
    it('enforces required non-empty reason and maximum 1000 character length', async () => {
      mockApiClient.getBureauHotelCases.mockResolvedValueOnce({
        items: [mockBureauCase()],
      });

      render(
        <HotelPilotSessionProvider accessToken={token}>
          <BureauHotelCasesScreen />
        </HotelPilotSessionProvider>,
      );

      const select = (await screen.findByLabelText(
        'Decision for this submitted version',
      )) as HTMLSelectElement;
      const reasonInput = screen.getByLabelText('Reason') as HTMLTextAreaElement;
      const submitBtn = screen.getByRole('button', { name: 'Record Bureau decision' });

      fireEvent.change(select, { target: { value: 'approve' } });

      // Initially empty reason - button disabled
      expect(submitBtn.hasAttribute('disabled')).toBe(true);
      expect(screen.getByText('0 / 1000 characters (required)')).toBeDefined();

      // Whitespace only - button remains disabled
      fireEvent.change(reasonInput, { target: { value: '     ' } });
      expect(submitBtn.hasAttribute('disabled')).toBe(true);
      expect(screen.getByText('0 / 1000 characters (required)')).toBeDefined();

      // Textarea has maxLength="1000"
      expect(reasonInput.getAttribute('maxLength')).toBe('1000');

      // Valid reason within limit (36 characters)
      fireEvent.change(reasonInput, { target: { value: 'Verified property and documentation.' } });
      expect(screen.getByText('36 / 1000 characters (required)')).toBeDefined();
      expect(submitBtn.hasAttribute('disabled')).toBe(false);

      // Submit sends trimmed reason
      mockApiClient.decideHotelApplication.mockResolvedValueOnce(mockBureauCase());
      mockApiClient.getBureauHotelCases.mockResolvedValueOnce({ items: [] });

      fireEvent.change(reasonInput, {
        target: { value: '   Verified property and documentation.   ' },
      });
      fireEvent.click(submitBtn);

      await waitFor(() => {
        expect(mockApiClient.decideHotelApplication).toHaveBeenCalledWith(
          'case-bureau-1',
          {
            expectedVersion: 2,
            decision: 'approve',
            reason: 'Verified property and documentation.',
          },
          { accessToken: token },
        );
      });
    });
  });

  describe('3. Stale-version conflict handling with preserved reason and explicit refresh', () => {
    it('preserves entered reason on Bureau 409 conflict, displays conflict alert, and allows refresh', async () => {
      const { ApiClientError } = await import('@ethio-tour/api-client');

      mockApiClient.getBureauHotelCases.mockResolvedValueOnce({
        items: [mockBureauCase({ currentVersion: 2, version: 2 })],
      });
      mockApiClient.decideHotelApplication.mockRejectedValueOnce(
        new ApiClientError('Conflict', 409, 'conflict'),
      );

      render(
        <HotelPilotSessionProvider accessToken={token}>
          <BureauHotelCasesScreen />
        </HotelPilotSessionProvider>,
      );

      const select = (await screen.findByLabelText(
        'Decision for this submitted version',
      )) as HTMLSelectElement;
      const reasonInput = screen.getByLabelText('Reason') as HTMLTextAreaElement;
      const submitBtn = screen.getByRole('button', { name: 'Record Bureau decision' });

      fireEvent.change(select, { target: { value: 'reject' } });
      fireEvent.change(reasonInput, {
        target: { value: 'Missing fire safety inspection certificate.' },
      });

      fireEvent.click(submitBtn);

      // Conflict error appears with explanation
      const alert = await screen.findByRole('alert');
      expect(alert.textContent).toContain('Application version conflict');
      expect(alert.textContent).toContain('Your entered reason has been preserved');
      expect(alert.textContent).toContain('Refresh the list');

      // Reason and decision are strictly preserved in the form
      expect(reasonInput.value).toBe('Missing fire safety inspection certificate.');
      expect(select.value).toBe('reject');

      // Explicit refresh button is rendered
      const refreshCaseBtn = screen.getByRole('button', { name: 'Refresh case' });
      expect(refreshCaseBtn).toBeDefined();

      // Refreshing reloads the queue
      const updatedCase = mockBureauCase({ currentVersion: 3, version: 3 });
      mockApiClient.getBureauHotelCases.mockResolvedValueOnce({
        items: [updatedCase],
      });

      fireEvent.click(refreshCaseBtn);

      await waitFor(() => {
        expect(mockApiClient.getBureauHotelCases).toHaveBeenCalledTimes(2);
      });

      // After refresh, the preserved reason is still in the form and can be submitted with updated version 3
      expect(reasonInput.value).toBe('Missing fire safety inspection certificate.');
      mockApiClient.decideHotelApplication.mockResolvedValueOnce(updatedCase);
      mockApiClient.getBureauHotelCases.mockResolvedValueOnce({ items: [] });

      fireEvent.click(screen.getByRole('button', { name: 'Record Bureau decision' }));

      await waitFor(() => {
        expect(mockApiClient.decideHotelApplication).toHaveBeenCalledWith(
          'case-bureau-1',
          {
            expectedVersion: 3,
            decision: 'reject',
            reason: 'Missing fire safety inspection certificate.',
          },
          { accessToken: token },
        );
      });
    });

    it('preserves entered reason on Administrator 409 conflict and provides explicit refresh', async () => {
      const { ApiClientError } = await import('@ethio-tour/api-client');

      mockApiClient.getHotelAdmissionQueue.mockResolvedValueOnce({
        items: [mockAdminApplication({ currentVersion: 3, version: 4 })],
      });
      mockApiClient.decideHotelAdmission.mockRejectedValueOnce(
        new ApiClientError('Conflict', 409, 'conflict'),
      );

      render(
        <HotelPilotSessionProvider accessToken={token}>
          <AdminHotelAdmissionsScreen />
        </HotelPilotSessionProvider>,
      );

      const select = (await screen.findByLabelText(
        'Private platform admission decision',
      )) as HTMLSelectElement;
      const reasonInput = screen.getByLabelText('Reason') as HTMLTextAreaElement;
      const submitBtn = screen.getByRole('button', { name: 'Record private admission decision' });

      fireEvent.change(select, { target: { value: 'admit' } });
      fireEvent.change(reasonInput, {
        target: { value: 'Carefully reviewed commercial license.' },
      });

      fireEvent.click(submitBtn);

      // Conflict error appears
      const alert = await screen.findByRole('alert');
      expect(alert.textContent).toContain('Application version conflict');
      expect(alert.textContent).toContain('Your entered reason has been preserved');

      // Reason and decision are preserved
      expect(reasonInput.value).toBe('Carefully reviewed commercial license.');
      expect(select.value).toBe('admit');

      // Explicit refresh button
      const refreshAppBtn = screen.getByRole('button', { name: 'Refresh application' });
      expect(refreshAppBtn).toBeDefined();

      const updatedApp = mockAdminApplication({ currentVersion: 4, version: 5 });
      mockApiClient.getHotelAdmissionQueue.mockResolvedValueOnce({
        items: [updatedApp],
      });

      fireEvent.click(refreshAppBtn);

      await waitFor(() => {
        expect(mockApiClient.getHotelAdmissionQueue).toHaveBeenCalledTimes(2);
      });

      expect(reasonInput.value).toBe('Carefully reviewed commercial license.');
    });
  });

  describe('4. Preventing older asynchronous responses from replacing newer results', () => {
    it('ignores older asynchronous response when a newer refresh completes first', async () => {
      let resolveFirstCall: (val: unknown) => void = () => {};
      const slowPromise = new Promise((res) => {
        resolveFirstCall = res;
      });

      // Initial mount call is slow
      mockApiClient.getBureauHotelCases.mockReturnValueOnce(slowPromise);

      const { rerender } = render(
        <HotelPilotSessionProvider accessToken={token}>
          <BureauHotelCasesScreen />
        </HotelPilotSessionProvider>,
      );

      expect(screen.getByRole('status').textContent).toContain('Loading assigned cases');

      // A newer refresh resolves quickly with newer data
      const newerCases = [
        mockBureauCase({ id: 'app-newer', caseId: 'case-newer', currentVersion: 5 }),
      ];
      mockApiClient.getBureauHotelCases.mockResolvedValueOnce({ items: newerCases });

      rerender(
        <HotelPilotSessionProvider accessToken="token-refresh-2">
          <BureauHotelCasesScreen />
        </HotelPilotSessionProvider>,
      );

      await waitFor(() => {
        expect(screen.getByText('Case · application version 5')).toBeDefined();
      });

      // Now the older first call resolves with stale data
      const staleCases = [
        mockBureauCase({ id: 'app-stale', caseId: 'case-stale', currentVersion: 1 }),
      ];
      resolveFirstCall({ items: staleCases });

      // Ensure the stale data was ignored and newer data remains displayed
      await waitFor(() => {
        expect(screen.queryByText('Case · application version 1')).toBeNull();
        expect(screen.getByText('Case · application version 5')).toBeDefined();
      });
    });
  });

  describe('5. Clearing private case data when session ends or access is revoked', () => {
    it('clears displayed Bureau case data when user signs out or accessToken becomes null', async () => {
      mockApiClient.getBureauHotelCases.mockResolvedValueOnce({
        items: [mockBureauCase()],
      });

      const { rerender } = render(
        <HotelPilotSessionProvider accessToken={token}>
          <BureauHotelCasesScreen />
        </HotelPilotSessionProvider>,
      );

      await screen.findByText('Axum Heritage Hotel');
      expect(screen.getByText('Case · application version 2')).toBeDefined();

      // Session ends (accessToken becomes null)
      rerender(
        <HotelPilotSessionProvider accessToken={null}>
          <BureauHotelCasesScreen />
        </HotelPilotSessionProvider>,
      );

      // Private case details are no longer visible, signed-out screen is shown
      expect(screen.queryByText('Axum Heritage Hotel')).toBeNull();
      expect(screen.getByText('Authenticated workspace session unavailable')).toBeDefined();
    });

    it('clears displayed private data when access is revoked with HTTP 403 Forbidden', async () => {
      const { ApiClientError } = await import('@ethio-tour/api-client');

      mockApiClient.getBureauHotelCases.mockResolvedValueOnce({
        items: [mockBureauCase()],
      });

      render(
        <HotelPilotSessionProvider accessToken={token}>
          <BureauHotelCasesScreen />
        </HotelPilotSessionProvider>,
      );

      await screen.findByText('Axum Heritage Hotel');

      // Reviewer clicks refresh, but their grant was revoked in the background
      mockApiClient.getBureauHotelCases.mockRejectedValueOnce(
        new ApiClientError('Forbidden', 403, 'forbidden'),
      );

      fireEvent.click(screen.getByRole('button', { name: 'Refresh queue' }));

      // Private cases are cleared and 403 error is presented cleanly
      await waitFor(() => {
        expect(screen.queryByText('Axum Heritage Hotel')).toBeNull();
        expect(screen.getByRole('alert').textContent).toContain('Your account is not permitted');
      });
    });

    it('clears displayed private data when unauthorized event fires', async () => {
      mockApiClient.getBureauHotelCases.mockResolvedValueOnce({
        items: [mockBureauCase()],
      });

      render(
        <HotelPilotSessionProvider accessToken={token}>
          <BureauHotelCasesScreen />
        </HotelPilotSessionProvider>,
      );

      await screen.findByText('Axum Heritage Hotel');

      // API unauthorized event occurs
      fireEvent(window, new Event('ethio-tour:unauthorized'));

      await waitFor(() => {
        expect(screen.queryByText('Axum Heritage Hotel')).toBeNull();
        expect(screen.getByRole('alert').textContent).toContain(
          'Your authenticated session is missing or has expired',
        );
      });
    });
  });

  describe('6. Clear error presentation without raw responses or internal identifiers', () => {
    it('presents network failures safely without internal details', async () => {
      mockApiClient.getBureauHotelCases.mockRejectedValueOnce(
        new TypeError('Failed to fetch: connect ECONNREFUSED 127.0.0.1:4000'),
      );

      render(
        <HotelPilotSessionProvider accessToken={token}>
          <BureauHotelCasesScreen />
        </HotelPilotSessionProvider>,
      );

      const alert = await screen.findByRole('alert');
      expect(alert.textContent).toBe(
        'The service could not complete loading the assigned Bureau queue. Check the connection and retry.',
      );
      expect(alert.textContent).not.toContain('ECONNREFUSED');
      expect(alert.textContent).not.toContain('127.0.0.1');
    });
  });

  describe('7. Clear identification of application version and submitted location', () => {
    it('clearly presents the covered version and location in the decision coverage summary', async () => {
      mockApiClient.getBureauHotelCases.mockResolvedValueOnce({
        items: [mockBureauCase({ currentVersion: 4 })],
      });

      render(
        <HotelPilotSessionProvider accessToken={token}>
          <BureauHotelCasesScreen />
        </HotelPilotSessionProvider>,
      );

      await screen.findByText('Axum Heritage Hotel');

      const coverageNotice = screen.getByText((_, element) => {
        return (
          element?.className === 'decision-coverage-text' &&
          Boolean(element?.textContent?.includes('Decision target: Application version 4'))
        );
      });
      expect(coverageNotice).toBeDefined();
      expect(screen.getAllByText('Tigray / Axum Town').length).toBeGreaterThanOrEqual(2);
    });

    it('clearly presents version and location on Administrator admission screen', async () => {
      mockApiClient.getHotelAdmissionQueue.mockResolvedValueOnce({
        items: [mockAdminApplication({ currentVersion: 3 })],
      });

      render(
        <HotelPilotSessionProvider accessToken={token}>
          <AdminHotelAdmissionsScreen />
        </HotelPilotSessionProvider>,
      );

      await screen.findByText('Lalibela Rock Hotel');

      const coverageNotice = screen.getByText((_, element) => {
        return (
          element?.className === 'decision-coverage-text' &&
          Boolean(element?.textContent?.includes('Decision target: Application version 3'))
        );
      });
      expect(coverageNotice).toBeDefined();
      expect(screen.getAllByText('Amhara / Lalibela Town').length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('8. Keyboard accessibility and focus operation', () => {
    it('submits form on Ctrl+Enter from reason textarea when valid', async () => {
      mockApiClient.getBureauHotelCases.mockResolvedValueOnce({
        items: [mockBureauCase()],
      });
      mockApiClient.decideHotelApplication.mockResolvedValueOnce(mockBureauCase());
      mockApiClient.getBureauHotelCases.mockResolvedValueOnce({ items: [] });

      render(
        <HotelPilotSessionProvider accessToken={token}>
          <BureauHotelCasesScreen />
        </HotelPilotSessionProvider>,
      );

      const select = (await screen.findByLabelText(
        'Decision for this submitted version',
      )) as HTMLSelectElement;
      const reasonInput = screen.getByLabelText('Reason') as HTMLTextAreaElement;

      fireEvent.change(select, { target: { value: 'approve' } });
      fireEvent.change(reasonInput, { target: { value: 'Approved via keyboard shortcut.' } });

      // Press Ctrl+Enter
      fireEvent.keyDown(reasonInput, { key: 'Enter', ctrlKey: true });

      await waitFor(() => {
        expect(mockApiClient.decideHotelApplication).toHaveBeenCalledWith(
          'case-bureau-1',
          {
            expectedVersion: 2,
            decision: 'approve',
            reason: 'Approved via keyboard shortcut.',
          },
          { accessToken: token },
        );
      });
    });
  });
});
