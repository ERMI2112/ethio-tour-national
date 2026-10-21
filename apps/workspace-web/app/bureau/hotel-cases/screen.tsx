'use client';

import { decideHotelApplication, getBureauHotelCases } from '@ethio-tour/api-client';
import React, { useCallback, useEffect, useState } from 'react';
import { HotelLocationDetails } from '../../components/hotel-location';
import { HotelPilotFrame, LoadingState, SessionUnavailable } from '../../components/hotel-pilot-ui';
import { useHotelPilotSession } from '../../lib/hotel-pilot-session';
import {
  canDecideBureauCase,
  describeApiFailure,
  type HotelApplicationDecision,
  type HotelBureauCaseResponse,
} from '../../lib/hotel-pilot-ui-state';

export function BureauHotelCasesScreen() {
  const { accessToken, signIn } = useHotelPilotSession();
  const [cases, setCases] = useState<HotelBureauCaseResponse[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!accessToken) return;
    setLoading(true);
    setError(null);
    try {
      const response = await getBureauHotelCases({ accessToken });
      setCases(response.items);
    } catch (requestError) {
      setError(describeApiFailure(requestError, 'loading the assigned Bureau queue'));
    } finally {
      setLoading(false);
    }
  }, [accessToken]);

  useEffect(() => {
    void reload();
  }, [reload]);

  async function decide(
    caseId: string,
    request: { expectedVersion: number; decision: HotelApplicationDecision; reason: string },
  ) {
    if (!accessToken) return;
    await decideHotelApplication(caseId, request, { accessToken });
    setCases((current) => current.filter((caseItem) => caseItem.caseId !== caseId));
    setNotice('The API accepted the decision. The assigned queue is refreshing.');
    await reload();
  }

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
            <button type="button" onClick={() => void reload()} disabled={loading}>
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
              <BureauCaseCard key={caseItem.caseId} caseItem={caseItem} onDecide={decide} />
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
}: Readonly<{
  caseItem: HotelBureauCaseResponse;
  onDecide: (
    caseId: string,
    request: { expectedVersion: number; decision: HotelApplicationDecision; reason: string },
  ) => Promise<void>;
}>) {
  const [decision, setDecision] = useState<HotelApplicationDecision | ''>('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!decision || !reason.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      await onDecide(caseItem.caseId, {
        expectedVersion: caseItem.version,
        decision,
        reason: reason.trim(),
      });
    } catch (requestError) {
      setError(describeApiFailure(requestError, 'recording the Bureau decision'));
    } finally {
      setBusy(false);
    }
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
        <form className="form-stack decision-details" onSubmit={submit}>
          <div className="form-field">
            <label htmlFor={`decision-${caseItem.caseId}`}>
              Decision for this submitted version
            </label>
            <select
              id={`decision-${caseItem.caseId}`}
              value={decision}
              onChange={(event) => setDecision(event.target.value as HotelApplicationDecision | '')}
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
              onChange={(event) => setReason(event.target.value)}
              required
            />
          </div>
          {error && (
            <p className="error-message" role="alert">
              {error}
            </p>
          )}
          <button type="submit" disabled={busy || !decision || !reason.trim()}>
            {busy ? 'Recording decision…' : 'Record Bureau decision'}
          </button>
        </form>
      ) : (
        <p className="notice">This case is read-only in its current state.</p>
      )}
    </article>
  );
}
