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
