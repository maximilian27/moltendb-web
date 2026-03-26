import init, { WorkerDb } from './moltendb.js';
let db = null;
let initPromise = null;
self.onmessage = async (e) => {
    const { id, action, ...payload } = e.data;
    // --- 1. Initialization Phase ---
    if (action === 'init') {
        if (!initPromise) {
            initPromise = (async () => {
                await init();
                // FIX: You must await the async constructor
                const instance = await new WorkerDb(payload.dbName);
                // Listen to Rust and broadcast events
                instance.subscribe((eventStr) => {
                    try {
                        const eventData = JSON.parse(eventStr);
                        self.postMessage({ type: 'event', ...eventData });
                    }
                    catch (err) {
                        console.error('[MoltenDB Worker] Event parse error', err);
                    }
                });
                db = instance;
                return instance;
            })();
        }
        try {
            await initPromise;
            self.postMessage({ id, result: { status: 'ok' } });
        }
        catch (error) {
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
        if (!initPromise)
            throw new Error("Worker not initialized");
        const currentDb = await initPromise;
        const result = currentDb.handle_message({ action, ...payload });
        self.postMessage({ id, result });
    }
    catch (error) {
        // FIX: Handle Map-based errors here too
        const errorMsg = (error instanceof Map)
            ? JSON.stringify(Object.fromEntries(error))
            : String(error);
        self.postMessage({ id, error: errorMsg });
    }
};
