import { DestroyRef, inject } from "@angular/core";
import { MoltenDbClient } from "@moltendb-web/query";
import { DbEvent } from "@moltendb-web/core";
import { MoltenDbService } from "./moltendb.service";

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

/**
 * Flushes and closes the OPFS sync handle.
 * Call this before `moltenDbTerminate()` to avoid "No modification allowed" errors.
 */
export async function moltenDbClearOpfs(): Promise<void> {
  await inject(MoltenDbService).db.clearOpfs();
}

/** Terminates the MoltenDb worker. Call after clearing OPFS storage. */
export function moltenDbTerminate(): void {
  inject(MoltenDbService).db.terminate();
}

/**
 * Subscribe to real-time MoltenDb mutation events.
 * The subscription is automatically cleaned up when the injection context (component/service) is destroyed.
 * No manual unsubscription or ngOnDestroy needed.
 * Must be run in injection context (component/service).
 */
export function moltenDbEvents(listener: (event: DbEvent) => void): void {
  const unsub = inject(MoltenDbService).db.subscribe(listener);
  inject(DestroyRef).onDestroy(() => unsub());
}
