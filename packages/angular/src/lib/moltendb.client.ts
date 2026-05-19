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

/** Terminates the MoltenDb worker. Call before clearing OPFS storage. */
export function moltenDbTerminate(): void {
  inject(MoltenDbService).db.terminate();
}
/**
 * Flushes and closes the OPFS sync handle.
 * Call this before `moltenDbTerminate()` to avoid "No modification allowed" errors.
 */
export async function moltenDbClearOpfs(): Promise<void> {
  await inject(MoltenDbService).db.clearOpfs();
}

/**
 * Subscribe to real-time MoltenDb mutation events.
 * The subscription is automatically cleaned up when the injection context (component/service) is destroyed.
 * No manual unsubscription or ngOnDestroy needed.
 */
export function moltenDbEvents(listener: (event: DbEvent) => void): void {
  const unsub = inject(MoltenDbService).db.subscribe(listener);
  inject(DestroyRef).onDestroy(() => unsub());
}
