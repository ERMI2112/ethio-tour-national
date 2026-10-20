'use client';

import React, { createContext, useContext } from 'react';

const HotelPilotSessionContext = createContext<string | null>(null);

export function HotelPilotSessionProvider({
  accessToken,
  children,
}: Readonly<{ accessToken: string | null; children: React.ReactNode }>) {
  return (
    <HotelPilotSessionContext.Provider value={accessToken}>
      {children}
    </HotelPilotSessionContext.Provider>
  );
}

export function useHotelPilotAccessToken() {
  return useContext(HotelPilotSessionContext);
}
