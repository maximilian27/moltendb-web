import init, { WorkerDb } from './moltendb.js';

let db;

self.onmessage = async (e) => {
    const { id, action, ...payload } = e.data;

    // --- Initialization Phase ---
    if (action === 'init') {
        try {
            await init(payload.workerUrl);
            db = await new WorkerDb(payload.dbName);

            // THE NATIVE FEED: Listen to Rust and broadcast to the main thread
            db.subscribe((eventStr) => {
                try {
                    const eventData = JSON.parse(eventStr);
                    // Use type: 'event' so the transport knows it's an unsolicited broadcast
                    self.postMessage({ type: 'event', ...eventData });
                } catch (err) {
                    console.error("[MoltenDB Worker] Failed to parse event", err);
                }
            });

            self.postMessage({ id, result: { status: 'ok' } });
        } catch (error) {
            self.postMessage({ id, error: String(error) });
        }
        return;
    }

    // --- Standard Request/Response Phase ---
    try {
        const result = db.handle_message({ action, ...payload });
        self.postMessage({ id, result });
    } catch (error) {
        self.postMessage({ id, error: String(error) });
    }
};