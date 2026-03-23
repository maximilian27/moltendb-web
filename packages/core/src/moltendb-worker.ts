import init, { WorkerDb } from './moltendb.js';

let db: WorkerDb;

self.onmessage = async (e: MessageEvent) => {
  const { id, action, ...payload } = e.data as { id: number; action: string; [key: string]: unknown };

  // --- Initialization Phase ---
  if (action === 'init') {
    try {
      await init();
      db = await new WorkerDb(payload.dbName as string);

      // THE NATIVE FEED: Listen to Rust and broadcast to the main thread
      db.subscribe((eventStr: string) => {
        try {
          const eventData = JSON.parse(eventStr) as Record<string, unknown>;
          // Use type: 'event' so the transport knows it's an unsolicited broadcast
          self.postMessage({ type: 'event', ...eventData });
        } catch (err) {
          console.error('[MoltenDB Worker] Failed to parse event', err);
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
