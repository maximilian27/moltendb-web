import { inject } from '@angular/core';
import { MoltenDbClient } from '@moltendb-web/query';
import { DbEvent } from '@moltendb-web/core';
import { MoltenDbService } from './moltendb.service';

/** Functional injection hook to access the MoltenDb Query Client. */
export function moltendbClient(): MoltenDbClient {
  return inject(MoltenDbService).client;
}

/** Returns true once MoltenDb has finished initialising. */
export function moltenDbReady(): boolean {
  return inject(MoltenDbService).isReady();
}

/** Returns true if this tab is the Leader (running the WASM worker). */
export function moltenDbIsLeader(): boolean {
  return inject(MoltenDbService).db.isLeader;
}

/** Terminates the MoltenDb worker. Call before clearing OPFS storage. */
export function moltenDbTerminate(): void {
  inject(MoltenDbService).db.terminate();
}

/**
 * Subscribe to real-time MoltenDb mutation events.
 * Returns an unsubscribe function � call it in ngOnDestroy to prevent memory leaks.
 */
export function moltenDbEvents(listener: (event: DbEvent) => void): () => void {
  return inject(MoltenDbService).db.subscribe(listener);
}

