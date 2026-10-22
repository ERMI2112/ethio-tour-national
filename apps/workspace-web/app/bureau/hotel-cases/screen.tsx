'use client';

import {
  API_UNAUTHORIZED_EVENT,
  ApiClientError,
  decideHotelApplication,
  getBureauHotelCases,
} from '@ethio-tour/api-client';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { HotelBureauCaseStatus } from '@ethio-tour/contracts';
import styles from './bureau-queue.module.css';
import { HotelLocationDetails } from '../../components/hotel-location';
import { HotelPilotFrame, LoadingState, SessionUnavailable } from '../../components/hotel-pilot-ui';
import { useHotelPilotSession } from '../../lib/hotel-pilot-session';
import {
  canDecideBureauCase,
  describeApiFailure,
  formatLocationHierarchy,
  isDecisionReasonValid,
  MAX_DECISION_REASON_LENGTH,
  type HotelApplicationDecision,
  type HotelBureauCaseResponse,
} from '../../lib/hotel-pilot-ui-state';

const reviewStates: ReadonlyArray<{ value: HotelBureauCaseStatus; label: string }> = [
  { value: 'submitted', label: 'Submitted' },
  { value: 'in_review', label: 'In review' },
  { value: 'changes_requested', label: 'Changes requested' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Rejected' },
];

export function BureauHotelCasesScreen() {
  const { accessToken, signIn } = useHotelPilotSession();
  const [cases, setCases] = useState<HotelBureauCaseResponse[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [noticeToken, setNoticeToken] = useState<string | null>(null);
  const [submittingCaseId, setSubmittingCaseId] = useState<string | null>(null);
  const [casesToken, setCasesToken] = useState<string | null>(null);
  const [loadingToken, setLoadingToken] = useState<string | null>(null);
  const [errorToken, setErrorToken] = useState<string | null>(null);
  const requestSequence = useRef(0);
  const currentToken = useRef(accessToken);
  const submissionInFlight = useRef(false);
  const [filters, setFilters] = useState<{
    token: string | null;
    query: string;
    state: HotelBureauCaseStatus | 'all';
  }>({ token: accessToken, query: '', state: 'all' });

  const reload = useCallback(async () => {
    const requestToken = accessToken;
    if (!requestToken) return false;
    const thisSequence = ++requestSequence.current;
    setLoadingToken(requestToken);
    setLoading(true);
    setError(null);
    setErrorToken(requestToken);
    try {
      const response = await getBureauHotelCases({ accessToken: requestToken });
      if (thisSequence !== requestSequence.current || currentToken.current !== requestToken)
        return false;
      setCases(response.items);
      setCasesToken(requestToken);
      return true;
    } catch (requestError) {
      if (thisSequence !== requestSequence.current || currentToken.current !== requestToken)
        return false;
      if (
        requestError instanceof ApiClientError &&
        (requestError.status === 401 || requestError.status === 403)
      ) {
        setCases([]);
        setCasesToken(requestToken);
      }
      setError(describeApiFailure(requestError, 'loading the assigned Bureau queue'));
      return false;
    } finally {
      if (thisSequence === requestSequence.current && currentToken.current === requestToken) {
        setLoading(false);
      }
    }
  }, [accessToken]);

  // Session handling: clear private cases when session ends
  useEffect(() => {
    currentToken.current = accessToken;
    requestSequence.current++;
    setCases([]);
    setCasesToken(null);
    setError(null);
    setErrorToken(null);
    setNotice(null);
    setNoticeToken(null);
    setFilters({ token: accessToken, query: '', state: 'all' });
    if (!accessToken) {
      return;
    }
    void reload();
  }, [accessToken, reload]);

  // Session handling: clear private cases when unauthorized event is received
  useEffect(() => {
    const handleUnauthorized = () => {
      requestSequence.current++;
      setCases([]);
      setCasesToken(null);
      setFilters({ token: currentToken.current, query: '', state: 'all' });
      setError('Your authenticated session is missing or has expired.');
      setErrorToken(currentToken.current);
    };
    if (typeof window !== 'undefined') {
      window.addEventListener(API_UNAUTHORIZED_EVENT, handleUnauthorized);
      return () => window.removeEventListener(API_UNAUTHORIZED_EVENT, handleUnauthorized);
    }
  }, []);

  async function decide(
    caseId: string,
    request: { expectedVersion: number; decision: HotelApplicationDecision; reason: string },
  ) {
    const requestToken = accessToken;
    if (!requestToken || submissionInFlight.current) return;
    submissionInFlight.current = true;
    setSubmittingCaseId(caseId);
    try {
      await decideHotelApplication(caseId, request, { accessToken: requestToken });
      if (currentToken.current !== requestToken) return;
      setCases((current) => current.filter((caseItem) => caseItem.caseId !== caseId));
      setNotice('The API accepted the decision. The assigned queue is refreshing.');
      setNoticeToken(requestToken);
      await reload();
    } catch (err) {
      if (currentToken.current === requestToken) {
        if (err instanceof ApiClientError && (err.status === 401 || err.status === 403)) {
          setCases([]);
          setCasesToken(requestToken);
        }
        throw err;
      }
    } finally {
      submissionInFlight.current = false;
      setSubmittingCaseId(null);
    }
  }

  const isQueueLoading = Boolean(accessToken) && (loadingToken !== accessToken || loading);
  const visibleCases = casesToken === accessToken ? cases : [];
  const visibleError = errorToken === accessToken ? error : null;
  const visibleNotice = noticeToken === accessToken ? notice : null;
  const isQueueBusy = isQueueLoading || submittingCaseId !== null;
  const query = filters.token === accessToken ? filters.query : '';
  const reviewState = filters.token === accessToken ? filters.state : 'all';
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const matches = (caseItem: HotelBureauCaseResponse) =>
    (reviewState === 'all' || caseItem.caseStatus === reviewState) &&
    (!normalizedQuery ||
      `${caseItem.content.claimedHotelName} ${caseItem.submittedLocation ? formatLocationHierarchy(caseItem.submittedLocation) : ''}`
        .toLocaleLowerCase()
        .includes(normalizedQuery));
  const matchCount = visibleCases.filter(matches).length;

  return (
    <HotelPilotFrame
      title="Bureau hotel cases"
      description="Review only the private cases returned for your server-assigned scope."
    >
      {!accessToken ? (
        <SessionUnavailable onSignIn={signIn} />
      ) : (
        <section className={styles.queue} aria-labelledby="bureau-queue-title">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Assigned private queue</p>
              <h2 id="bureau-queue-title">Cases available for review</h2>
            </div>
            <button
              type="button"
              onClick={() => void reload()}
              disabled={isQueueBusy}
              aria-busy={isQueueLoading ? 'true' : undefined}
            >
              Refresh queue
            </button>
          </div>
          <div className={styles.filters}>
            <div className="form-field">
              <label htmlFor="bureau-case-search">Search loaded cases</label>
              <input
                id="bureau-case-search"
                type="search"
                value={query}
                onChange={(event) =>
                  setFilters({ token: accessToken, query: event.target.value, state: reviewState })
                }
                aria-describedby="bureau-search-hint"
              />
              <p id="bureau-search-hint" className="field-hint">
                Hotel name or submitted location
              </p>
            </div>
            <div className="form-field">
              <label htmlFor="bureau-case-state">Review state</label>
              <select
                id="bureau-case-state"
                value={reviewState}
                onChange={(event) =>
                  setFilters({
                    token: accessToken,
                    query,
                    state: event.target.value as HotelBureauCaseStatus | 'all',
                  })
                }
              >
                <option value="all">All review states</option>
                {reviewStates.map((state) => (
                  <option key={state.value} value={state.value}>
                    {state.label}
                  </option>
                ))}
              </select>
            </div>
            <button
              type="button"
              className="secondary-button"
              disabled={!query && reviewState === 'all'}
              onClick={() => setFilters({ token: accessToken, query: '', state: 'all' })}
            >
              Reset filters
            </button>
          </div>
          {casesToken === accessToken && (
            <p className={styles.count} role="status" aria-live="polite" aria-atomic="true">
              Showing {matchCount} of {visibleCases.length} loaded cases
            </p>
          )}
          {isQueueLoading && <LoadingState label="Loading assigned cases…" />}
          {visibleError && (
            <p className="error-message" role="alert">
              {visibleError}
            </p>
          )}
          {visibleNotice && (
            <p className="success-message" role="status">
              {visibleNotice}
            </p>
          )}
          {!isQueueLoading && visibleCases.length === 0 && !visibleError && (
            <p className="empty-state">No cases were returned for this account and scope.</p>
          )}
          {!isQueueLoading && visibleCases.length > 0 && matchCount === 0 && (
            <p className="empty-state">No loaded cases match these filters.</p>
          )}
          {visibleError && visibleCases.length > 0 && (
            <p className="muted">Previously loaded cases are shown until a refresh succeeds.</p>
          )}
          <div className="card-stack">
            {visibleCases.map((caseItem) => (
              // Keep filtered forms mounted; only a session change or removed case clears them.
              <div key={`${accessToken}:${caseItem.caseId}`} hidden={!matches(caseItem)}>
                <BureauCaseCard
                  caseItem={caseItem}
                  onDecide={decide}
                  onRefresh={reload}
                  isQueueBusy={isQueueBusy}
                />
              </div>
            ))}
          </div>
        </section>
      )}
    </HotelPilotFrame>
  );
}

function BureauCaseCard({
  caseItem,
  onDecide,
  onRefresh,
  isQueueBusy,
}: Readonly<{
  caseItem: HotelBureauCaseResponse;
  onDecide: (
    caseId: string,
    request: { expectedVersion: number; decision: HotelApplicationDecision; reason: string },
  ) => Promise<void>;
  onRefresh: () => Promise<boolean>;
  isQueueBusy: boolean;
}>) {
  const [decision, setDecision] = useState<HotelApplicationDecision | ''>('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isConflict, setIsConflict] = useState(false);
  const [requiresRenewedReview, setRequiresRenewedReview] = useState(false);
  const [confirmedReasonVersion, setConfirmedReasonVersion] = useState<number | null>(null);
  const submissionInFlight = useRef(false);

  const trimmedReason = reason.trim();
  const reasonLength = trimmedReason.length;
  const isReasonValid = isDecisionReasonValid(reason);
  const isReasonTooLong = reason.length > MAX_DECISION_REASON_LENGTH;
  const canSubmit =
    Boolean(decision) &&
    isReasonValid &&
    !busy &&
    !isQueueBusy &&
    !isConflict &&
    (!requiresRenewedReview || confirmedReasonVersion === caseItem.currentVersion);
  const locationSummary = formatLocationHierarchy(caseItem.submittedLocation);

  async function submit(event?: React.FormEvent<HTMLFormElement>) {
    if (event) event.preventDefault();
    if (submissionInFlight.current || !decision || !canSubmit) return;
    submissionInFlight.current = true;
    setBusy(true);
    setError(null);
    setIsConflict(false);
    try {
      await onDecide(caseItem.caseId, {
        expectedVersion: caseItem.version,
        decision,
        reason: trimmedReason,
      });
    } catch (requestError) {
      if (requestError instanceof ApiClientError && requestError.status === 409) {
        setIsConflict(true);
        setRequiresRenewedReview(true);
        setConfirmedReasonVersion(null);
        setDecision('');
        setError(
          'Application version conflict: The application record changed or a newer version was submitted. Your entered reason has been preserved. Refresh the list to review the current version before trying again.',
        );
      } else {
        setError(describeApiFailure(requestError, 'recording the Bureau decision'));
      }
    } finally {
      submissionInFlight.current = false;
      setBusy(false);
    }
  }

  async function handleRefresh() {
    const refreshed = await onRefresh();
    if (!refreshed) return;
    setError(null);
    setIsConflict(false);
    setDecision('');
    setConfirmedReasonVersion(null);
  }

  return (
    <article
      className={`application-card ${styles.caseCard}`}
      aria-labelledby={`bureau-case-${caseItem.caseId}`}
    >
      <div className="card-topline">
        <div>
          <p className="eyebrow">Case · application version {caseItem.currentVersion}</p>
          <h3 id={`bureau-case-${caseItem.caseId}`}>{caseItem.content.claimedHotelName}</h3>
        </div>
        <span className="status status-neutral">{caseItem.caseStatus.replaceAll('_', ' ')}</span>
      </div>
      <section
        className={`decision-details ${styles.notes}`}
        aria-labelledby={`applicant-notes-${caseItem.caseId}`}
      >
        <h4 id={`applicant-notes-${caseItem.caseId}`}>Applicant notes</h4>
        <p>{caseItem.content.applicantNotes || 'No applicant notes supplied.'}</p>
      </section>
      <HotelLocationDetails
        location={caseItem.submittedLocation}
        selection={caseItem.content.locationSelection}
        locationState={caseItem.locationState}
        submitted
        applicationVersion={caseItem.currentVersion}
      />
      <p className="muted">{caseItem.notice}</p>
      {caseItem.bureauDecision && (
        <p className="muted">
          Current recorded outcome for submitted version{' '}
          {caseItem.bureauDecision.applicationVersion}:{' '}
          {caseItem.bureauDecision.decision.replaceAll('_', ' ')}
        </p>
      )}
      {canDecideBureauCase(caseItem) ? (
        <form className="form-stack decision-details" onSubmit={submit} noValidate>
          <div className="decision-coverage-notice" role="note">
            <p className="decision-coverage-text">
              <strong>Decision target:</strong> Application version{' '}
              <span className="coverage-version">{caseItem.currentVersion}</span>
              {locationSummary ? (
                <>
                  {' '}
                  · Submitted location: <span className="coverage-location">{locationSummary}</span>
                </>
              ) : null}
            </p>
          </div>
          <div className="form-field">
            <label htmlFor={`decision-${caseItem.caseId}`}>
              Decision for this submitted version
            </label>
            <p id={`decision-hint-${caseItem.caseId}`} className="field-hint">
              Target: version {caseItem.currentVersion} · {locationSummary}
            </p>
            <select
              id={`decision-${caseItem.caseId}`}
              value={decision}
              onChange={(event) => {
                setDecision(event.target.value as HotelApplicationDecision | '');
                if (error && !isConflict) setError(null);
              }}
              disabled={busy || isQueueBusy}
              aria-describedby={`decision-hint-${caseItem.caseId}`}
              required
            >
              <option value="">Choose an outcome</option>
              <option value="approve">Approve this synthetic-pilot application version</option>
              <option value="request_changes">Request changes</option>
              <option value="reject">Reject this application</option>
            </select>
          </div>
          <div className="form-field">
            <label htmlFor={`reason-${caseItem.caseId}`}>Reason</label>
            <textarea
              id={`reason-${caseItem.caseId}`}
              value={reason}
              onChange={(event) => {
                setReason(event.target.value);
                if (requiresRenewedReview) setConfirmedReasonVersion(null);
                if (error && !isConflict) setError(null);
              }}
              onKeyDown={(event) => {
                if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
                  event.preventDefault();
                  void submit();
                }
              }}
              maxLength={MAX_DECISION_REASON_LENGTH}
              disabled={busy || isQueueBusy}
              aria-describedby={`reason-hint-${caseItem.caseId}${error ? ` reason-error-${caseItem.caseId}` : ''}`}
              aria-invalid={isReasonTooLong ? 'true' : undefined}
              placeholder="Enter justification for this decision (required, up to 1000 characters)"
              required
            />
            <div className="field-hint-row">
              <span id={`reason-hint-${caseItem.caseId}`} className="field-hint">
                {reasonLength} / {MAX_DECISION_REASON_LENGTH} characters (required)
              </span>
            </div>
          </div>
          {requiresRenewedReview && !isConflict && (
            <label className="decision-review-confirmation">
              <input
                type="checkbox"
                checked={confirmedReasonVersion === caseItem.currentVersion}
                onChange={(event) =>
                  setConfirmedReasonVersion(event.target.checked ? caseItem.currentVersion : null)
                }
              />
              I reviewed version {caseItem.currentVersion} and confirm the preserved reason applies.
            </label>
          )}
          {error && (
            <div className="error-container">
              <p id={`reason-error-${caseItem.caseId}`} className="error-message" role="alert">
                {error}
              </p>
              {isConflict && (
                <div className="conflict-actions">
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() => void handleRefresh()}
                    disabled={busy || isQueueBusy}
                  >
                    Refresh case
                  </button>
                </div>
              )}
            </div>
          )}
          <button type="submit" disabled={!canSubmit} aria-busy={busy ? 'true' : undefined}>
            {busy ? 'Recording decision…' : 'Record Bureau decision'}
          </button>
        </form>
      ) : (
        <p className="notice">This case is read-only in its current state.</p>
      )}
    </article>
  );
}
