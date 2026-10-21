'use client';

import React, { createContext, useContext } from 'react';
import { useOptionalAuth } from './auth-context';
import { startKeycloakSignIn } from './auth';

export interface HotelPilotSession {
  accessToken: string | null;
  isAuthenticated: boolean;
  signIn: (returnTo?: string) => Promise<void>;
  signOut: (postLogoutRedirectUri?: string) => Promise<void>;
  displayName?: string | undefined;
  actorKey?: string | undefined;
}

const HotelPilotSessionContext = createContext<HotelPilotSession | null>(null);

export function HotelPilotSessionProvider({
  accessToken,
  children,
}: Readonly<{ accessToken?: string | null; children: React.ReactNode }>) {
  const value: HotelPilotSession = {
    accessToken: accessToken ?? null,
    isAuthenticated: Boolean(accessToken),
    signIn: async (returnTo?: string) => {
      await startKeycloakSignIn(returnTo !== undefined ? { returnTo } : undefined);
    },
    signOut: async () => {},
  };

  return (
    <HotelPilotSessionContext.Provider value={value}>{children}</HotelPilotSessionContext.Provider>
  );
}

export function useHotelPilotSession(): HotelPilotSession {
  const explicit = useContext(HotelPilotSessionContext);
  const auth = useOptionalAuth();

  if (explicit && explicit.accessToken !== null) {
    return explicit;
  }

  if (auth) {
    return {
      accessToken: auth.session?.accessToken ?? null,
      isAuthenticated: auth.isAuthenticated,
      signIn: auth.signIn,
      signOut: auth.signOut,
      displayName: auth.session?.displayName,
      actorKey: auth.session?.actorKey,
    };
  }

  if (explicit) {
    return explicit;
  }

  return {
    accessToken: null,
    isAuthenticated: false,
    signIn: async (returnTo?: string) => {
      await startKeycloakSignIn(returnTo !== undefined ? { returnTo } : undefined);
    },
    signOut: async () => {},
  };
}

export function useHotelPilotAccessToken(): string | null {
  return useHotelPilotSession().accessToken;
}
