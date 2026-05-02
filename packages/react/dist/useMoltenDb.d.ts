import { DbEvent } from '@moltendb-web/core';
import { MoltenDbClient } from '@moltendb-web/query';
/**
 * Hook to access the MoltenDb Query Client directly.
 * Must be used inside <MoltenDbProvider>.
 */
export declare function useMoltenDb(): MoltenDbClient;
/**
 * Hook that returns true once MoltenDb has finished initialising.
 * Useful for gating UI until the database is ready.
 * Must be used inside <MoltenDbProvider>.
 */
export declare function useMoltenDbReady(): boolean;
/**
 * Hook to subscribe to real-time MoltenDb mutation events.
 * The callback is called whenever any document in the database changes.
 * Must be used inside <MoltenDbProvider>.
 *
 * @param listener - Called with each DbEvent as mutations occur.
 */
export declare function useMoltenDbEvents(listener: (event: DbEvent) => void): void;
