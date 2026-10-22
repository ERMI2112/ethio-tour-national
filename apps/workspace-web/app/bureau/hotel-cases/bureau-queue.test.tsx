// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { ApiClientError } from '@ethio-tour/api-client';
import type * as ApiClient from '@ethio-tour/api-client';
import type { HotelBureauCaseResponse } from '../../lib/hotel-pilot-ui-state';
import { HotelPilotSessionProvider } from '../../lib/hotel-pilot-session';
import { BureauHotelCasesScreen } from './screen';

const api = vi.hoisted(() => ({
  getBureauHotelCases: vi.fn(),
  decideHotelApplication: vi.fn(),
}));
vi.mock('@ethio-tour/api-client', async (original) => ({
  ...(await original<typeof ApiClient>()),
  ...api,
}));

function fixture(
  id: string,
  overrides: Partial<HotelBureauCaseResponse> = {},
): HotelBureauCaseResponse {
  return {
    id: `application-${id}`,
    caseId: `case-${id}`,
    caseStatus: 'submitted',
    status: 'submitted',
    admissionStatus: 'pending',
    currentVersion: 3,
    currentVersionId: `revision-${id}`,
    admittedVersion: null,
    version: 7,
    content: {
      claimedHotelName: `Synthetic Hotel ${id}`,
      applicantNotes: 'Synthetic applicant notes',
    },
    location: null,
    submittedLocation: {
      geographyReleaseId: 'synthetic-release',
      unitId: `unit-${id}`,
      unitRevisionId: `unit-revision-${id}`,
      unitType: 'demo-locality',
      displayName: `Synthetic Place ${id}`,
      hierarchy: [
        {
          unitId: 'root',
          unitRevisionId: 'root-r1',
          unitType: 'demo-area',
          displayName: 'Synthetic Area',
        },
        {
          unitId: `unit-${id}`,
          unitRevisionId: `unit-revision-${id}`,
          unitType: 'demo-locality',
          displayName: `Synthetic Place ${id}`,
        },
      ],
    },
    locationState: 'submitted_snapshot',
    bureauDecision: null,
    admissionDecision: null,
    historicalBureauDecisions: [],
    historicalAdmissionDecisions: [],
    workspaceAccess: 'not_admitted',
    assignment: null,
    notice:
      'Synthetic pilot review result; not a license or proof of authority to represent a hotel.',
    ...overrides,
  };
}

function view(token: string | null = 'synthetic-session-a') {
  return (
    <HotelPilotSessionProvider accessToken={token}>
      <BureauHotelCasesScreen />
    </HotelPilotSessionProvider>
  );
}

function search(value: string) {
  fireEvent.change(screen.getByLabelText('Search loaded cases'), { target: { value } });
}

function fill(card: HTMLElement, reason: string) {
  fireEvent.change(within(card).getByLabelText('Decision for this submitted version'), {
    target: { value: 'request_changes' },
  });
  fireEvent.change(within(card).getByLabelText('Reason'), { target: { value: reason } });
}

describe('Bureau loaded queue presentation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.getBureauHotelCases.mockResolvedValue({
      items: [fixture('Alpha'), fixture('Beta', { caseStatus: 'in_review', version: 11 })],
    });
    api.decideHotelApplication.mockResolvedValue({});
  });
  afterEach(cleanup);

  it('searches returned hotel names and submitted hierarchy, combines state filters, and resets accurate loaded counts', async () => {
    render(view());
    await screen.findByText('Showing 2 of 2 loaded cases');
    search('  HOTEL ALPHA  ');
    expect(screen.getByText('Showing 1 of 2 loaded cases')).toBeTruthy();
    expect(screen.getAllByRole('article')).toHaveLength(1);
    search('synthetic area');
    expect(screen.getAllByRole('article')).toHaveLength(2);
    fireEvent.change(screen.getByLabelText('Review state'), { target: { value: 'in_review' } });
    expect(screen.getAllByRole('article')).toHaveLength(1);
    expect(screen.getByRole('article', { name: 'Synthetic Hotel Beta' })).toBeTruthy();
    search('Place Alpha');
    expect(screen.getByText('No loaded cases match these filters.')).toBeTruthy();
    expect(screen.getByText('Showing 0 of 2 loaded cases')).toBeTruthy();
    expect(screen.queryByText('No cases were returned for this account and scope.')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Reset filters' }));
    expect(screen.getByText('Showing 2 of 2 loaded cases')).toBeTruthy();
    expect(api.getBureauHotelCases).toHaveBeenCalledTimes(1);
  });

  it('distinguishes an empty returned queue from filtered results', async () => {
    api.getBureauHotelCases.mockResolvedValue({ items: [] });
    render(view());
    await screen.findByText('No cases were returned for this account and scope.');
    search('unknown');
    expect(screen.getByText('Showing 0 of 0 loaded cases')).toBeTruthy();
    expect(screen.queryByText('No loaded cases match these filters.')).toBeNull();
  });

  it('preserves hidden forms and sends the visible case ID and concurrency version rather than its list position or submitted version', async () => {
    render(view());
    const alpha = await screen.findByRole('article', { name: 'Synthetic Hotel Alpha' });
    fill(alpha, 'Retain this Alpha reason');
    search('Beta');
    const beta = screen.getByRole('article', { name: 'Synthetic Hotel Beta' });
    fill(beta, 'Review Beta');
    api.getBureauHotelCases.mockResolvedValue({ items: [fixture('Alpha')] });
    fireEvent.click(within(beta).getByRole('button', { name: 'Record Bureau decision' }));
    await waitFor(() =>
      expect(api.decideHotelApplication).toHaveBeenCalledWith(
        'case-Beta',
        { expectedVersion: 11, decision: 'request_changes', reason: 'Review Beta' },
        { accessToken: 'synthetic-session-a' },
      ),
    );
    await screen.findByText('Showing 0 of 1 loaded cases');
    fireEvent.click(screen.getByRole('button', { name: 'Reset filters' }));
    const restored = screen.getByRole('article', { name: 'Synthetic Hotel Alpha' });
    expect((within(restored).getByLabelText('Reason') as HTMLTextAreaElement).value).toBe(
      'Retain this Alpha reason',
    );
    expect(
      (within(restored).getByLabelText('Decision for this submitted version') as HTMLSelectElement)
        .value,
    ).toBe('request_changes');
  });

  it('removes private filter text and pending form state during an identity switch even when the next identity receives the same case ID', async () => {
    const rendered = render(view());
    const alpha = await screen.findByRole('article', { name: 'Synthetic Hotel Alpha' });
    fill(alpha, 'Private reason from A');
    search('Alpha');
    let resolveQueue!: (value: { items: HotelBureauCaseResponse[] }) => void;
    api.getBureauHotelCases.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveQueue = resolve;
      }),
    );
    rendered.rerender(view('synthetic-session-b'));
    expect(screen.queryByRole('article')).toBeNull();
    expect(screen.queryByDisplayValue('Private reason from A')).toBeNull();
    expect((screen.getByLabelText('Search loaded cases') as HTMLInputElement).value).toBe('');
    await act(async () => resolveQueue({ items: [fixture('Alpha')] }));
    const newCard = screen.getByRole('article', { name: 'Synthetic Hotel Alpha' });
    expect((within(newCard).getByLabelText('Reason') as HTMLTextAreaElement).value).toBe('');
    expect(
      (within(newCard).getByLabelText('Decision for this submitted version') as HTMLSelectElement)
        .value,
    ).toBe('');
    rendered.rerender(view(null));
    expect(screen.queryByRole('article', { hidden: true })).toBeNull();
    expect(screen.queryByLabelText('Search loaded cases')).toBeNull();
  });

  it('reports refresh failure without presenting an empty success or losing the loaded queue', async () => {
    render(view());
    await screen.findByText('Showing 2 of 2 loaded cases');
    api.getBureauHotelCases.mockRejectedValueOnce(new Error('Synthetic network failure'));
    fireEvent.click(screen.getByRole('button', { name: 'Refresh queue' }));
    await screen.findByRole('alert');
    expect(
      screen.getByText('Previously loaded cases are shown until a refresh succeeds.'),
    ).toBeTruthy();
    expect(screen.getByText('Showing 2 of 2 loaded cases')).toBeTruthy();
    expect(screen.queryByText('No cases were returned for this account and scope.')).toBeNull();
  });

  it('removes even filtered-out private forms when refreshing returns 403', async () => {
    render(view());
    fill(
      await screen.findByRole('article', { name: 'Synthetic Hotel Alpha' }),
      'Hidden private reason',
    );
    search('Beta');
    api.getBureauHotelCases.mockRejectedValueOnce(new ApiClientError('Denied', 403));
    fireEvent.click(screen.getByRole('button', { name: 'Refresh queue' }));
    await screen.findByRole('alert');
    expect(screen.queryByRole('article', { hidden: true })).toBeNull();
    expect(screen.queryByDisplayValue('Hidden private reason')).toBeNull();
  });

  it('cannot bypass conflict recovery by filtering away a case and restoring it', async () => {
    render(view());
    const alpha = await screen.findByRole('article', { name: 'Synthetic Hotel Alpha' });
    fill(alpha, 'Reason requiring renewed review');
    api.decideHotelApplication.mockRejectedValueOnce(new ApiClientError('Stale', 409));
    fireEvent.click(within(alpha).getByRole('button', { name: 'Record Bureau decision' }));
    await within(alpha).findByRole('button', { name: 'Refresh case' });
    search('Beta');
    fireEvent.click(screen.getByRole('button', { name: 'Reset filters' }));
    fill(alpha, 'Reason requiring renewed review');
    expect(
      (within(alpha).getByRole('button', { name: 'Record Bureau decision' }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    api.getBureauHotelCases.mockResolvedValueOnce({
      items: [fixture('Alpha', { currentVersion: 4, version: 12 })],
    });
    fireEvent.click(within(alpha).getByRole('button', { name: 'Refresh case' }));
    const confirmation = await within(alpha).findByRole('checkbox');
    expect(
      (within(alpha).getByLabelText('Decision for this submitted version') as HTMLSelectElement)
        .value,
    ).toBe('');
    fill(alpha, 'Reason requiring renewed review');
    expect(
      (within(alpha).getByRole('button', { name: 'Record Bureau decision' }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    fireEvent.click(confirmation);
    fireEvent.click(within(alpha).getByRole('button', { name: 'Record Bureau decision' }));
    await waitFor(() =>
      expect(api.decideHotelApplication).toHaveBeenLastCalledWith(
        'case-Alpha',
        {
          expectedVersion: 12,
          decision: 'request_changes',
          reason: 'Reason requiring renewed review',
        },
        { accessToken: 'synthetic-session-a' },
      ),
    );
  });
});
