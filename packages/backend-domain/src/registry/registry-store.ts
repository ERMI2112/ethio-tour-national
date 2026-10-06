import type { AuthorizationContext } from '@ethio-tour/authz';
import type { EditorialContent, RegistryResourceKind, ReviewDecision } from '@ethio-tour/contracts';

export interface RegistryActor {
  issuer: string;
  subjectId: string;
}

export interface UnitScope {
  id: string;
  isSynthetic: boolean;
  ancestorIds: readonly string[];
}

export interface RegistryResourceRecord {
  id: string;
  kind: RegistryResourceKind;
  ownerOrganizationId: string;
  administrativeUnitId: string;
  destinationId: string | null;
  createdByMembershipId: string;
  currentRevisionId: string | null;
  currentRevisionNumber: number;
  currentPublicationReleaseId: string | null;
  currentPublicationRevisionId: string | null;
  version: number;
  isSynthetic: boolean;
}

export interface ResourceRevisionRecord {
  id: string;
  resourceId: string;
  revisionNumber: number;
  author: RegistryActor;
  authorMembershipId: string;
  content: EditorialContent;
  contentHash: string;
}

export interface SubmissionRecord {
  id: string;
  resourceId: string;
  revisionId: string;
  submittedBy: RegistryActor;
  submittedByMembershipId: string;
  reviewDecision: ReviewDecisionRecord | null;
}

export interface ReviewDecisionRecord {
  decision: ReviewDecision;
  reviewer: RegistryActor;
  reviewerMembershipId: string;
  reason: string;
  policyVersion: string;
}

export interface PublicResourceRecord {
  id: string;
  kind: RegistryResourceKind;
  destinationId: string | null;
  revisionId: string;
  content: EditorialContent;
}

export interface AuditRecord {
  actor: RegistryActor | null;
  membershipId: string | null;
  action: string;
  outcome: 'allowed' | 'denied';
  resourceId: string | null;
  revisionId: string | null;
  reasonCode: string | null;
  policyVersion: string;
  details: Record<string, string | number | boolean | null>;
}

export interface OutboxRecord {
  eventType: string;
  resourceId: string;
  revisionId: string | null;
  recipientSubjectIds: readonly string[];
  payload: Record<string, string>;
}

export interface RegistryTransaction {
  getAuthorizationContext(actor: RegistryActor): Promise<AuthorizationContext>;
  getUnitScope(unitId: string): Promise<UnitScope | null>;
  getResource(resourceId: string, forUpdate?: boolean): Promise<RegistryResourceRecord | null>;
  getRevision(resourceId: string, revisionId: string): Promise<ResourceRevisionRecord | null>;
  getCurrentRevision(resource: RegistryResourceRecord): Promise<ResourceRevisionRecord | null>;
  getSubmission(revisionId: string): Promise<SubmissionRecord | null>;
  isDestinationPublic(destinationId: string): Promise<boolean>;
  nextReleaseNumber(resourceId: string): Promise<number>;
  findReviewRecipients(resource: RegistryResourceRecord): Promise<string[]>;
  createResource(resource: RegistryResourceRecord): Promise<void>;
  createRevision(revision: ResourceRevisionRecord): Promise<void>;
  setCurrentRevision(resourceId: string, revisionId: string, revisionNumber: number): Promise<void>;
  incrementVersion(resourceId: string): Promise<void>;
  createSubmission(submission: Omit<SubmissionRecord, 'reviewDecision'>): Promise<void>;
  createReviewDecision(submissionId: string, decision: ReviewDecisionRecord): Promise<void>;
  createRelease(input: {
    id: string;
    resourceId: string;
    revisionId: string;
    submissionId: string;
    releaseNumber: number;
    publisher: RegistryActor;
    publisherMembershipId: string;
  }): Promise<void>;
  setCurrentPublication(resourceId: string, releaseId: string | null): Promise<void>;
  withdrawRelease(input: {
    releaseId: string;
    actor: RegistryActor;
    membershipId: string;
    reason: string;
  }): Promise<void>;
  appendAudit(record: AuditRecord): Promise<void>;
  enqueueOutbox(record: OutboxRecord): Promise<void>;
}

export interface RegistryStore {
  transaction<T>(work: (transaction: RegistryTransaction) => Promise<T>): Promise<T>;
  getPublicResources(
    kind: RegistryResourceKind,
    resourceId?: string,
  ): Promise<PublicResourceRecord[]>;
  dispatchOutbox(limit?: number): Promise<number>;
}
