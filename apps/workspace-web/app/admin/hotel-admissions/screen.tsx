'use client';

import { decideHotelAdmission, getHotelAdmissionQueue } from '@ethio-tour/api-client';
import React, { useCallback, useEffect, useState } from 'react';
import { HotelLocationDetails } from '../../components/hotel-location';
import { HotelPilotFrame, LoadingState, SessionUnavailable } from '../../components/hotel-pilot-ui';
import { useHotelPilotSession } from '../../lib/hotel-pilot-session';
import {
  canDecideHotelAdmission,
  describeApiFailure,
  type HotelAdmissionDecision,
  type HotelApplicationResponse,
} from '../../lib/hotel-pilot-ui-state';

export function AdminHotelAdmissionsScreen() {
  const { accessToken, signIn } = useHotelPilotSession();
  const [applications, setApplications] = useState<HotelApplicationResponse[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!accessToken) return;
    setLoading(true);
    setError(null);
    try {
      const response = await getHotelAdmissionQueue({ accessToken });
      setApplications(response.items);
    } catch (requestError) {
      setError(describeApiFailure(requestError, 'loading the admission queue'));
    } finally {
      setLoading(false);
    }
  }, [accessToken]);

  useEffect(() => {
    void reload();
  }, [reload]);

  async function decide(
    applicationId: string,
    request: { expectedVersion: number; decision: HotelAdmissionDecision; reason: string },
  ) {
    if (!accessToken) return;
    const updated = await decideHotelAdmission(applicationId, request, { accessToken });
    setApplications((current) =>
      current.map((application) => (application.id === updated.id ? updated : application)),
    );
    setNotice('The API accepted the admission decision. The queue is refreshing.');
    await reload();
  }

  return (
    <HotelPilotFrame
      title="Hotel platform admission"
      description="Decide private EthioTour workspace access only, after a current Bureau approval."
    >
      {!accessToken ? (
        <SessionUnavailable onSignIn={signIn} />
      ) : (
        <section aria-labelledby="admission-queue-title">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Private Administrator queue</p>
              <h2 id="admission-queue-title">Applications eligible for admission</h2>
            </div>
            <button type="button" onClick={() => void reload()} disabled={loading}>
              Refresh queue
            </button>
          </div>
          <p className="notice">
            Admission here does not activate a paid subscription, payment, public listing, or
            booking.
          </p>
          {loading && <LoadingState label="Loading eligible applications…" />}
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
          {!loading && applications.length === 0 && !error && (
            <p className="empty-state">No eligible applications were returned by the API.</p>
          )}
          <div className="card-stack">
            {applications.map((application) => (
              <AdmissionApplicationCard
                key={application.id}
                application={application}
                onDecide={decide}
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
  onDecide,
}: Readonly<{
  application: HotelApplicationResponse;
  onDecide: (
    applicationId: string,
    request: { expectedVersion: number; decision: HotelAdmissionDecision; reason: string },
  ) => Promise<void>;
}>) {
  const [decision, setDecision] = useState<HotelAdmissionDecision | ''>('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const eligible = canDecideHotelAdmission(application);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!decision || !reason.trim() || busy || !eligible) return;
    setBusy(true);
    setError(null);
    try {
      await onDecide(application.id, {
        expectedVersion: application.version,
        decision,
        reason: reason.trim(),
      });
    } catch (requestError) {
      setError(describeApiFailure(requestError, 'recording the Administrator decision'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <article className="application-card" aria-labelledby={`admission-${application.id}`}>
      <div className="card-topline">
        <div>
          <p className="eyebrow">Application version {application.currentVersion}</p>
          <h3 id={`admission-${application.id}`}>{application.content.claimedHotelName}</h3>
        </div>
        <span className="status status-neutral">
          {application.admissionStatus.replaceAll('_', ' ')}
        </span>
      </div>
      {application.content.applicantNotes && <p>{application.content.applicantNotes}</p>}
      <HotelLocationDetails
        location={application.location}
        submitted={application.status !== 'draft' && application.currentVersionId != null}
      />
      {application.bureauDecision && (
        <div className="decision-details">
          <strong>
            Synthetic Bureau outcome: {application.bureauDecision.decision.replaceAll('_', ' ')}
          </strong>
          <p>{application.bureauDecision.reason}</p>
          <p className="muted">
            Applies to version {application.bureauDecision.applicationVersion}; current version is{' '}
            {application.currentVersion}.
          </p>
        </div>
      )}
      {!eligible ? (
        <p className="notice">
          A current-version Bureau approval is required before this decision can be submitted.
        </p>
      ) : (
        <form className="form-stack decision-details" onSubmit={submit}>
          <div className="form-field">
            <label htmlFor={`admin-decision-${application.id}`}>
              Private platform admission decision
            </label>
            <select
              id={`admin-decision-${application.id}`}
              value={decision}
              onChange={(event) => setDecision(event.target.value as HotelAdmissionDecision | '')}
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
            {busy ? 'Recording decision…' : 'Record private admission decision'}
          </button>
        </form>
      )}
    </article>
  );
}
