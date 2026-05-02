import { DbEvent } from '@moltendb-web/core';
import { MoltenDbClient } from '@moltendb-web/query';
/** Hook to access the MoltenDb Query Client directly. Must be used inside <MoltenDbProvider>. */
export declare function useMoltenDb(): MoltenDbClient;
/** Returns true once MoltenDb has finished initialising. Must be used inside <MoltenDbProvider>. */
export declare function useMoltenDbReady(): boolean;
/** Returns true if this tab is the Leader (running the WASM worker). Must be used inside <MoltenDbProvider>. */
export declare function useMoltenDbIsLeader(): boolean;
/** Returns a function that terminates the MoltenDb worker. Call before clearing OPFS storage. Must be used inside <MoltenDbProvider>. */
export declare function useMoltenDbTerminate(): () => void;
/**
 * Hook to subscribe to real-time MoltenDb mutation events.
 * The callback is called whenever any document in the database changes.
 * Must be used inside <MoltenDbProvider>.
 */
export declare function useMoltenDbEvents(listener: (event: DbEvent) => void): void;
