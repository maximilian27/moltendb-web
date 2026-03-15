export interface MoltenDBOptions {
  /** URL or path to moltendb-worker.js. Defaults to './moltendb-worker.js'. */
  workerUrl?: string | URL;
  /** Enable WebSocket sync with a MoltenDB server. Default: false. */
  syncEnabled?: boolean;
  /** WebSocket server URL. Default: 'wss://localhost:3000/ws'. */
  serverUrl?: string;
  /** Sync batch flush interval in ms. Default: 5000. */
  syncIntervalMs?: number;
  /** JWT token for WebSocket authentication. */
  authToken?: string;
}

export type SyncCallback = (update: {
  event: 'change' | 'delete' | 'drop';
  collection: string;
  key: string;
  new_v: number | null;
}) => void;

export class MoltenDB {
  readonly dbName: string;
  readonly worker: Worker | null;

  constructor(dbName?: string, options?: MoltenDBOptions);

  /** Initialise the Web Worker and open the OPFS database. */
  init(): Promise<void>;

  /** Send a raw message to the worker. */
  sendMessage(action: string, params?: Record<string, unknown>): Promise<unknown>;

  /** Insert / upsert one document. */
  set(collection: string, key: string, value: Record<string, unknown>, options?: { skipSync?: boolean }): Promise<void>;

  /** Fetch a single document by key. */
  get(collection: string, key: string): Promise<unknown>;

  /** Fetch all documents in a collection. */
  getAll(collection: string): Promise<unknown>;

  /** Delete a document by key. */
  delete(collection: string, key: string, options?: { skipSync?: boolean }): Promise<void>;

  /** Compact the OPFS log file. */
  compact(): Promise<unknown>;

  /** Subscribe to real-time server push events. Returns an unsubscribe function. */
  onSync(callback: SyncCallback): () => void;

  /** Close the WebSocket connection and stop the sync timer. */
  disconnect(): void;

  /** Terminate the Web Worker (and disconnect sync). */
  terminate(): void;
}
