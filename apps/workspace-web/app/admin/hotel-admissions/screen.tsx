'use client';

import {
  API_UNAUTHORIZED_EVENT,
  ApiClientError,
  decideHotelAdmission,
  getHotelAdmissionQueue,
} from '@ethio-tour/api-client';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { HotelLocationDetails } from '../../components/hotel-location';
import { HotelPilotFrame, LoadingState, SessionUnavailable } from '../../components/hotel-pilot-ui';
import { useHotelPilotSession } from '../../lib/hotel-pilot-session';
import {
  canDecideHotelAdmission,
  describeApiFailure,
  formatLocationHierarchy,
  isDecisionReasonValid,
  MAX_DECISION_REASON_LENGTH,
  type HotelAdmissionDecision,
  type HotelApplicationResponse,
} from '../../lib/hotel-pilot-ui-state';
import styles from './admin-admissions.module.css';

type QueueErrorKind = 'denied' | 'failure';

export function AdminHotelAdmissionsScreen() {
  const { accessToken, signIn } = useHotelPilotSession();
  const [applications, setApplications] = useState<HotelApplicationResponse[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [noticeToken, setNoticeToken] = useState<string | null>(null);
  const [submittingId, setSubmittingId] = useState<string | null>(null);
  const [applicationsToken, setApplicationsToken] = useState<string | null>(null);
  const [loadingToken, setLoadingToken] = useState<string | null>(null);
  const [errorToken, setErrorToken] = useState<string | null>(null);
  const [errorKind, setErrorKind] = useState<QueueErrorKind | null>(null);
  const [filters, setFilters] = useState<{ token: string | null; query: string }>({
    token: accessToken,
    query: '',
  });
  const requestSequence = useRef(0);
  const currentToken = useRef(accessToken);
  const submissionInFlight = useRef(false);

  const reload = useCallback(async () => {
    const requestToken = accessToken;
    if (!requestToken) return false;
    const thisSequence = ++requestSequence.current;
    setLoadingToken(requestToken);
    setLoading(true);
    setError(null);
    setErrorKind(null);
    setErrorToken(requestToken);
    try {
      const response = await getHotelAdmissionQueue({ accessToken: requestToken });
      if (thisSequence !== requestSequence.current || currentToken.current !== requestToken)
        return false;
      setApplications(response.items);
      setApplicationsToken(requestToken);
      return true;
    } catch (requestError) {
      if (thisSequence !== requestSequence.current || currentToken.current !== requestToken)
        return false;
      if (
        requestError instanceof ApiClientError &&
        (requestError.status === 401 || requestError.status === 403)
      ) {
        setApplications([]);
        setApplicationsToken(requestToken);
        setFilters({ token: requestToken, query: '' });
      }
      setErrorKind(
        requestError instanceof ApiClientError && requestError.status === 403
          ? 'denied'
          : 'failure',
      );
      setError(describeApiFailure(requestError, 'loading the admission queue'));
      return false;
    } finally {
      if (thisSequence === requestSequence.current && currentToken.current === requestToken) {
        setLoading(false);
      }
    }
  }, [accessToken]);

  // Session handling: clear private applications when session ends
  useEffect(() => {
    currentToken.current = accessToken;
    requestSequence.current++;
    setApplications([]);
    setApplicationsToken(null);
    setError(null);
    setErrorToken(null);
    setErrorKind(null);
    setNotice(null);
    setNoticeToken(null);
    setFilters({ token: accessToken, query: '' });
    if (!accessToken) {
      return;
    }
    void reload();
  }, [accessToken, reload]);

  // Session handling: clear private applications when unauthorized event is received
  useEffect(() => {
    const handleUnauthorized = () => {
      requestSequence.current++;
      setApplications([]);
      setApplicationsToken(null);
      setFilters({ token: currentToken.current, query: '' });
      setError('Your authenticated session is missing or has expired.');
      setErrorToken(currentToken.current);
      setErrorKind('failure');
    };
    if (typeof window !== 'undefined') {
      window.addEventListener(API_UNAUTHORIZED_EVENT, handleUnauthorized);
      return () => window.removeEventListener(API_UNAUTHORIZED_EVENT, handleUnauthorized);
    }
  }, []);

  async function decide(
    applicationId: string,
    request: { expectedVersion: number; decision: HotelAdmissionDecision; reason: string },
  ) {
    const requestToken = accessToken;
    if (!requestToken || submissionInFlight.current) return;
    submissionInFlight.current = true;
    setSubmittingId(applicationId);
    try {
      const updated = await decideHotelAdmission(applicationId, request, {
        accessToken: requestToken,
      });
      if (currentToken.current !== requestToken) return;
      setApplications((current) =>
        current.map((application) => (application.id === updated.id ? updated : application)),
      );
      setNotice('The API accepted the admission decision. The queue is refreshing.');
      setNoticeToken(requestToken);
      await reload();
    } catch (err) {
      if (currentToken.current === requestToken) {
        if (err instanceof ApiClientError && (err.status === 401 || err.status === 403)) {
          setApplications([]);
          setApplicationsToken(requestToken);
          setFilters({ token: requestToken, query: '' });
          setError(describeApiFailure(err, 'recording the Administrator decision'));
          setErrorKind(err.status === 403 ? 'denied' : 'failure');
          setErrorToken(requestToken);
        }
        throw err;
      }
    } finally {
      submissionInFlight.current = false;
      setSubmittingId(null);
    }
  }

  const isQueueLoading = Boolean(accessToken) && (loadingToken !== accessToken || loading);
  const visibleApplications = applicationsToken === accessToken ? applications : [];
  const visibleError = errorToken === accessToken ? error : null;
  const visibleErrorKind = errorToken === accessToken ? errorKind : null;
  const visibleNotice = noticeToken === accessToken ? notice : null;
  const isQueueBusy = isQueueLoading || submittingId !== null;
  const query = filters.token === accessToken ? filters.query : '';
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const matchesApplication = (application: HotelApplicationResponse) =>
    !normalizedQuery ||
    `${application.content.claimedHotelName} ${formatLocationHierarchy(application.location)} ${application.content.applicantNotes}`
      .toLocaleLowerCase()
      .includes(normalizedQuery);
  const matchingCount = visibleApplications.filter(matchesApplication).length;

  return (
    <HotelPilotFrame
      title="Hotel platform admission"
      description="Decide private EthioTour workspace access only, after a current Bureau approval."
    >
      {!accessToken ? (
        <SessionUnavailable onSignIn={signIn} />
      ) : (
        <section className={styles.queue} aria-labelledby="admission-queue-title">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Private Administrator queue</p>
              <h2 id="admission-queue-title">Applications eligible for admission</h2>
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
          <p className="notice">
            Admission here does not activate a paid subscription, payment, public listing, or
            booking.
          </p>
          <div className={styles.filters}>
            <div className="form-field">
              <label htmlFor="admin-admission-search">Search loaded applications</label>
              <input
                id="admin-admission-search"
                type="search"
                value={query}
                onChange={(event) => setFilters({ token: accessToken, query: event.target.value })}
                aria-describedby="admin-admission-search-hint"
              />
              <p id="admin-admission-search-hint" className="field-hint">
                Hotel name, submitted location, or applicant notes. Searches only the records
                already returned by the API.
              </p>
            </div>
            <button
              type="button"
              className="secondary-button"
              disabled={!query}
              onClick={() => setFilters({ token: accessToken, query: '' })}
            >
              Clear search
            </button>
          </div>
          {applicationsToken === accessToken && (
            <p className={styles.count} role="status" aria-live="polite" aria-atomic="true">
              Showing {matchingCount} of {visibleApplications.length} loaded eligible applications
            </p>
          )}
          {isQueueLoading && <LoadingState label="Loading eligible applications…" />}
          {visibleError && (
            <div className={styles.queueError} role="alert">
              <strong>
                {visibleErrorKind === 'denied' ? 'Access denied' : 'Queue unavailable'}
              </strong>
              <p>{visibleError}</p>
            </div>
          )}
          {visibleNotice && (
            <p className="success-message" role="status">
              {visibleNotice}
            </p>
          )}
          {!isQueueLoading && visibleApplications.length === 0 && !visibleError && (
            <p className="empty-state">No eligible applications were returned by the API.</p>
          )}
          {!isQueueLoading &&
            visibleApplications.length > 0 &&
            matchingCount === 0 &&
            !visibleError && (
              <p className="empty-state">
                No loaded applications match this search. Clear the search to see the full loaded
                queue.
              </p>
            )}
          <div className="card-stack">
            {visibleApplications.map((application) => (
              <AdmissionApplicationCard
                key={`${accessToken}:${application.id}`}
                application={application}
                hidden={!matchesApplication(application)}
                onDecide={decide}
                onRefresh={reload}
                isQueueBusy={isQueueBusy}
              />
            ))}
          </div>
        </section>
      )}
    </HotelPilotFrame>
  );
}

function AdmissionApplicationCard({
  application,
  hidden,
  onDecide,
  onRefresh,
  isQueueBusy,
}: Readonly<{
  application: HotelApplicationResponse;
  hidden: boolean;
  onDecide: (
    applicationId: string,
    request: { expectedVersion: number; decision: HotelAdmissionDecision; reason: string },
  ) => Promise<void>;
  onRefresh: () => Promise<boolean>;
  isQueueBusy: boolean;
}>) {
  const [decision, setDecision] = useState<HotelAdmissionDecision | ''>('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isConflict, setIsConflict] = useState(false);
  const [requiresRenewedReview, setRequiresRenewedReview] = useState(false);
  const [confirmedReasonVersion, setConfirmedReasonVersion] = useState<number | null>(null);
  const submissionInFlight = useRef(false);
  const eligible = canDecideHotelAdmission(application);

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
    (!requiresRenewedReview || confirmedReasonVersion === application.currentVersion) &&
    eligible;
  const locationSummary = formatLocationHierarchy(application.location);

  async function submit(event?: React.FormEvent<HTMLFormElement>) {
    if (event) event.preventDefault();
    if (submissionInFlight.current || !decision || !canSubmit) return;
    submissionInFlight.current = true;
    setBusy(true);
    setError(null);
    setIsConflict(false);
    try {
      await onDecide(application.id, {
        expectedVersion: application.version,
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
        setError(describeApiFailure(requestError, 'recording the Administrator decision'));
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
      className={`application-card ${styles.applicationCard}`}
      aria-labelledby={`admission-${application.id}`}
      hidden={hidden}
    >
      <div className={styles.cardTopline}>
        <div>
          <p className="eyebrow">Submitted application version {application.currentVersion}</p>
          <h3 id={`admission-${application.id}`}>{application.content.claimedHotelName}</h3>
        </div>
        <span className="status status-neutral">
          {application.admissionStatus.replaceAll('_', ' ')}
        </span>
      </div>
      {application.content.applicantNotes && (
        <div className={styles.applicantNotes}>
          <strong>Applicant notes</strong>
          <p>{application.content.applicantNotes}</p>
        </div>
      )}
      <HotelLocationDetails
        location={application.location}
        selection={application.content.locationSelection}
        locationState={application.locationState}
        submitted={application.status !== 'draft' && application.currentVersionId != null}
        applicationVersion={
          application.status !== 'draft' && application.currentVersionId !== null
            ? application.currentVersion
            : undefined
        }
      />
      {application.bureauDecision && (
        <section
          className={styles.bureauContext}
          aria-labelledby={`bureau-context-${application.id}`}
        >
          <h4 id={`bureau-context-${application.id}`}>Bureau decision context</h4>
          <p>
            <strong>
              Synthetic Bureau outcome: {application.bureauDecision.decision.replaceAll('_', ' ')}
            </strong>
          </p>
          <p>{application.bureauDecision.reason}</p>
          <p className="muted">
            Covers application version {application.bureauDecision.applicationVersion}. Current
            submitted version: {application.currentVersion}.
          </p>
        </section>
      )}
      {!eligible ? (
        <p className="notice">
          A current-version Bureau approval is required before this decision can be submitted.
        </p>
      ) : (
        <form className="form-stack decision-details" onSubmit={submit} noValidate>
          <div className="decision-coverage-notice" role="note">
            <p className="decision-coverage-text">
              <strong>Decision target:</strong> Application version{' '}
              <span className="coverage-version">{application.currentVersion}</span>
              {locationSummary ? (
                <>
                  {' '}
                  · Submitted location: <span className="coverage-location">{locationSummary}</span>
                </>
              ) : null}
            </p>
          </div>
          <div className="form-field">
            <label htmlFor={`admin-decision-${application.id}`}>
              Private platform admission decision
            </label>
            <p id={`admin-decision-hint-${application.id}`} className="field-hint">
              Target: version {application.currentVersion} · {locationSummary}
            </p>
            <select
              id={`admin-decision-${application.id}`}
              value={decision}
              onChange={(event) => {
                setDecision(event.target.value as HotelAdmissionDecision | '');
                if (error && !isConflict) setError(null);
              }}
              disabled={busy || isQueueBusy}
              aria-describedby={`admin-decision-hint-${application.id}`}
              required
            >
              <option value="">Choose an outcome</option>
              <option value="admit">Admit to private EthioTour workspace</option>
              <option value="decline">Decline private workspace admission</option>
            </select>
          </div>
          <div className="form-field">
            <label htmlFor={`admin-reason-${application.id}`}>Reason</label>
            <textarea
              id={`admin-reason-${application.id}`}
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
              aria-describedby={`admin-reason-hint-${application.id}${error ? ` admin-reason-error-${application.id}` : ''}`}
              aria-invalid={isReasonTooLong ? 'true' : undefined}
              placeholder="Enter justification for this admission decision (required, up to 1000 characters)"
              required
            />
            <div className="field-hint-row">
              <span id={`admin-reason-hint-${application.id}`} className="field-hint">
                {reasonLength} / {MAX_DECISION_REASON_LENGTH} characters (required)
              </span>
            </div>
          </div>
          {requiresRenewedReview && !isConflict && (
            <label className="decision-review-confirmation">
              <input
                type="checkbox"
                checked={confirmedReasonVersion === application.currentVersion}
                onChange={(event) =>
                  setConfirmedReasonVersion(
                    event.target.checked ? application.currentVersion : null,
                  )
                }
              />
              I reviewed version {application.currentVersion} and confirm the preserved reason
              applies.
            </label>
          )}
          {error && (
            <div className="error-container">
              <p id={`admin-reason-error-${application.id}`} className="error-message" role="alert">
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
                    Refresh application
                  </button>
                </div>
              )}
            </div>
          )}
          <button type="submit" disabled={!canSubmit} aria-busy={busy ? 'true' : undefined}>
            {busy ? 'Recording decision…' : 'Record private admission decision'}
          </button>
        </form>
      )}
    </article>
  );
}
