import init, { WorkerDb } from './wasm/moltendb_core.js';

let db: WorkerDb | null = null;
let initPromise: Promise<WorkerDb> | null = null;

self.onmessage = async (e: MessageEvent) => {
  const { id, action, ...payload } = e.data;

  // --- 1. Initialization Phase ---
  if (action === 'init') {
    if (!initPromise) {
      initPromise = (async () => {
        await init();
        // Pass all config flags to Rust
        const instance = await WorkerDb.create(
            payload.dbName as string,
            payload.encryptionKey as string | undefined,
            payload.writeMode as string | undefined,
            payload.maxBodySize as number | undefined,
            payload.maxKeysPerRequest as number | undefined | null,
            payload.inMemory as boolean | undefined
        );
        // Listen to Rust and broadcast events
        instance.subscribe((eventStr: string) => {
          try {
            const eventData = JSON.parse(eventStr);
            self.postMessage({ type: 'event', ...eventData });
          } catch (err) {
            console.error('[MoltenDb Worker] Event parse error', err);
          }
        });

        db = instance;
        return instance;
      })();
    }

    try {
      await initPromise;
      self.postMessage({ id, result: { status: 'ok' } });
    } catch (error) {
      // FIX: Handle Map-based errors from Rust correctly
      const errorMsg = (error instanceof Map)
          ? JSON.stringify(Object.fromEntries(error))
          : String(error);
      self.postMessage({ id, error: errorMsg });
    }
    return;
  }

  // --- 2. Standard Request/Response Phase ---
  try {
    if (!initPromise) throw new Error("Worker not initialized");
    const currentDb = await initPromise;

    const result = currentDb.handle_message({ action, ...payload });
    self.postMessage({ id, result });
  } catch (error) {
    // FIX: Handle Map-based errors here too
    const errorMsg = (error instanceof Map)
        ? JSON.stringify(Object.fromEntries(error))
        : String(error);
    self.postMessage({ id, error: errorMsg });
  }
};