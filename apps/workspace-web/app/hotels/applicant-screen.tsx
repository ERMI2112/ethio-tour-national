'use client';

import {
  ApiClientError,
  createHotelApplication,
  createHotelApplicationRevision,
  getAdmittedHotelWorkspace,
  getMyHotelApplications,
  getHotelLocations,
  submitHotelApplication,
} from '@ethio-tour/api-client';
import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import type { HotelLocation } from '@ethio-tour/contracts';
import { HotelLocationDetails, HotelLocationSelector } from '../components/hotel-location';
import { HotelDecisionHistory } from '../components/hotel-decision-history';
import { HotelPilotFrame, LoadingState, SessionUnavailable } from '../components/hotel-pilot-ui';
import { useHotelPilotSession } from '../lib/hotel-pilot-session';
import {
  applicationVersionLabel,
  canEditHotelApplication,
  canSubmitHotelApplication,
  describeApiFailure,
  type HotelApplicationContent,
  type HotelApplicationResponse,
} from '../lib/hotel-pilot-ui-state';

export function HotelApplicantScreen() {
  const { accessToken, signIn } = useHotelPilotSession();
  const [applications, setApplications] = useState<HotelApplicationResponse[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [locations, setLocations] = useState<HotelLocation[]>([]);
  const [locationLoading, setLocationLoading] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [newLocationId, setNewLocationId] = useState('');
  const loadLocations = useCallback(async () => {
    if (!accessToken) return;
    setLocationLoading(true);
    setLocationError(null);
    try {
      setLocations((await getHotelLocations({ accessToken })).items);
    } catch (requestError) {
      setLocationError(describeApiFailure(requestError, 'loading locations'));
    } finally {
      setLocationLoading(false);
    }
  }, [accessToken]);

  useEffect(() => {
    void loadLocations();
  }, [loadLocations]);

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
      ...(newLocationId ? { administrativeUnitId: newLocationId } : {}),
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
      setNewLocationId('');
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
      setError(
        requestError instanceof ApiClientError && requestError.status === 503
          ? 'Review routing is currently unavailable. Your private draft was not submitted. Retry later or save a different location.'
          : describeApiFailure(requestError, 'submitting this version'),
      );
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
        <SessionUnavailable onSignIn={signIn} />
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
              <HotelLocationSelector
                id="new-hotel-location"
                locations={locations}
                value={newLocationId}
                onChange={setNewLocationId}
                loading={locationLoading}
                error={locationError}
                onRetry={() => void loadLocations()}
              />
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
                  accessToken={accessToken}
                  locations={locations}
                  locationLoading={locationLoading}
                  locationError={locationError}
                  onRetryLocations={() => void loadLocations()}
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
  accessToken,
  onSubmit,
  onCreateCorrection,
  locations,
  locationLoading,
  locationError,
  onRetryLocations,
}: Readonly<{
  application: HotelApplicationResponse;
  accessToken: string;
  onSubmit: () => Promise<void>;
  onCreateCorrection: (content: HotelApplicationContent) => Promise<void>;
  locations: HotelLocation[];
  locationLoading: boolean;
  locationError: string | null;
  onRetryLocations: () => void;
}>) {
  const [locationId, setLocationId] = useState(application.content.administrativeUnitId ?? '');
  const [busy, setBusy] = useState(false);
  const [workspaceOpen, setWorkspaceOpen] = useState(false);
  const [workspaceLoading, setWorkspaceLoading] = useState(false);
  const [workspaceError, setWorkspaceError] = useState<string | null>(null);
  const [admittedWorkspace, setAdmittedWorkspace] = useState<HotelApplicationResponse | null>(null);

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
        ...(locationId ? { administrativeUnitId: locationId } : {}),
      });
    } finally {
      setBusy(false);
    }
  }

  async function handleToggleWorkspace() {
    if (workspaceOpen) {
      setWorkspaceOpen(false);
      return;
    }
    setWorkspaceLoading(true);
    setWorkspaceError(null);
    try {
      const data = await getAdmittedHotelWorkspace(application.id, { accessToken });
      setAdmittedWorkspace(data);
      setWorkspaceOpen(true);
    } catch (requestError) {
      setWorkspaceError(describeApiFailure(requestError, 'loading the admitted workspace'));
    } finally {
      setWorkspaceLoading(false);
    }
  }

  const isAdmitted =
    application.admissionStatus === 'admitted' || application.workspaceAccess === 'private_only';

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
      <HotelLocationDetails
        location={application.location}
        submitted={application.status !== 'draft' && application.currentVersionId != null}
      />
      <p className="muted">
        Administrator admission: {application.admissionStatus.replaceAll('_', ' ')}
      </p>

      {isAdmitted && (
        <div className="workspace-access-panel" style={{ marginTop: '12px' }}>
          <p className="notice">
            Private workspace access only. No listing, booking, subscription, or payment is enabled.
          </p>
          <div
            className="action-row"
            style={{ marginTop: '8px', display: 'flex', gap: '8px', flexWrap: 'wrap' }}
          >
            <button
              type="button"
              className="secondary-button"
              disabled={workspaceLoading}
              onClick={() => void handleToggleWorkspace()}
              aria-expanded={workspaceOpen}
            >
              {workspaceLoading
                ? 'Loading admitted workspace…'
                : workspaceOpen
                  ? 'Hide admitted workspace'
                  : 'View admitted workspace'}
            </button>
            <Link
              href={`/hotels/workspace/${application.id}`}
              className="secondary-button"
              style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}
            >
              Direct workspace link
            </Link>
          </div>
          {workspaceError && (
            <p className="error-message" role="alert" style={{ marginTop: '8px' }}>
              {workspaceError}
            </p>
          )}
          {workspaceOpen && admittedWorkspace && (
            <div
              className="decision-details admitted-workspace-content"
              style={{ marginTop: '12px' }}
              aria-label="Admitted hotel workspace details"
            >
              <h4>Confirmed Admitted Workspace</h4>
              <HotelLocationDetails
                location={admittedWorkspace.location}
                submitted={
                  admittedWorkspace.status !== 'draft' && admittedWorkspace.currentVersionId != null
                }
              />
              <p>
                <strong>Claimed hotel:</strong> {admittedWorkspace.content.claimedHotelName}
              </p>
              <p>
                <strong>Admitted version:</strong> {admittedWorkspace.currentVersion}
              </p>
              <p className="muted">
                <strong>Workspace tier:</strong>{' '}
                {admittedWorkspace.workspaceAccess.replaceAll('_', ' ')} ·{' '}
                <strong>Admission:</strong> {admittedWorkspace.admissionStatus.replaceAll('_', ' ')}
              </p>
              <p className="muted">
                Private workspace admission was recorded for submitted version{' '}
                {admittedWorkspace.admittedVersion ?? 'not recorded'}.
              </p>
              {admittedWorkspace.admittedVersion !== null &&
                admittedWorkspace.admittedVersion !== admittedWorkspace.currentVersion && (
                  <p className="notice" role="note">
                    Current application version {admittedWorkspace.currentVersion} is separate.
                    Earlier Bureau and Administrator decisions do not approve this version.
                  </p>
                )}
              {admittedWorkspace.admissionDecision && (
                <p>
                  <strong>
                    Administrator decision for submitted version{' '}
                    {admittedWorkspace.admissionDecision.applicationVersion}:
                  </strong>{' '}
                  {admittedWorkspace.admissionDecision.reason}
                </p>
              )}
              {admittedWorkspace.bureauDecision && (
                <p>
                  <strong>
                    Bureau decision for submitted version{' '}
                    {admittedWorkspace.bureauDecision.applicationVersion}:
                  </strong>{' '}
                  {admittedWorkspace.bureauDecision.reason}
                </p>
              )}
              <HotelDecisionHistory application={admittedWorkspace} />
              <p className="notice" role="note" style={{ marginTop: '8px' }}>
                {admittedWorkspace.notice}
              </p>
            </div>
          )}
        </div>
      )}

      {application.bureauDecision && (
        <div className="decision-details">
          <strong>
            {application.status === 'draft'
              ? `Previous submitted version ${application.bureauDecision.applicationVersion} outcome`
              : `Bureau outcome for submitted version ${application.bureauDecision.applicationVersion}`}{' '}
            {application.bureauDecision.decision.replaceAll('_', ' ')}
          </strong>
          <p>{application.bureauDecision.reason}</p>
          <p className="muted">
            Applies only to submitted version {application.bureauDecision.applicationVersion}; a new
            draft has not been reviewed.
          </p>
        </div>
      )}
      <HotelDecisionHistory application={application} />
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
          <HotelLocationSelector
            id={`hotel-location-${application.id}`}
            locations={locations}
            value={locationId}
            onChange={setLocationId}
            loading={locationLoading}
            error={locationError}
            onRetry={onRetryLocations}
          />
          <button type="submit" disabled={busy}>
            {busy ? 'Saving draft…' : 'Save private draft'}
          </button>
        </form>
      )}
      {canSubmitHotelApplication(application) && (
        <div className="action-row decision-details">
          <button
            type="button"
            disabled={
              busy ||
              !application.content.administrativeUnitId ||
              locationId !== application.content.administrativeUnitId
            }
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
