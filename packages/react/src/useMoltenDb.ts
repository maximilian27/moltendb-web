import { useEffect } from 'react';
import { DbEvent } from '@moltendb-web/core';
import { MoltenDbClient } from '@moltendb-web/query';
import { useMoltenDbContext } from './MoltenDbContext';

/**
 * Hook to access the MoltenDb Query Client directly.
 * Must be used inside <MoltenDbProvider>.
 */
export function useMoltenDb(): MoltenDbClient {
  return useMoltenDbContext().client;
}

/**
 * Hook that returns true once MoltenDb has finished initialising.
 * Useful for gating UI until the database is ready.
 * Must be used inside <MoltenDbProvider>.
 */
export function useMoltenDbReady(): boolean {
  return useMoltenDbContext().isReady;
}

/**
 * Hook to subscribe to real-time MoltenDb mutation events.
 * The callback is called whenever any document in the database changes.
 * Must be used inside <MoltenDbProvider>.
 *
 * @param listener - Called with each DbEvent as mutations occur.
 */
export function useMoltenDbEvents(listener: (event: DbEvent) => void): void {
  const { db, isReady } = useMoltenDbContext();
  useEffect(() => {
    if (!isReady) return;
    return db.subscribe(listener);
  }, [db, isReady, listener]);
}
