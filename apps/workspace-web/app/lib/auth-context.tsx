'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import { ApiClientError } from '@ethio-tour/api-client';
export const AUTH_UNAUTHORIZED_EVENT = 'ethio-tour:unauthorized';
import {
  type AuthenticatedUserSession,
  getInMemorySession,
  setInMemorySession,
  clearInMemorySession,
  startKeycloakSignIn,
  startKeycloakSignOut,
  loadServerWorkspaceContext,
} from './auth';
import { getClientApiBaseUrl } from './api-config';
import type { WorkspaceContextResponse } from './auth';

interface AuthContextValue {
  session: AuthenticatedUserSession | null;
  serverContext: WorkspaceContextResponse | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  signIn: (returnTo?: string) => Promise<void>;
  signOut: (postLogoutRedirectUri?: string) => Promise<void>;
  setSession: (session: AuthenticatedUserSession | null) => void;
  clearSession: () => void;
  reloadContext: () => Promise<WorkspaceContextResponse | null>;
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
  const [serverContext, setServerContext] = useState<WorkspaceContextResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function clearSession(message?: string): void {
    setSessionState(null);
    clearInMemorySession();
    setServerContext(null);
    setError(message ?? null);
  }

  const fetchContext = async (
    activeSession: AuthenticatedUserSession | null,
  ): Promise<WorkspaceContextResponse | null> => {
    if (!activeSession) {
      setServerContext(null);
      return null;
    }
    setIsLoading(true);
    try {
      const apiBaseUrl = typeof window !== 'undefined' ? getClientApiBaseUrl() : undefined;
      const ctx = await loadServerWorkspaceContext(
        activeSession,
        apiBaseUrl ? { apiBaseUrl } : undefined,
      );
      setServerContext(ctx);
      setError(null);
      return ctx;
    } catch (err) {
      setServerContext(null);
      if (err instanceof ApiClientError && err.status === 401) {
        clearSession('Your session expired or is no longer valid. Sign in again.');
        throw err;
      }
      const msg = err instanceof Error ? err.message : 'Failed to load workspace context';
      setError(msg);
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (session) {
      fetchContext(session).catch((err) => {
        console.error('Error loading server workspace context:', err);
      });
    } else {
      setServerContext(null);
    }
  }, [session]);

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

  const setSession = (newSession: AuthenticatedUserSession | null) => {
    setSessionState(newSession);
    setInMemorySession(newSession);
    setError(null);
  };

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

  const reloadContext = async () => {
    return fetchContext(session);
  };

  return (
    <AuthContext.Provider
      value={{
        session,
        serverContext,
        isAuthenticated: session !== null,
        isLoading,
        error,
        signIn,
        signOut,
        setSession,
        clearSession,
        reloadContext,
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
