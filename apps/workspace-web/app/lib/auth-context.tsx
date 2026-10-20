'use client';

import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { API_UNAUTHORIZED_EVENT } from '@ethio-tour/api-client';
export const AUTH_UNAUTHORIZED_EVENT = API_UNAUTHORIZED_EVENT;
import {
  type AuthenticatedUserSession,
  getInMemorySession,
  setInMemorySession,
  clearInMemorySession,
  startKeycloakSignIn,
  startKeycloakSignOut,
} from './auth';

interface AuthContextValue {
  session: AuthenticatedUserSession | null;
  isAuthenticated: boolean;
  error: string | null;
  signIn: (returnTo?: string) => Promise<void>;
  signOut: (postLogoutRedirectUri?: string) => Promise<void>;
  setSession: (session: AuthenticatedUserSession | null) => void;
  clearSession: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({
  children,
  initialSession = null,
}: {
  children: React.ReactNode;
  initialSession?: AuthenticatedUserSession | null;
}) {
  const [session, setSessionState] = useState<AuthenticatedUserSession | null>(
    initialSession ?? getInMemorySession(),
  );
  const [error, setError] = useState<string | null>(null);

  function clearSession(message?: string): void {
    setSessionState(null);
    clearInMemorySession();
    setError(message ?? null);
  }

  useEffect(() => {
    const handleUnauthorized = () => {
      clearSession('Your session expired or is no longer valid. Sign in again.');
    };
    window.addEventListener(AUTH_UNAUTHORIZED_EVENT, handleUnauthorized);
    return () => window.removeEventListener(AUTH_UNAUTHORIZED_EVENT, handleUnauthorized);
  }, []);

  useEffect(() => {
    if (!session) return;
    const expiresIn = session.expiresAt - Date.now();
    const expireSession = () => {
      clearSession('Your session expired. Sign in again.');
    };
    if (expiresIn <= 0) {
      expireSession();
      return;
    }
    const timeout = window.setTimeout(expireSession, expiresIn);
    return () => window.clearTimeout(timeout);
  }, [session]);

  const setSession = useCallback((newSession: AuthenticatedUserSession | null) => {
    setSessionState(newSession);
    setInMemorySession(newSession);
    setError(null);
  }, []);

  const signIn = async (returnTo?: string) => {
    setError(null);
    try {
      await startKeycloakSignIn(returnTo !== undefined ? { returnTo } : undefined);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to initiate sign-in';
      setError(msg);
      throw err;
    }
  };

  const signOut = async (postLogoutRedirectUri?: string) => {
    setError(null);
    try {
      const current = session;
      clearSession();
      startKeycloakSignOut(current, postLogoutRedirectUri);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to sign out';
      setError(msg);
      throw err;
    }
  };

  return (
    <AuthContext.Provider
      value={{
        session,
        isAuthenticated: session !== null,
        error,
        signIn,
        signOut,
        setSession,
        clearSession,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useOptionalAuth(): AuthContextValue | undefined {
  return useContext(AuthContext);
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
