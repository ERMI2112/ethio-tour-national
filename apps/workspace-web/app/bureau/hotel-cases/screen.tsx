'use client';

import {
  API_UNAUTHORIZED_EVENT,
  ApiClientError,
  decideHotelApplication,
  getBureauHotelCases,
} from '@ethio-tour/api-client';
import React, { useCallback, useEffect, useRef, useState } from 'react';
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

export function BureauHotelCasesScreen() {
  const { accessToken, signIn } = useHotelPilotSession();
  const [cases, setCases] = useState<HotelBureauCaseResponse[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [submittingCaseId, setSubmittingCaseId] = useState<string | null>(null);
  const requestSequence = useRef(0);

  const reload = useCallback(async () => {
    if (!accessToken) return;
    const thisSequence = ++requestSequence.current;
    setLoading(true);
    setError(null);
    try {
      const response = await getBureauHotelCases({ accessToken });
      if (thisSequence !== requestSequence.current) return;
      setCases(response.items);
    } catch (requestError) {
      if (thisSequence !== requestSequence.current) return;
      if (
        requestError instanceof ApiClientError &&
        (requestError.status === 401 || requestError.status === 403)
      ) {
        setCases([]);
      }
      setError(describeApiFailure(requestError, 'loading the assigned Bureau queue'));
    } finally {
      if (thisSequence === requestSequence.current) {
        setLoading(false);
      }
    }
  }, [accessToken]);

  // Session handling: clear private cases when session ends
  useEffect(() => {
    if (!accessToken) {
      requestSequence.current++;
      setCases([]);
      setError(null);
      setNotice(null);
    } else {
      void reload();
    }
  }, [accessToken, reload]);

  // Session handling: clear private cases when unauthorized event is received
  useEffect(() => {
    const handleUnauthorized = () => {
      requestSequence.current++;
      setCases([]);
      setError('Your authenticated session is missing or has expired.');
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
    if (!accessToken || submittingCaseId !== null) return;
    setSubmittingCaseId(caseId);
    try {
      await decideHotelApplication(caseId, request, { accessToken });
      setCases((current) => current.filter((caseItem) => caseItem.caseId !== caseId));
      setNotice('The API accepted the decision. The assigned queue is refreshing.');
      await reload();
    } catch (err) {
      if (err instanceof ApiClientError && (err.status === 401 || err.status === 403)) {
        setCases([]);
      }
      throw err;
    } finally {
      setSubmittingCaseId(null);
    }
  }

  const isQueueBusy = loading || submittingCaseId !== null;

  return (
    <HotelPilotFrame
      title="Bureau hotel cases"
      description="Review only the private cases returned for your server-assigned scope."
    >
      {!accessToken ? (
        <SessionUnavailable onSignIn={signIn} />
      ) : (
        <section aria-labelledby="bureau-queue-title">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Assigned private queue</p>
              <h2 id="bureau-queue-title">Cases available for review</h2>
            </div>
            <button
              type="button"
              onClick={() => void reload()}
              disabled={isQueueBusy}
              aria-busy={loading ? 'true' : undefined}
            >
              Refresh queue
            </button>
          </div>
          {loading && <LoadingState label="Loading assigned cases…" />}
          {error && (
            <p className="error-message" role="alert">
              {error}
            </p>
          )}
          {notice && (
            <p className="success-message" role="status">
              {notice}
            </p>
          )}
          {!loading && cases.length === 0 && !error && (
            <p className="empty-state">No cases were returned for this account and scope.</p>
          )}
          <div className="card-stack">
            {cases.map((caseItem) => (
              <BureauCaseCard
                key={caseItem.caseId}
                caseItem={caseItem}
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
  onRefresh: () => Promise<void>;
  isQueueBusy: boolean;
}>) {
  const [decision, setDecision] = useState<HotelApplicationDecision | ''>('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isConflict, setIsConflict] = useState(false);

  const trimmedReason = reason.trim();
  const reasonLength = trimmedReason.length;
  const isReasonValid = isDecisionReasonValid(reason);
  const isReasonTooLong = reason.length > MAX_DECISION_REASON_LENGTH;
  const canSubmit = Boolean(decision) && isReasonValid && !busy && !isQueueBusy;
  const locationSummary = formatLocationHierarchy(caseItem.submittedLocation);

  async function submit(event?: React.FormEvent<HTMLFormElement>) {
    if (event) event.preventDefault();
    if (!decision || !canSubmit) return;
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
        setError(
          'Application version conflict: The application record changed or a newer version was submitted. Your entered reason has been preserved. Refresh the list to review the current version before trying again.',
        );
      } else {
        setError(describeApiFailure(requestError, 'recording the Bureau decision'));
      }
    } finally {
      setBusy(false);
    }
  }

  async function handleRefresh() {
    setError(null);
    setIsConflict(false);
    await onRefresh();
  }

  return (
    <article className="application-card" aria-labelledby={`bureau-case-${caseItem.caseId}`}>
      <div className="card-topline">
        <div>
          <p className="eyebrow">Case · application version {caseItem.currentVersion}</p>
          <h3 id={`bureau-case-${caseItem.caseId}`}>{caseItem.content.claimedHotelName}</h3>
        </div>
        <span className="status status-neutral">{caseItem.caseStatus.replaceAll('_', ' ')}</span>
      </div>
      {caseItem.content.applicantNotes && (
        <div className="decision-details">
          <strong>Applicant notes</strong>
          <p>{caseItem.content.applicantNotes}</p>
        </div>
      )}
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
