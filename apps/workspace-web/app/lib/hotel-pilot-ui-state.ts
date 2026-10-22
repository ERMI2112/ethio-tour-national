import { ApiClientError } from '@ethio-tour/api-client';
import type {
  decideHotelAdmission,
  decideHotelApplication,
  getBureauHotelCases,
  getMyHotelApplications,
} from '@ethio-tour/api-client';
import type { HotelLocation, HotelSubmittedLocation } from '@ethio-tour/contracts';

export type HotelApplicationResponse = Awaited<
  ReturnType<typeof getMyHotelApplications>
>['items'][number];
export type HotelBureauCaseResponse = Awaited<
  ReturnType<typeof getBureauHotelCases>
>['items'][number];
export type HotelApplicationContent = HotelApplicationResponse['content'];
export type HotelApplicationDecision = Parameters<typeof decideHotelApplication>[1]['decision'];
export type HotelAdmissionDecision = Parameters<typeof decideHotelAdmission>[1]['decision'];

export const MAX_DECISION_REASON_LENGTH = 1000;

export function isDecisionReasonValid(reason: string): boolean {
  const trimmed = reason.trim();
  return trimmed.length > 0 && trimmed.length <= MAX_DECISION_REASON_LENGTH;
}

export function formatLocationHierarchy(
  location: HotelLocation | HotelSubmittedLocation | null | undefined,
): string {
  if (!location) return 'No submitted location recorded';
  if (
    'hierarchy' in location &&
    Array.isArray(location.hierarchy) &&
    location.hierarchy.length > 0
  ) {
    return location.hierarchy
      .map((node) => {
        if ('displayName' in node && typeof node.displayName === 'string') return node.displayName;
        if ('label' in node && typeof node.label === 'string') return node.label;
        return 'Unknown unit';
      })
      .join(' / ');
  }
  if ('displayName' in location && typeof location.displayName === 'string') {
    return location.displayName;
  }
  if ('label' in location && typeof location.label === 'string') {
    return location.label;
  }
  return 'Applicant-declared location';
}

export function canSubmitHotelApplication(application: HotelApplicationResponse) {
  return application.status === 'draft';
}

export function canEditHotelApplication(application: HotelApplicationResponse) {
  return (
    ['draft', 'changes_requested', 'approved'].includes(application.status) &&
    application.admissionStatus !== 'declined'
  );
}

export function applicationVersionLabel(application: HotelApplicationResponse) {
  if (application.status === 'draft') {
    return application.currentVersionId === null
      ? 'Draft · not submitted'
      : `Draft for next Bureau review · previous submitted version ${application.currentVersion}`;
  }

  return `Submitted application version ${application.currentVersion}`;
}

export function canDecideBureauCase(caseItem: HotelBureauCaseResponse) {
  return caseItem.caseStatus === 'submitted' || caseItem.caseStatus === 'in_review';
}

export function canDecideHotelAdmission(application: HotelApplicationResponse) {
  return (
    application.status === 'approved' &&
    application.admissionStatus === 'pending' &&
    application.bureauDecision?.decision === 'approve' &&
    application.bureauDecision.applicationVersion === application.currentVersion
  );
}

export function describeApiFailure(error: unknown, operation: string) {
  if (error instanceof ApiClientError) {
    if (error.status === 401) return 'Your authenticated session is missing or has expired.';
    if (error.status === 403) return 'Your account is not permitted to perform this action.';
    if (error.status === 404) return 'This record is unavailable or could not be found.';
    if (error.status === 409) return 'The record changed. Refresh the list before trying again.';
    return `${operation} could not be completed (HTTP ${error.status}).`;
  }

  return `The service could not complete ${operation}. Check the connection and retry.`;
}
