export interface MoltenDBOptions {
  /** URL or path to moltendb-worker.js. */
  workerUrl?: string | URL;
  /** Enable WebSocket sync with a MoltenDB server. Default: false. */
  syncEnabled?: boolean;
  /** WebSocket server URL. Default: 'wss://localhost:1538/ws'. */
  serverUrl?: string;
  /** Sync batch flush interval in ms. Default: 5000. */
  syncIntervalMs?: number;
  /** JWT token for WebSocket authentication. */
  authToken?: string;
  /** Called whenever a DB mutation event is broadcast (all tabs). */
  onEvent?: (event: DBEvent) => void;
}

export type SyncCallback = (update: {
  event: 'change' | 'delete' | 'drop';
  collection: string;
  key: string;
  new_v: number | null;
}) => void;

export interface DBEvent {
  type: 'event';
  event: 'change' | 'delete' | 'drop';
  collection: string;
  key: string;
  new_v: number | null;
}

export class MoltenDB {
  readonly dbName: string;
  readonly workerUrl?: string | URL;
  worker: Worker | null = null;

  private pendingRequests = new Map<string, { resolve: Function; reject: Function }>();

  // Multi-tab Sync State
  isLeader: boolean = false;
  private bc!: BroadcastChannel;

  // Server Sync State
  private syncEnabled: boolean;
  private serverUrl: string;
  private syncIntervalMs: number;
  private authToken?: string;
  private ws: WebSocket | null = null;
  private syncCallbacks: SyncCallback[] = [];
  private syncQueue: any[] = [];
  private syncTimer: any = null;

  /** ⚡ Hook to listen to native real-time DB mutations (works on all tabs) */
  onEvent?: (event: DBEvent) => void;

  constructor(dbName = 'moltendb', options: MoltenDBOptions = {}) {
    this.dbName = dbName;
    this.workerUrl = options.workerUrl;
    this.syncEnabled = options.syncEnabled ?? false;
    this.serverUrl = options.serverUrl ?? 'wss://localhost:3000/ws';
    this.syncIntervalMs = options.syncIntervalMs ?? 5000;
    this.authToken = options.authToken;
    if (options.onEvent) this.onEvent = options.onEvent;
  }

  private initialized = false;

  async init(): Promise<void> {
    if (this.initialized) return;
    this.initialized = true;

    this.bc = new BroadcastChannel(`moltendb_channel_${this.dbName}`);

    return new Promise<void>((resolveInit, rejectInit) => {
      navigator.locks.request(`moltendb_lock_${this.dbName}`, {ifAvailable: true}, async (lock) => {
        if (lock) {
          try {
            await this.startAsLeader();
            resolveInit();
          } catch (err) {
            rejectInit(err as Error);
          }
          return new Promise(() => {}); // Hold lock
        } else {
          this.startAsFollower();
          resolveInit();

          navigator.locks.request(`moltendb_lock_${this.dbName}`, async () => {
            console.log(`[MoltenDB] Promoting this tab to Leader.`);
            await this.startAsLeader();
            return new Promise(() => {}); // Hold lock
          });
        }
      });
    });
  }

  private async startAsLeader() {
    // Guard: OPFS is required
    try {
      await navigator.storage.getDirectory();
    } catch {
      throw new Error(
        '[MoltenDB] Origin Private File System (OPFS) is not available in this browser context. ' +
        'Try a non-private window or a browser that supports OPFS (Chrome 102+, Firefox 111+, Safari 15.2+).'
      );
    }

    this.isLeader = true;
    if (this.worker) this.worker.terminate();

    const url = this.workerUrl || new URL('./moltendb-worker.js', import.meta.url);
    this.worker = new Worker(url, {type: 'module', name: `moltendb-${this.dbName}-leader`});

    this.worker.onmessage = (e) => {
      const data = e.data;
      if (data.type === 'event') {
        if (this.onEvent) this.onEvent(data);
        this.bc.postMessage(data);
        return;
      }

      const req = this.pendingRequests.get(data.id);
      if (req) {
        if (data.error) req.reject(new Error(data.error));
        else req.resolve(data.result);
        this.pendingRequests.delete(data.id);
      }
    };

    // Wait for worker to boot
    await this.sendMessage('init', { dbName: this.dbName });

    this.bc.onmessage = async (e) => {
      const msg = e.data;
      if (msg.type === 'query' && msg.action) {
        try {
          const result = await this.sendMessage(msg.action, msg.payload);
          this.bc.postMessage({type: 'response', id: msg.id, result});
        } catch (err: any) {
          this.bc.postMessage({type: 'response', id: msg.id, error: err.message});
        }
      }
    };

    if (this.syncEnabled) this.startSync();
  }

  private startAsFollower() {
    this.isLeader = false;
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }

    this.bc.onmessage = (e) => {
      const data = e.data;
      if (data.type === 'event') {
        if (this.onEvent) this.onEvent(data);
        return;
      }
      if (data.type === 'response') {
        const req = this.pendingRequests.get(data.id);
        if (req) {
          if (data.error) req.reject(new Error(data.error));
          else req.resolve(data.result);
          this.pendingRequests.delete(data.id);
        }
      }
    };
  }

  async sendMessage(action: string, payload?: Record<string, unknown>): Promise<any> {
    // FIX: Use random UUIDs so tabs don't collide on message IDs
    const id = crypto.randomUUID();

    return new Promise((resolve, reject) => {
      if (this.isLeader && this.worker) {
        this.pendingRequests.set(id, {resolve, reject});
        this.worker.postMessage({id, action, ...payload});
      } else {
        const timer = setTimeout(() => {
          if (this.pendingRequests.has(id)) {
            this.pendingRequests.delete(id);
            reject(new Error(`[MoltenDB] Request "${action}" timed out.`));
          }
        }, 10000);

        this.pendingRequests.set(id, {
          resolve: (v: any) => { clearTimeout(timer); resolve(v); },
          reject: (e: any) => { clearTimeout(timer); reject(e); }
        });

        this.bc.postMessage({type: 'query', id, action, payload});
      }
    });
  }

  // ── Convenience CRUD helpers (CLEANED - NO DUPLICATES) ─────────────────────

  async set(collection: string, key: string, value: any, options: { skipSync?: boolean } = {}): Promise<void> {
    await this.sendMessage('set', {collection, data: {[key]: value}});
    if (this.syncEnabled && !options.skipSync && this.isLeader) {
      this.syncQueue.push({action: 'set', collection, data: {[key]: value}});
    }
  }

  async get(collection: string, key: string): Promise<unknown> {
    try {
      return await this.sendMessage('get', { collection, keys: key });
    } catch (err: any) {
      try {
        const errorData = JSON.parse(err.message);
        if (errorData.statusCode === 404) return null;
      } catch {}
      throw err;
    }
  }

  async getAll(collection: string): Promise<unknown[]> {
    try {
      const result = await this.sendMessage('get', { collection });
      return (result as unknown[]) || [];
    } catch (err: any) {
      try {
        const errorData = JSON.parse(err.message);
        if (errorData.statusCode === 404) return [];
      } catch {}
      throw err;
    }
  }

  async delete(collection: string, key: string, options: { skipSync?: boolean } = {}): Promise<void> {
    await this.sendMessage('delete', {collection, keys: key});
    if (this.syncEnabled && !options.skipSync && this.isLeader) {
      this.syncQueue.push({action: 'delete', collection, keys: key});
    }
  }

  compact(): Promise<unknown> {
    return this.sendMessage('compact');
  }

  // ── Server Sync Implementation (Leader Only) ──────────────────────────────

  private startSync() {
    this.ws = new WebSocket(this.serverUrl);
    this.ws.onopen = () => {
      if (this.authToken) {
        this.ws?.send(JSON.stringify({type: 'auth', token: this.authToken}));
      }
    };

    this.ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);
        if (msg.event) {
          for (const cb of this.syncCallbacks) cb(msg);
        }
      } catch (err) {
      }
    };

    this.syncTimer = setInterval(async () => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
      if (this.syncQueue.length === 0) return;
      const batch = this.syncQueue.splice(0, this.syncQueue.length);
      this.ws.send(JSON.stringify({type: 'batch', operations: batch}));
    }, this.syncIntervalMs);
  }

  onSyncEvent(callback: SyncCallback) {
    this.syncCallbacks.push(callback);
  }

  disconnect() {
    if (this.syncTimer) clearInterval(this.syncTimer);
    if (this.ws) this.ws.close();
    if (this.bc) this.bc.close();
  }

  terminate() {
    this.disconnect();
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
  }
}