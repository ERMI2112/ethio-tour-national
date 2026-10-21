export interface HealthResponse {
  service: string;
  status: 'ok';
  phase: '1A' | '1B';
  timestamp: string;
}

export type RegistryResourceKind = 'destination' | 'attraction';
export type ReviewDecision = 'approve' | 'request_changes' | 'reject';
export type RegistryRevisionState =
  | 'draft'
  | 'submitted'
  | 'changes_requested'
  | 'rejected'
  | 'approved';

export interface EditorialContent {
  title: string;
  summary: string;
}

export interface CreateDestinationRequest {
  organizationId: string;
  administrativeUnitId: string;
  content: EditorialContent;
}

export interface CreateAttractionRequest {
  organizationId: string;
  administrativeUnitId: string;
  destinationId: string;
  content: EditorialContent;
}

export interface CreateRevisionRequest {
  expectedVersion: number;
  content: EditorialContent;
}

export interface SubmitRevisionRequest {
  expectedVersion: number;
  revisionId: string;
}

export interface ReviewRevisionRequest extends SubmitRevisionRequest {
  decision: ReviewDecision;
  reason: string;
}

export type PublishRevisionRequest = SubmitRevisionRequest;

export interface WithdrawPublicationRequest {
  expectedVersion: number;
  reason: string;
}

export interface RegistryResourceResponse {
  id: string;
  kind: RegistryResourceKind;
  ownerOrganizationId: string;
  administrativeUnitId: string;
  destinationId: string | null;
  revisionId: string;
  revisionNumber: number;
  revisionState: RegistryRevisionState;
  version: number;
}

export interface PrivateRegistryResourceResponse extends RegistryResourceResponse {
  content: EditorialContent;
  publishedRevisionId: string | null;
}

export interface PublicDestination {
  id: string;
  title: string;
  summary: string;
  revisionId: string;
}

export interface PublicAttraction {
  id: string;
  destinationId: string;
  title: string;
  summary: string;
  revisionId: string;
}

export interface PublicRegistryList<T> {
  items: T[];
}

export type HotelApplicationDecision = 'approve' | 'request_changes' | 'reject';
export type HotelAdmissionDecision = 'admit' | 'decline';
export const HOTEL_APPLICATION_STATUSES = [
  'draft',
  'submitted',
  'changes_requested',
  'approved',
  'rejected',
] as const;
export type HotelApplicationStatus = (typeof HOTEL_APPLICATION_STATUSES)[number];
export const HOTEL_BUREAU_CASE_STATUSES = [
  'submitted',
  'in_review',
  'changes_requested',
  'approved',
  'rejected',
] as const;
export type HotelBureauCaseStatus = (typeof HOTEL_BUREAU_CASE_STATUSES)[number];
export type HotelAdmissionStatus = 'not_eligible' | 'pending' | 'admitted' | 'declined';

export interface HotelApplicationContent {
  claimedHotelName: string;
  applicantNotes: string;
  /** Legacy selection retained only when reading/updating pre-directory drafts. */
  administrativeUnitId?: string;
  /** Required for new submissions; references one immutable directory release. */
  locationSelection?: HotelLocationSelection;
}

export interface HotelLocationSelection {
  geographyReleaseId: string;
  unitId: string;
  unitRevisionId: string;
}

export interface HotelLocationSearchQuery {
  query?: string;
  language?: string;
  limit?: number;
  cursor?: string;
}

export type HotelLocationErrorCode =
  | 'INVALID_QUERY'
  | 'LOCATION_RELEASE_STALE'
  | 'HOTEL_ROUTING_UNAVAILABLE'
  | 'LOCATION_DIRECTORY_UNAVAILABLE';

export interface HotelLocationDirectoryRelease {
  id: string;
  sourceEdition: string;
  effectiveFrom: string | null;
  synthetic: boolean;
}

export interface HotelLocationNode {
  unitId: string;
  unitRevisionId: string;
  unitType: string;
  displayName: string;
}

export interface HotelLocationSearchResult extends HotelLocationNode {
  /** Root-to-selected-unit path from the same immutable release. */
  hierarchy: HotelLocationNode[];
  matchedName: {
    value: string;
    language: string;
    script: string | null;
  };
}

export interface HotelLocationSearchResponse {
  directoryRelease: HotelLocationDirectoryRelease;
  items: HotelLocationSearchResult[];
  nextCursor: string | null;
}

/** Location snapshot attached to one submitted application version. */
export interface HotelSubmittedLocation {
  geographyReleaseId: string;
  unitId: string;
  unitRevisionId: string;
  unitType: string;
  displayName: string;
  hierarchy: HotelLocationNode[];
}

/** Assignment is returned only by an already-authorized Bureau case endpoint. */
export interface HotelBureauAssignmentSummary {
  routingReleaseId: string;
  routingRuleId: string;
  organizationId: string;
  scopeUnitId: string;
}

/** @deprecated Legacy projection retained for historical application responses. */
export interface LegacyHotelLocationNode {
  id: string;
  label: string;
  parentId: string | null;
}

/** @deprecated Legacy projection retained for historical application responses. */
export interface HotelLocation extends LegacyHotelLocationNode {
  /** Root-to-selected-node labels, with no office or authorization metadata. */
  hierarchy: LegacyHotelLocationNode[];
}

export interface HotelLocationDirectoryResponse {
  items: HotelLocation[];
}

export interface CreateHotelApplicationRequest {
  content: HotelApplicationContent;
}

export interface UpdateHotelApplicationRequest {
  expectedVersion: number;
  content: HotelApplicationContent;
}

export interface SubmitHotelApplicationRequest {
  expectedVersion: number;
}

export interface DecideHotelApplicationRequest {
  expectedVersion: number;
  decision: HotelApplicationDecision;
  reason: string;
}

export interface DecideHotelAdmissionRequest {
  expectedVersion: number;
  decision: HotelAdmissionDecision;
  reason: string;
}

export interface HotelBureauDecisionSummary {
  decision: HotelApplicationDecision;
  applicationVersion: number;
  reason: string;
  decidedAt: string;
}

export interface HotelAdmissionDecisionSummary {
  decision: HotelAdmissionDecision;
  applicationVersion: number;
  reason: string;
  decidedAt: string;
}

export interface HotelApplicationResponse {
  id: string;
  status: HotelApplicationStatus;
  admissionStatus: HotelAdmissionStatus;
  currentVersion: number;
  currentVersionId: string | null;
  /** Version with an Administrator admission decision; does not imply the current version is approved. */
  admittedVersion: number | null;
  content: HotelApplicationContent;
  location: HotelSubmittedLocation | HotelLocation | null;
  locationState: 'unselected' | 'current' | 'stale' | 'legacy' | 'submitted_snapshot';
  bureauDecision: HotelBureauDecisionSummary | null;
  admissionDecision: HotelAdmissionDecisionSummary | null;
  /** Earlier decisions, returned only to the profile that owns the application. */
  historicalBureauDecisions: HotelBureauDecisionSummary[];
  historicalAdmissionDecisions: HotelAdmissionDecisionSummary[];
  workspaceAccess: 'not_admitted' | 'private_only';
  notice: 'Synthetic pilot review result; not a license or proof of authority to represent a hotel.';
  version: number;
}

export interface HotelApplicationListResponse {
  items: HotelApplicationResponse[];
}

export interface HotelBureauCaseResponse extends HotelApplicationResponse {
  caseId: string;
  caseStatus: HotelBureauCaseStatus;
  submittedLocation: HotelSubmittedLocation | HotelLocation | null;
  assignment: HotelBureauAssignmentSummary | null;
}

export interface HotelBureauCaseListResponse {
  items: HotelBureauCaseResponse[];
}

export interface HotelAdmissionQueueResponse {
  items: HotelApplicationResponse[];
}
