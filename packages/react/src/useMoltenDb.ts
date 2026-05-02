import { useEffect } from 'react';
import { DbEvent } from '@moltendb-web/core';
import { MoltenDbClient } from '@moltendb-web/query';
import { useMoltenDbContext } from './MoltenDbContext';

/** Hook to access the MoltenDb Query Client directly. Must be used inside <MoltenDbProvider>. */
export function useMoltenDb(): MoltenDbClient {
  return useMoltenDbContext().client;
}

/** Returns true once MoltenDb has finished initialising. Must be used inside <MoltenDbProvider>. */
export function useMoltenDbReady(): boolean {
  return useMoltenDbContext().isReady;
}

/** Returns true if this tab is the Leader (running the WASM worker). Must be used inside <MoltenDbProvider>. */
export function useMoltenDbIsLeader(): boolean {
  return useMoltenDbContext().db.isLeader;
}

/** Returns a function that terminates the MoltenDb worker. Call before clearing OPFS storage. Must be used inside <MoltenDbProvider>. */
export function useMoltenDbTerminate(): () => void {
  const { db } = useMoltenDbContext();
  return () => db.terminate();
}

/**
 * Hook to subscribe to real-time MoltenDb mutation events.
 * The callback is called whenever any document in the database changes.
 * Must be used inside <MoltenDbProvider>.
 */
export function useMoltenDbEvents(listener: (event: DbEvent) => void): void {
  const { db, isReady } = useMoltenDbContext();
  useEffect(() => {
    if (!isReady) return;
    return db.subscribe(listener);
  }, [db, isReady, listener]);
}

