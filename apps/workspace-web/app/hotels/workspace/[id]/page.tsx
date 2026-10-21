'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { HotelLocationDetails } from '../../../components/hotel-location';
import { HotelDecisionHistory } from '../../../components/hotel-decision-history';
import { getAdmittedHotelWorkspace } from '@ethio-tour/api-client';
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
    if (!accessToken || !applicationId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await getAdmittedHotelWorkspace(applicationId, { accessToken });
      setWorkspace(data);
    } catch (err) {
      setError(describeApiFailure(err, 'loading the admitted workspace'));
    } finally {
      setLoading(false);
    }
  }, [accessToken, applicationId]);

  useEffect(() => {
    if (applicationId) {
      void loadWorkspace();
    }
  }, [applicationId, loadWorkspace]);

  return (
    <HotelPilotFrame
      title="Admitted hotel workspace"
      description="Private provider workspace access confirmed by Administrator admission."
    >
      {!accessToken ? (
        <SessionUnavailable onSignIn={signIn} />
      ) : (
        <div className="card-stack">
          <div className="action-row" style={{ marginBottom: '16px' }}>
            <Link href="/hotels" className="secondary-button" style={{ textDecoration: 'none' }}>
              ← Back to applications
            </Link>
          </div>
          {loading && <LoadingState label="Loading admitted workspace…" />}
          {error && (
            <p className="error-message" role="alert">
              {error}
            </p>
          )}
          {workspace && (
            <article className="application-card" aria-label="Admitted hotel workspace">
              <div className="card-topline">
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
              <div className="decision-details">
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
                <HotelDecisionHistory application={workspace} />
              </div>
              <div className="action-row" style={{ marginTop: '16px' }}>
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => void loadWorkspace()}
                  disabled={loading}
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
