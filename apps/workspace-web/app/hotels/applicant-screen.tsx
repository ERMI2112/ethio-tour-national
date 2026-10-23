'use client';

import {
  API_UNAUTHORIZED_EVENT,
  ApiClientError,
  createHotelApplication,
  createHotelApplicationRevision,
  getAdmittedHotelWorkspace,
  getMyHotelApplications,
  submitHotelApplication,
} from '@ethio-tour/api-client';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import type { HotelLocationSelection } from '@ethio-tour/contracts';
import { HotelLocationDetails, HotelLocationSelector } from '../components/hotel-location';
import { HotelDecisionHistory } from '../components/hotel-decision-history';
import { HotelPilotFrame, LoadingState, SessionUnavailable } from '../components/hotel-pilot-ui';
import { useHotelPilotSession } from '../lib/hotel-pilot-session';
import {
  applicationVersionLabel,
  canEditHotelApplication,
  canSubmitHotelApplication,
  describeApiFailure,
  formatLocationHierarchy,
  type HotelApplicationContent,
  type HotelApplicationResponse,
} from '../lib/hotel-pilot-ui-state';
import styles from './applicant-portal.module.css';

export function HotelApplicantScreen() {
  const { accessToken, signIn } = useHotelPilotSession();
  const [applications, setApplications] = useState<HotelApplicationResponse[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorToken, setErrorToken] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [noticeToken, setNoticeToken] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [newLocationSelection, setNewLocationSelection] = useState<HotelLocationSelection | null>(
    null,
  );
  const [newLocationSelectionValid, setNewLocationSelectionValid] = useState(false);
  const [applicationsToken, setApplicationsToken] = useState<string | null>(null);
  const [loadingToken, setLoadingToken] = useState<string | null>(null);
  const [filters, setFilters] = useState<{ token: string | null; query: string }>({
    token: accessToken,
    query: '',
  });

  const requestSequence = useRef(0);
  const currentToken = useRef(accessToken);
  const creationInFlight = useRef(false);

  const reload = useCallback(async () => {
    const requestToken = accessToken;
    if (!requestToken) return false;
    const thisSequence = ++requestSequence.current;
    setLoadingToken(requestToken);
    setLoading(true);
    setError(null);
    setErrorToken(requestToken);
    try {
      const response = await getMyHotelApplications({ accessToken: requestToken });
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
      setError(describeApiFailure(requestError, 'loading your applications'));
      return false;
    } finally {
      if (thisSequence === requestSequence.current && currentToken.current === requestToken) {
        setLoading(false);
      }
    }
  }, [accessToken]);

  // Session lifecycle: reset state when identity changes or session ends
  useEffect(() => {
    currentToken.current = accessToken;
    requestSequence.current++;
    setApplications([]);
    setApplicationsToken(null);
    setError(null);
    setErrorToken(null);
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
    };
    if (typeof window !== 'undefined') {
      window.addEventListener(API_UNAUTHORIZED_EVENT, handleUnauthorized);
      return () => window.removeEventListener(API_UNAUTHORIZED_EVENT, handleUnauthorized);
    }
  }, []);

  async function createApplication(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const requestToken = accessToken;
    if (!requestToken || creating || creationInFlight.current) return;
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const content = {
      claimedHotelName: String(form.get('claimedHotelName') ?? '').trim(),
      applicantNotes: String(form.get('applicantNotes') ?? '').trim(),
      ...(newLocationSelection ? { locationSelection: newLocationSelection } : {}),
    };
    if (!content.claimedHotelName) {
      setError('Enter the hotel name you are applying about.');
      setErrorToken(requestToken);
      return;
    }
    if (!newLocationSelection || !newLocationSelectionValid) {
      setError('Search and choose a location in the active directory before creating the draft.');
      setErrorToken(requestToken);
      return;
    }

    creationInFlight.current = true;
    setCreating(true);
    setError(null);
    setErrorToken(null);
    setNotice(null);
    setNoticeToken(null);
    try {
      const created = await createHotelApplication({ content }, { accessToken: requestToken });
      if (currentToken.current !== requestToken) return;
      setApplications((current) => [created, ...current]);
      setNotice('The private draft was returned by the API. Review it below before submitting.');
      setNoticeToken(requestToken);
      formElement.reset();
      setNewLocationSelection(null);
      setNewLocationSelectionValid(false);
    } catch (requestError) {
      if (currentToken.current === requestToken) {
        if (
          requestError instanceof ApiClientError &&
          (requestError.status === 401 || requestError.status === 403)
        ) {
          setApplications([]);
          setApplicationsToken(requestToken);
          setFilters({ token: requestToken, query: '' });
        }
        setError(describeApiFailure(requestError, 'creating the private application'));
        setErrorToken(requestToken);
      }
    } finally {
      creationInFlight.current = false;
      setCreating(false);
    }
  }

  async function submitDraft(application: HotelApplicationResponse) {
    const requestToken = accessToken;
    if (!requestToken) return;
    setError(null);
    setErrorToken(null);
    setNotice(null);
    setNoticeToken(null);
    try {
      const updated = await submitHotelApplication(
        application.id,
        { expectedVersion: application.version },
        { accessToken: requestToken },
      );
      if (currentToken.current !== requestToken) return;
      setApplications((current) => replaceApplication(current, updated));
      setNotice('The API accepted the submission. Its status below reflects the API response.');
      setNoticeToken(requestToken);
    } catch (requestError) {
      if (currentToken.current === requestToken) {
        if (
          requestError instanceof ApiClientError &&
          (requestError.status === 401 || requestError.status === 403)
        ) {
          setApplications([]);
          setApplicationsToken(requestToken);
          setFilters({ token: requestToken, query: '' });
        }
        setError(
          requestError instanceof ApiClientError &&
            (requestError.code === 'HOTEL_ROUTING_UNAVAILABLE' ||
              (requestError.status === 503 && requestError.code === undefined))
            ? 'Review routing is unavailable for this location. Your draft is saved; submission has not occurred.'
            : describeApiFailure(requestError, 'submitting this version'),
        );
        setErrorToken(requestToken);
      }
    }
  }

  async function createCorrection(
    application: HotelApplicationResponse,
    content: HotelApplicationContent,
  ) {
    const requestToken = accessToken;
    if (!requestToken) return;
    setError(null);
    setErrorToken(null);
    setNotice(null);
    setNoticeToken(null);
    try {
      const updated = await createHotelApplicationRevision(
        application.id,
        { expectedVersion: application.version, content },
        { accessToken: requestToken },
      );
      if (currentToken.current !== requestToken) return;
      setApplications((current) => replaceApplication(current, updated));
      setNotice('The API returned a new private version. Submit it for Bureau review when ready.');
      setNoticeToken(requestToken);
    } catch (requestError) {
      if (currentToken.current === requestToken) {
        if (
          requestError instanceof ApiClientError &&
          (requestError.status === 401 || requestError.status === 403)
        ) {
          setApplications([]);
          setApplicationsToken(requestToken);
          setFilters({ token: requestToken, query: '' });
        }
        setError(describeApiFailure(requestError, 'creating the corrected version'));
        setErrorToken(requestToken);
      }
    }
  }

  const isQueueLoading = Boolean(accessToken) && (loadingToken !== accessToken || loading);
  const visibleApplications = applicationsToken === accessToken ? applications : [];
  const visibleError = errorToken === accessToken ? error : null;
  const visibleNotice = noticeToken === accessToken ? notice : null;

  const query = filters.token === accessToken ? filters.query : '';
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const matchesApplication = (app: HotelApplicationResponse) =>
    !normalizedQuery ||
    `${app.content.claimedHotelName} ${formatLocationHierarchy(app.location)} ${app.content.applicantNotes}`
      .toLocaleLowerCase()
      .includes(normalizedQuery);
  const matchingCount = visibleApplications.filter(matchesApplication).length;

  const draftCount = visibleApplications.filter((a) => a.status === 'draft').length;
  const inReviewCount = visibleApplications.filter((a) => a.status === 'submitted').length;
  const admittedCount = visibleApplications.filter(
    (a) => a.admissionStatus === 'admitted' || a.workspaceAccess === 'private_only',
  ).length;

  return (
    <HotelPilotFrame
      title="Hotel applications"
      description="Create and track your own private application. Only the API determines ownership and access."
    >
      {!accessToken ? (
        <SessionUnavailable onSignIn={signIn} />
      ) : (
        <div className={`card-stack ${styles.portal}`}>
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
                accessToken={accessToken}
                value={newLocationSelection}
                locationSnapshot={null}
                onChange={setNewLocationSelection}
                onSelectionValidityChange={setNewLocationSelectionValid}
              />
              <button type="submit" disabled={creating || !newLocationSelectionValid}>
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
                disabled={isQueueLoading}
                aria-busy={isQueueLoading ? 'true' : undefined}
              >
                Refresh
              </button>
            </div>

            {applicationsToken === accessToken && visibleApplications.length > 0 && (
              <div className={styles.overview} role="region" aria-label="Applications overview">
                <div className={styles.overviewPill}>
                  <span>Total loaded:</span>
                  <span className={styles.overviewCount}>{visibleApplications.length}</span>
                </div>
                <div className={styles.overviewPill}>
                  <span>Drafts:</span>
                  <span className={styles.overviewCount}>{draftCount}</span>
                </div>
                <div className={styles.overviewPill}>
                  <span>In Review:</span>
                  <span className={styles.overviewCount}>{inReviewCount}</span>
                </div>
                <div className={styles.overviewPill}>
                  <span>Admitted workspace:</span>
                  <span className={styles.overviewCount}>{admittedCount}</span>
                </div>
              </div>
            )}

            {visibleApplications.length > 0 && (
              <div className={styles.filters}>
                <div className="form-field">
                  <label htmlFor="applicant-search">Search your applications</label>
                  <input
                    id="applicant-search"
                    type="search"
                    value={query}
                    onChange={(event) =>
                      setFilters({ token: accessToken, query: event.target.value })
                    }
                    aria-describedby="applicant-search-hint"
                    placeholder="Filter by hotel name, notes, or location…"
                  />
                  <p id="applicant-search-hint" className="field-hint">
                    Hotel name, applicant notes, or submitted location. Searches only the records
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
            )}

            {applicationsToken === accessToken && visibleApplications.length > 0 && (
              <p className={styles.count} role="status" aria-live="polite" aria-atomic="true">
                Showing {matchingCount} of {visibleApplications.length} loaded applications
              </p>
            )}

            {isQueueLoading && <LoadingState label="Loading your applications…" />}

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

            {!isQueueLoading && visibleApplications.length === 0 && !visibleError && (
              <p className="empty-state">No applications were returned for this account.</p>
            )}

            {!isQueueLoading &&
              visibleApplications.length > 0 &&
              matchingCount === 0 &&
              !visibleError && (
                <p className="empty-state">
                  No loaded applications match this search. Clear the search to see your full
                  applications list.
                </p>
              )}

            <div className="card-stack">
              {visibleApplications.map((application) => (
                <ApplicantApplicationCard
                  key={`${accessToken}:${application.id}-${application.currentVersionId}`}
                  application={application}
                  accessToken={accessToken}
                  hidden={!matchesApplication(application)}
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
  hidden,
  onSubmit,
  onCreateCorrection,
}: Readonly<{
  application: HotelApplicationResponse;
  accessToken: string;
  hidden: boolean;
  onSubmit: () => Promise<void>;
  onCreateCorrection: (content: HotelApplicationContent) => Promise<void>;
}>) {
  const [claimedHotelName, setClaimedHotelName] = useState(application.content.claimedHotelName);
  const [applicantNotes, setApplicantNotes] = useState(application.content.applicantNotes);
  const [locationSelection, setLocationSelection] = useState<HotelLocationSelection | null>(
    application.content.locationSelection ?? null,
  );
  const [locationSelectionValid, setLocationSelectionValid] = useState(false);
  const [busy, setBusy] = useState(false);
  const [saveFeedback, setSaveFeedback] = useState<string | null>(null);
  const [workspaceOpen, setWorkspaceOpen] = useState(false);
  const [workspaceLoading, setWorkspaceLoading] = useState(false);
  const [workspaceError, setWorkspaceError] = useState<string | null>(null);
  const [admittedWorkspace, setAdmittedWorkspace] = useState<HotelApplicationResponse | null>(null);
  const submissionInFlight = useRef(false);

  useEffect(() => {
    setClaimedHotelName(application.content.claimedHotelName);
    setApplicantNotes(application.content.applicantNotes);
    setLocationSelection(application.content.locationSelection ?? null);
    setSaveFeedback(null);
  }, [
    application.id,
    application.version,
    application.currentVersionId,
    application.content.claimedHotelName,
    application.content.applicantNotes,
    application.content.locationSelection,
  ]);

  const isDirty =
    claimedHotelName.trim() !== application.content.claimedHotelName.trim() ||
    applicantNotes.trim() !== application.content.applicantNotes.trim() ||
    !sameLocationSelection(locationSelection, application.content.locationSelection);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submissionInFlight.current || busy) return;
    submissionInFlight.current = true;
    setBusy(true);
    setSaveFeedback(null);
    try {
      const form = new FormData(event.currentTarget);
      const name = String(form.get('claimedHotelName') ?? '').trim();
      const notes = String(form.get('applicantNotes') ?? '').trim();
      if (!name) return;
      if (!locationSelection || !locationSelectionValid) return;
      await onCreateCorrection({
        claimedHotelName: name,
        applicantNotes: notes,
        locationSelection,
      });
      setSaveFeedback('Private draft saved on the server.');
    } finally {
      submissionInFlight.current = false;
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

  const isDraftLocationSelectionNew = Boolean(
    application.status === 'draft' &&
      locationSelection &&
      !sameLocationSelection(locationSelection, application.content.locationSelection),
  );

  return (
    <article
      className={`application-card ${styles.applicationCard}`}
      aria-labelledby={`application-${application.id}`}
      hidden={hidden}
    >
      <div className={styles.cardTopline}>
        <div>
          <p className="eyebrow">{applicationVersionLabel(application)}</p>
          <h3 id={`application-${application.id}`}>{application.content.claimedHotelName}</h3>
        </div>
        <span className="status status-neutral">{application.status.replaceAll('_', ' ')}</span>
      </div>

      {application.content.applicantNotes && <p>{application.content.applicantNotes}</p>}

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

      <p className="muted">
        Administrator admission: {application.admissionStatus.replaceAll('_', ' ')}
      </p>

      {isAdmitted && (
        <div className={`workspace-access-panel ${styles.workspacePanel}`}>
          <div className="section-heading">
            <div>
              <p className="eyebrow">Admitted Provider Workspace</p>
              <h4>Confirmed Admitted Workspace Access</h4>
            </div>
            <span className="status status-neutral">Private Workspace</span>
          </div>
          <p className="notice">
            Private workspace access only. No listing, booking, subscription, or payment is enabled.
          </p>
          <div className={styles.workspaceActions}>
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
              {admittedWorkspace.admittedVersion !== null &&
              admittedWorkspace.admittedVersion === admittedWorkspace.currentVersion &&
              admittedWorkspace.status !== 'draft' &&
              admittedWorkspace.currentVersionId !== null ? (
                <HotelLocationDetails
                  location={admittedWorkspace.location}
                  selection={admittedWorkspace.content.locationSelection}
                  locationState={admittedWorkspace.locationState}
                  submitted
                  applicationVersion={admittedWorkspace.admittedVersion}
                />
              ) : (
                <p className="notice" role="note">
                  The location snapshot for the admitted version is not included in this response.
                  The current application location is shown separately on its application card.
                </p>
              )}
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
        <form className={`form-stack decision-details ${styles.draftForm}`} onSubmit={handleSubmit}>
          <div className={styles.draftHeading}>
            <h4>
              {application.status === 'draft'
                ? 'Edit the private draft'
                : 'Prepare a new private version'}
            </h4>
            {isDirty ? (
              <span className={styles.unsavedBadge}>Unsaved draft changes</span>
            ) : (
              <span className={styles.savedBadge}>Saved on server</span>
            )}
          </div>
          <div className="form-field">
            <label htmlFor={`hotel-name-${application.id}`}>
              Hotel name stated in this application
            </label>
            <input
              id={`hotel-name-${application.id}`}
              name="claimedHotelName"
              value={claimedHotelName}
              onChange={(e) => setClaimedHotelName(e.target.value)}
              required
            />
          </div>
          <div className="form-field">
            <label htmlFor={`hotel-notes-${application.id}`}>Application notes</label>
            <textarea
              id={`hotel-notes-${application.id}`}
              name="applicantNotes"
              value={applicantNotes}
              onChange={(e) => setApplicantNotes(e.target.value)}
            />
          </div>
          <HotelLocationSelector
            id={`hotel-location-${application.id}`}
            accessToken={accessToken}
            value={locationSelection}
            locationSnapshot={application.location}
            locationState={application.locationState}
            onChange={setLocationSelection}
            onSelectionValidityChange={setLocationSelectionValid}
          />
          {isDraftLocationSelectionNew && application.bureauDecision && (
            <p className="notice" role="note">
              Previous Bureau approval applied to submitted version{' '}
              {application.bureauDecision.applicationVersion} at its original location. This newly
              selected draft location has not been reviewed or approved.
            </p>
          )}
          <button type="submit" disabled={busy || !locationSelectionValid}>
            {busy ? 'Saving draft…' : 'Save private draft'}
          </button>
          {saveFeedback && (
            <p className="success-message" role="status">
              {saveFeedback}
            </p>
          )}
        </form>
      )}

      {canSubmitHotelApplication(application) && (
        <div className={`action-row decision-details ${styles.submissionGuidance}`}>
          <p>
            <strong>Submitting for review:</strong> Submitting creates an immutable snapshot of this
            version and routes your property location to the competent Bureau office. Once
            submitted, changes cannot be made until review is completed.
          </p>
          {!sameLocationSelection(locationSelection, application.content.locationSelection) && (
            <p className="field-hint">
              Save your chosen location before submitting this version for review.
            </p>
          )}
          {application.locationState === 'stale' && (
            <p className="field-hint">
              The saved location is stale. Search the directory and select a current location before
              submitting.
            </p>
          )}
          <button
            type="button"
            disabled={
              busy ||
              !application.content.locationSelection ||
              !locationSelectionValid ||
              !sameLocationSelection(locationSelection, application.content.locationSelection)
            }
            onClick={async () => {
              if (submissionInFlight.current || busy) return;
              submissionInFlight.current = true;
              setBusy(true);
              try {
                await onSubmit();
              } finally {
                submissionInFlight.current = false;
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

function sameLocationSelection(
  first: HotelLocationSelection | null,
  second: HotelLocationSelection | undefined,
) {
  return Boolean(
    first &&
      second &&
      first.geographyReleaseId === second.geographyReleaseId &&
      first.unitId === second.unitId &&
      first.unitRevisionId === second.unitRevisionId,
  );
}
