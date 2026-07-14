import { useEffect, useRef } from "react";
import { DbEvent } from "@moltendb-web/core";
import { MoltenDbClient } from "@moltendb-web/query";
import { useMoltenDbContext } from "./MoltenDbContext";

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

/**
 * Returns an async function that flushes and closes the OPFS sync handle.
 * Call this before `useMoltenDbTerminate()` to avoid "No modification allowed" errors.
 * Must be used inside <MoltenDbProvider>.
 */
export function useMoltenDbClearOpfs(): () => Promise<void> {
  const { db } = useMoltenDbContext();
  return async () => {
    await db.clearOpfs();
  };
}

/** Returns a function that terminates the MoltenDb worker. Call after clearing OPFS storage. Must be used inside <MoltenDbProvider>. */
export function useMoltenDbTerminate(): () => void {
  const { db } = useMoltenDbContext();
  return () => db.terminate();
}

/**
 * Hook to subscribe to real-time MoltenDb mutation events.
 * The callback is called whenever any document in the database changes.
 * Must be used inside <MoltenDbProvider>.
 *
 * The listener does not need to be memoized — the hook uses a ref internally
 * so the subscription is never torn down and re-created just because the
 * caller passed a new function reference on a re-render.
 */
export function useMoltenDbEvents(listener: (event: DbEvent) => void): void {
  const { db, isReady } = useMoltenDbContext();
  const listenerRef = useRef(listener);
  listenerRef.current = listener;
  useEffect(() => {
    if (!isReady) return;
    return db.subscribe((evt) => listenerRef.current(evt));
  }, [db, isReady]);
}
