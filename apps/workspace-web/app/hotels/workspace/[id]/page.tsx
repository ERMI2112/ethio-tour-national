'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { HotelLocationDetails } from '../../../components/hotel-location';
import { HotelDecisionHistory } from '../../../components/hotel-decision-history';
import {
  API_UNAUTHORIZED_EVENT,
  ApiClientError,
  getAdmittedHotelWorkspace,
} from '@ethio-tour/api-client';
import {
  HotelPilotFrame,
  LoadingState,
  SessionUnavailable,
} from '../../../components/hotel-pilot-ui';
import { useHotelPilotSession } from '../../../lib/hotel-pilot-session';
import {
  describeApiFailure,
  type HotelApplicationResponse,
} from '../../../lib/hotel-pilot-ui-state';
import styles from '../admitted-workspace.module.css';

export default function AdmittedHotelWorkspacePage({
  params,
}: Readonly<{
  params: Promise<{ id: string }>;
}>) {
  const [applicationId, setApplicationId] = useState<string | null>(null);
  const { accessToken, signIn } = useHotelPilotSession();
  const [workspace, setWorkspace] = useState<HotelApplicationResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorKind, setErrorKind] = useState<'denied' | 'failure' | null>(null);

  const requestSequence = useRef(0);
  const currentToken = useRef(accessToken);

  useEffect(() => {
    let active = true;
    void params.then((resolved) => {
      if (active) setApplicationId(resolved.id);
    });
    return () => {
      active = false;
    };
  }, [params]);

  const loadWorkspace = useCallback(async () => {
    const requestToken = accessToken;
    if (!requestToken || !applicationId) return;
    const thisSequence = ++requestSequence.current;
    setLoading(true);
    setError(null);
    setErrorKind(null);
    try {
      const data = await getAdmittedHotelWorkspace(applicationId, { accessToken: requestToken });
      if (thisSequence !== requestSequence.current || currentToken.current !== requestToken) return;
      setWorkspace(data);
    } catch (err) {
      if (thisSequence !== requestSequence.current || currentToken.current !== requestToken) return;
      if (err instanceof ApiClientError && (err.status === 401 || err.status === 403)) {
        setWorkspace(null);
        setErrorKind(err.status === 403 ? 'denied' : 'failure');
      } else {
        setErrorKind('failure');
      }
      setError(describeApiFailure(err, 'loading the admitted workspace'));
    } finally {
      if (thisSequence === requestSequence.current && currentToken.current === requestToken) {
        setLoading(false);
      }
    }
  }, [accessToken, applicationId]);

  // Session lifecycle: reset when token changes or session ends
  useEffect(() => {
    currentToken.current = accessToken;
    requestSequence.current++;
    setWorkspace(null);
    setError(null);
    setErrorKind(null);
    if (!accessToken || !applicationId) {
      return;
    }
    void loadWorkspace();
  }, [accessToken, applicationId, loadWorkspace]);

  // Handle unauthorized event
  useEffect(() => {
    const handleUnauthorized = () => {
      requestSequence.current++;
      setWorkspace(null);
      setError('Your authenticated session is missing or has expired.');
      setErrorKind('failure');
    };
    if (typeof window !== 'undefined') {
      window.addEventListener(API_UNAUTHORIZED_EVENT, handleUnauthorized);
      return () => window.removeEventListener(API_UNAUTHORIZED_EVENT, handleUnauthorized);
    }
  }, []);

  return (
    <HotelPilotFrame
      title="Admitted hotel workspace"
      description="Private provider workspace access confirmed by Administrator admission."
    >
      {!accessToken ? (
        <SessionUnavailable onSignIn={signIn} />
      ) : (
        <div className={`card-stack ${styles.workspaceShell}`}>
          <div className={`action-row ${styles.backLink}`}>
            <Link href="/hotels" className="secondary-button" style={{ textDecoration: 'none' }}>
              ← Back to applications
            </Link>
          </div>

          {loading && <LoadingState label="Loading admitted workspace…" />}

          {error && (
            <div className="error-message" role="alert">
              {errorKind === 'denied' ? <strong>Access denied: </strong> : null}
              {error}
            </div>
          )}

          {workspace && (
            <article
              className={`application-card ${styles.admittedCard}`}
              aria-label="Admitted hotel workspace"
            >
              <div className={`card-topline ${styles.cardTopline}`}>
                <div>
                  <p className="eyebrow">Current application version {workspace.currentVersion}</p>
                  <h3>{workspace.content.claimedHotelName}</h3>
                </div>
                <span className="status status-neutral">Private Workspace</span>
              </div>

              <p className="notice">
                Private workspace access only. No listing, booking, subscription, or payment is
                enabled.
              </p>

              {workspace.content.applicantNotes && <p>{workspace.content.applicantNotes}</p>}

              <div className={styles.admittedContext}>
                <h4>Confirmed Admitted Workspace</h4>
                <p>
                  <strong>Administrator admission:</strong>{' '}
                  {workspace.admissionStatus.replaceAll('_', ' ')}
                </p>
                <p>
                  <strong>Admission recorded for submitted version:</strong>{' '}
                  {workspace.admittedVersion ?? 'not recorded'}
                </p>
                {workspace.admittedVersion !== null &&
                  workspace.admittedVersion !== workspace.currentVersion && (
                    <p className="notice" role="note">
                      Private workspace access remains available from version{' '}
                      {workspace.admittedVersion}. Current version {workspace.currentVersion} is a
                      separate submission; earlier decisions do not approve it.
                    </p>
                  )}
                {workspace.admissionDecision && (
                  <p>
                    <strong>
                      Administrator decision for submitted version{' '}
                      {workspace.admissionDecision.applicationVersion}:
                    </strong>{' '}
                    {workspace.admissionDecision.reason}
                  </p>
                )}
                {workspace.bureauDecision && (
                  <p>
                    <strong>
                      Bureau outcome for submitted version{' '}
                      {workspace.bureauDecision.applicationVersion}:{' '}
                    </strong>{' '}
                    {workspace.bureauDecision.decision.replaceAll('_', ' ')} (
                    {workspace.bureauDecision.reason})
                  </p>
                )}
              </div>

              <HotelLocationDetails
                location={workspace.location}
                selection={workspace.content.locationSelection}
                locationState={workspace.locationState}
                submitted={workspace.status !== 'draft' && workspace.currentVersionId != null}
                applicationVersion={
                  workspace.status !== 'draft' && workspace.currentVersionId !== null
                    ? workspace.currentVersion
                    : undefined
                }
              />

              <HotelDecisionHistory application={workspace} />

              <div className="action-row" style={{ marginTop: '16px' }}>
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => void loadWorkspace()}
                  disabled={loading}
                  aria-busy={loading ? 'true' : undefined}
                >
                  Refresh workspace
                </button>
              </div>
            </article>
          )}
        </div>
      )}
    </HotelPilotFrame>
  );
}
