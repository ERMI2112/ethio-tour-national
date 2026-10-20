'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  exchangeAuthorizationCode,
  createSessionFromTokenResponse,
  clearPendingAuthorization,
} from '../../lib/auth';
import { useAuth } from '../../lib/auth-context';

export default function AuthCallbackPage() {
  const router = useRouter();
  const { setSession } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(true);

  useEffect(() => {
    async function processCallback() {
      if (typeof window === 'undefined') return;

      const params = new URLSearchParams(window.location.search);
      const errorParam = params.get('error');
      const errorDesc = params.get('error_description');

      if (errorParam) {
        clearPendingAuthorization();
        setIsProcessing(false);
        setError(errorDesc || `Authentication failed: ${errorParam}`);
        return;
      }

      const code = params.get('code');
      const state = params.get('state');

      if (!code || !state) {
        clearPendingAuthorization();
        setIsProcessing(false);
        setError('Missing required authorization code or state parameters from identity provider.');
        return;
      }

      try {
        const authorization = await exchangeAuthorizationCode(code, state);
        const session = createSessionFromTokenResponse(
          authorization.tokens,
          authorization.idTokenClaims,
        );
        setSession(session);

        router.replace(authorization.returnTo ?? '/');
      } catch (err) {
        console.error('Failed to exchange authorization code:', err);
        setIsProcessing(false);
        setError(err instanceof Error ? err.message : 'Unknown authentication failure.');
      }
    }

    processCallback();
  }, [router, setSession]);

  return (
    <div className="workspace-container" style={{ maxWidth: '600px', margin: '48px auto' }}>
      {isProcessing && (
        <div
          role="status"
          style={{
            background: 'var(--color-bg-surface)',
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-md, 8px)',
            padding: '32px',
            textAlign: 'center',
          }}
        >
          <div style={{ fontSize: '2rem', marginBottom: '16px' }}>🔑</div>
          <h2 style={{ fontSize: '1.4rem', fontWeight: 700, color: 'var(--color-text-main)' }}>
            Authorizing Workspace Session
          </h2>
          <p style={{ color: 'var(--color-text-muted)', marginTop: '8px', fontSize: '0.95rem' }}>
            Completing Keycloak PKCE verification and loading server credentials...
          </p>
          <div
            className="skeleton-box"
            style={{ height: '8px', width: '60%', margin: '24px auto 0' }}
          />
        </div>
      )}

      {error && (
        <div
          className="state-banner error"
          role="alert"
          style={{ flexDirection: 'column', alignItems: 'flex-start', gap: '12px' }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span aria-hidden="true" style={{ fontSize: '1.4rem' }}>
              ⚠️
            </span>
            <strong style={{ fontSize: '1.1rem' }}>Authentication Error</strong>
          </div>
          <p style={{ margin: 0, fontSize: '0.9rem' }}>{error}</p>
          <div style={{ display: 'flex', gap: '12px', marginTop: '8px' }}>
            <Link href="/" className="btn btn-secondary" style={{ fontSize: '0.85rem' }}>
              Return to Workspace
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
