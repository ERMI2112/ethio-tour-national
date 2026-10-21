import React from 'react';
import type { HotelApplicationResponse } from '../lib/hotel-pilot-ui-state';

export function HotelDecisionHistory({ application }: { application: HotelApplicationResponse }) {
  const hasHistory =
    application.historicalBureauDecisions.length > 0 ||
    application.historicalAdmissionDecisions.length > 0;
  if (!hasHistory) return null;

  return (
    <section className="decision-details" aria-label="Historical version decisions">
      <h4>Decisions for earlier submitted versions</h4>
      <ul>
        {application.historicalBureauDecisions.map((decision) => (
          <li key={`bureau-${decision.applicationVersion}-${decision.decidedAt}`}>
            <strong>
              Bureau {decision.decision.replaceAll('_', ' ')} · submitted version{' '}
              {decision.applicationVersion}
            </strong>
            <p>{decision.reason}</p>
          </li>
        ))}
        {application.historicalAdmissionDecisions.map((decision) => (
          <li key={`admin-${decision.applicationVersion}-${decision.decidedAt}`}>
            <strong>
              Administrator {decision.decision.replaceAll('_', ' ')} · submitted version{' '}
              {decision.applicationVersion}
            </strong>
            <p>{decision.reason}</p>
          </li>
        ))}
      </ul>
      <p className="muted">These decisions apply only to the versions shown.</p>
    </section>
  );
}
