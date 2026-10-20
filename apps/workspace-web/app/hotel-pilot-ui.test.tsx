import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { HotelApplicantScreen } from './hotels/applicant-screen';
import { BureauHotelCasesScreen } from './bureau/hotel-cases/screen';
import { AdminHotelAdmissionsScreen } from './admin/hotel-admissions/screen';
import {
  applicationVersionLabel,
  canEditHotelApplication,
  canDecideBureauCase,
  canDecideHotelAdmission,
  canSubmitHotelApplication,
  describeApiFailure,
} from './lib/hotel-pilot-ui-state';
import { ApiClientError } from '@ethio-tour/api-client';
import type { HotelApplicationResponse, HotelBureauCaseResponse } from './lib/hotel-pilot-ui-state';

const application = (
  overrides: Partial<HotelApplicationResponse> = {},
): HotelApplicationResponse => ({
  id: 'app-1',
  status: 'approved',
  admissionStatus: 'pending',
  currentVersion: 3,
  currentVersionId: 'revision-3',
  content: { claimedHotelName: 'Synthetic sample hotel', applicantNotes: '' },
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

const bureauCase = (overrides: Partial<HotelBureauCaseResponse> = {}): HotelBureauCaseResponse => ({
  ...application({ status: 'in_review' }),
  caseId: 'case-1',
  caseStatus: 'in_review',
  ...overrides,
});

describe('hotel pilot screens', () => {
  it('does not request protected data when no authenticated session is connected', () => {
    for (const Screen of [
      HotelApplicantScreen,
      BureauHotelCasesScreen,
      AdminHotelAdmissionsScreen,
    ]) {
      const markup = renderToStaticMarkup(<Screen />);
      expect(markup).toContain('Authenticated workspace session unavailable');
      expect(markup).toContain('Do not enter or paste a token here.');
      expect(markup).toContain('not a license or proof of authority');
    }
  });

  it('only offers actions allowed by the contract state and exact approved version', () => {
    expect(canSubmitHotelApplication(application({ status: 'draft' }))).toBe(true);
    expect(canSubmitHotelApplication(application({ status: 'submitted' }))).toBe(false);
    expect(canEditHotelApplication(application({ status: 'draft' }))).toBe(true);
    expect(canEditHotelApplication(application({ status: 'changes_requested' }))).toBe(true);
    expect(canEditHotelApplication(application({ status: 'approved' }))).toBe(true);
    expect(
      canEditHotelApplication(application({ status: 'approved', admissionStatus: 'declined' })),
    ).toBe(false);
    expect(canEditHotelApplication(application({ status: 'submitted' }))).toBe(false);
    expect(applicationVersionLabel(application({ status: 'approved' }))).toBe(
      'Submitted application version 3',
    );
    expect(
      applicationVersionLabel(application({ status: 'draft', currentVersionId: 'version-3' })),
    ).toContain('previous submitted version 3');
    expect(canDecideBureauCase(bureauCase({ caseStatus: 'in_review' }))).toBe(true);
    expect(canDecideBureauCase(bureauCase({ caseStatus: 'rejected' }))).toBe(false);
    expect(canDecideHotelAdmission(application())).toBe(true);
    expect(
      canDecideHotelAdmission(
        application({
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
    expect(describeApiFailure(new ApiClientError('generic', 409), 'loading the queue')).toContain(
      'Refresh the list',
    );
    expect(describeApiFailure(new Error('network'), 'loading the queue')).toContain(
      'connection and retry',
    );
  });
});
