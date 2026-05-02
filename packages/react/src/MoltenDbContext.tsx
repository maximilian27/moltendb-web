import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { MoltenDb, MoltenDbOptions } from '@moltendb-web/core';
import { MoltenDbClient } from '@moltendb-web/query';

export interface ReactMoltenDbOptions extends MoltenDbOptions {
  name: string;
}

export interface MoltenDbContextValue {
  db: MoltenDb;
  client: MoltenDbClient;
  isReady: boolean;
}

export const MoltenDbContext = createContext<MoltenDbContextValue | null>(null);

export interface MoltenDbProviderProps {
  config: ReactMoltenDbOptions;
  children: React.ReactNode;
}

export function MoltenDbProvider({ config, children }: MoltenDbProviderProps) {
  const [isReady, setIsReady] = useState(false);

  // Use refs so the db/client instances are stable across renders
  const dbRef = useRef<MoltenDb | null>(null);
  const clientRef = useRef<MoltenDbClient | null>(null);

  if (!dbRef.current) {
    dbRef.current = new MoltenDb(config.name, config);
    clientRef.current = new MoltenDbClient(dbRef.current);
  }

  useEffect(() => {
    dbRef.current!.init()
      .then(() => setIsReady(true))
      .catch((err) => console.error('[MoltenDb] Failed to initialize', err));
  }, []);

  return (
    <MoltenDbContext.Provider
      value={{
        db: dbRef.current,
        client: clientRef.current!,
        isReady,
      }}
    >
      {children}
    </MoltenDbContext.Provider>
  );
}

export function useMoltenDbContext(): MoltenDbContextValue {
  const ctx = useContext(MoltenDbContext);
  if (!ctx) {
    throw new Error('[MoltenDb] useMoltenDbContext must be used inside <MoltenDbProvider>');
  }
  return ctx;
}
