'use client';

import {
  createHotelApplication,
  createHotelApplicationRevision,
  getMyHotelApplications,
  submitHotelApplication,
} from '@ethio-tour/api-client';
import React, { useCallback, useEffect, useState } from 'react';
import { HotelPilotFrame, LoadingState, SessionUnavailable } from '../components/hotel-pilot-ui';
import { useHotelPilotAccessToken } from '../lib/hotel-pilot-session';
import {
  applicationVersionLabel,
  canEditHotelApplication,
  canSubmitHotelApplication,
  describeApiFailure,
  type HotelApplicationContent,
  type HotelApplicationResponse,
} from '../lib/hotel-pilot-ui-state';

export function HotelApplicantScreen() {
  const accessToken = useHotelPilotAccessToken();
  const [applications, setApplications] = useState<HotelApplicationResponse[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const reload = useCallback(async () => {
    if (!accessToken) return;
    setLoading(true);
    setError(null);
    try {
      const response = await getMyHotelApplications({ accessToken });
      setApplications(response.items);
    } catch (requestError) {
      setError(describeApiFailure(requestError, 'loading your applications'));
    } finally {
      setLoading(false);
    }
  }, [accessToken]);

  useEffect(() => {
    void reload();
  }, [reload]);

  async function createApplication(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!accessToken || creating) return;
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const content = {
      claimedHotelName: String(form.get('claimedHotelName') ?? '').trim(),
      applicantNotes: String(form.get('applicantNotes') ?? '').trim(),
    };
    if (!content.claimedHotelName) {
      setError('Enter the hotel name you are applying about.');
      return;
    }

    setCreating(true);
    setError(null);
    setNotice(null);
    try {
      const created = await createHotelApplication({ content }, { accessToken });
      setApplications((current) => [created, ...current]);
      setNotice('The private draft was returned by the API. Review it below before submitting.');
      formElement.reset();
    } catch (requestError) {
      setError(describeApiFailure(requestError, 'creating the private application'));
    } finally {
      setCreating(false);
    }
  }

  async function submitDraft(application: HotelApplicationResponse) {
    if (!accessToken) return;
    setError(null);
    setNotice(null);
    try {
      const updated = await submitHotelApplication(
        application.id,
        { expectedVersion: application.version },
        { accessToken },
      );
      setApplications((current) => replaceApplication(current, updated));
      setNotice('The API accepted the submission. Its status below reflects the API response.');
    } catch (requestError) {
      setError(describeApiFailure(requestError, 'submitting this version'));
    }
  }

  async function createCorrection(
    application: HotelApplicationResponse,
    content: HotelApplicationContent,
  ) {
    if (!accessToken) return;
    setError(null);
    setNotice(null);
    try {
      const updated = await createHotelApplicationRevision(
        application.id,
        { expectedVersion: application.version, content },
        { accessToken },
      );
      setApplications((current) => replaceApplication(current, updated));
      setNotice('The API returned a new private version. Submit it for Bureau review when ready.');
    } catch (requestError) {
      setError(describeApiFailure(requestError, 'creating the corrected version'));
    }
  }

  return (
    <HotelPilotFrame
      title="Hotel applications"
      description="Create and track your own private application. Only the API determines ownership and access."
    >
      {!accessToken ? (
        <SessionUnavailable />
      ) : (
        <div className="card-stack">
          <section className="panel" aria-labelledby="create-hotel-application-title">
            <div className="section-heading">
              <div>
                <p className="eyebrow">Applicant</p>
                <h2 id="create-hotel-application-title">Start an application</h2>
              </div>
            </div>
            <form className="form-stack" onSubmit={createApplication}>
              <div className="form-field">
                <label htmlFor="claimed-hotel-name">Hotel name stated in this application</label>
                <input id="claimed-hotel-name" name="claimedHotelName" required />
              </div>
              <div className="form-field">
                <label htmlFor="applicant-notes">Application notes</label>
                <textarea id="applicant-notes" name="applicantNotes" />
              </div>
              <button type="submit" disabled={creating}>
                {creating ? 'Creating draft…' : 'Create private draft'}
              </button>
            </form>
          </section>

          <section aria-labelledby="your-applications-title">
            <div className="section-heading">
              <div>
                <p className="eyebrow">Private to your account</p>
                <h2 id="your-applications-title">Your applications</h2>
              </div>
              <button
                type="button"
                className="secondary-button"
                onClick={() => void reload()}
                disabled={loading}
              >
                Refresh
              </button>
            </div>
            {loading && <LoadingState label="Loading your applications…" />}
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
              <p className="empty-state">No applications were returned for this account.</p>
            )}
            <div className="card-stack">
              {applications.map((application) => (
                <ApplicantApplicationCard
                  key={`${application.id}-${application.currentVersionId}`}
                  application={application}
                  onSubmit={() => submitDraft(application)}
                  onCreateCorrection={(content) => createCorrection(application, content)}
                />
              ))}
            </div>
          </section>
        </div>
      )}
    </HotelPilotFrame>
  );
}

function ApplicantApplicationCard({
  application,
  onSubmit,
  onCreateCorrection,
}: Readonly<{
  application: HotelApplicationResponse;
  onSubmit: () => Promise<void>;
  onCreateCorrection: (content: HotelApplicationContent) => Promise<void>;
}>) {
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    try {
      const form = new FormData(event.currentTarget);
      const claimedHotelName = String(form.get('claimedHotelName') ?? '').trim();
      if (!claimedHotelName) return;
      await onCreateCorrection({
        claimedHotelName,
        applicantNotes: String(form.get('applicantNotes') ?? '').trim(),
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <article className="application-card" aria-labelledby={`application-${application.id}`}>
      <div className="card-topline">
        <div>
          <p className="eyebrow">{applicationVersionLabel(application)}</p>
          <h3 id={`application-${application.id}`}>{application.content.claimedHotelName}</h3>
        </div>
        <span className="status status-neutral">{application.status.replaceAll('_', ' ')}</span>
      </div>
      {application.content.applicantNotes && <p>{application.content.applicantNotes}</p>}
      <p className="muted">
        Administrator admission: {application.admissionStatus.replaceAll('_', ' ')}
      </p>
      {application.workspaceAccess === 'private_only' && (
        <p className="notice">
          Private workspace access only. No listing, booking, subscription, or payment is enabled.
        </p>
      )}
      {application.bureauDecision && (
        <div className="decision-details">
          <strong>
            {application.status === 'draft'
              ? 'Previous submitted version outcome'
              : 'Synthetic Bureau case outcome'}{' '}
            {application.bureauDecision.decision.replaceAll('_', ' ')}
          </strong>
          <p>{application.bureauDecision.reason}</p>
          <p className="muted">
            Applies only to submitted version {application.bureauDecision.applicationVersion}; a new
            draft has not been reviewed.
          </p>
        </div>
      )}
      {canEditHotelApplication(application) && (
        <form className="form-stack decision-details" onSubmit={handleSubmit}>
          <h4>
            {application.status === 'draft'
              ? 'Edit the private draft'
              : 'Prepare a new private version'}
          </h4>
          <div className="form-field">
            <label htmlFor={`hotel-name-${application.id}`}>
              Hotel name stated in this application
            </label>
            <input
              id={`hotel-name-${application.id}`}
              name="claimedHotelName"
              defaultValue={application.content.claimedHotelName}
              required
            />
          </div>
          <div className="form-field">
            <label htmlFor={`hotel-notes-${application.id}`}>Application notes</label>
            <textarea
              id={`hotel-notes-${application.id}`}
              name="applicantNotes"
              defaultValue={application.content.applicantNotes}
            />
          </div>
          <button type="submit" disabled={busy}>
            {busy ? 'Saving draft…' : 'Save private draft'}
          </button>
        </form>
      )}
      {canSubmitHotelApplication(application) && (
        <div className="action-row decision-details">
          <button
            type="button"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await onSubmit();
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? 'Submitting…' : 'Submit this version for review'}
          </button>
        </div>
      )}
    </article>
  );
}

function replaceApplication(
  applications: HotelApplicationResponse[],
  updated: HotelApplicationResponse,
) {
  return applications.map((application) => (application.id === updated.id ? updated : application));
}
