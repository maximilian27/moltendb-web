import {mapToObj} from "./helpers";

export interface MoltenDbOptions {
  /** URL or path to moltendb-worker.js. */
  workerUrl?: string | URL;
}

export interface DbEvent {
  type: 'event';
  event: 'change' | 'delete' | 'drop';
  collection: string;
  key: string;
  new_v: number | null;
}

export class MoltenDb {
  readonly dbName: string;
  readonly workerUrl?: string | URL;
  worker: Worker | null = null;
  private initPromise: Promise<void> | null = null;

  private pendingRequests = new Map<string, { resolve: Function; reject: Function }>();

  // Multi-tab Sync State
  isLeader: boolean = false;
  private bc!: BroadcastChannel;

  /** Legacy global hook. Use `subscribe()` for multi-component listeners. */
  public onEvent?: (event: DbEvent) => void;

  // ── Multi-Subscriber Event System ──────────────────────────────────────────
  private eventListeners = new Set<(event: DbEvent) => void>();

  constructor(dbName = 'moltendb', options: MoltenDbOptions = {}) {
    this.dbName = dbName;
    this.workerUrl = options.workerUrl;
  }

  /**
   * ⚡ Subscribe to real-time DB mutations.
   * @returns An unsubscribe function to prevent memory leaks in UI frameworks.
   */
  subscribe(listener: (event: DbEvent) => void): () => void {
    this.eventListeners.add(listener);
    return () => this.eventListeners.delete(listener);
  }

  /** Manually remove a specific listener */
  unsubscribe(listener: (event: DbEvent) => void): void {
    this.eventListeners.delete(listener);
  }

  private dispatchEvent(event: DbEvent) {
    // Fire all subscribed component handlers
    for (const listener of this.eventListeners) {
      try {
        listener(event);
      } catch (err) {
        console.error('[MoltenDb] Error in subscribed listener', err);
      }
    }
  }
  // ───────────────────────────────────────────────────────────────────────────

  init(): Promise<void> {
    // 1. If initialization has already started or finished, return the existing promise
    if (this.initPromise) return this.initPromise;

    // 2. Otherwise, start the initialization and store the promise
    this.initPromise = new Promise<void>((resolveInit, rejectInit) => {
      this.bc = new BroadcastChannel(`moltendb_channel_${this.dbName}`);

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

          // Wait in the background to become leader if the current leader dies
          navigator.locks.request(`moltendb_lock_${this.dbName}`, async () => {
            console.log(`[MoltenDb] Promoting this tab to Leader.`);
            await this.startAsLeader();
            return new Promise(() => {}); // Hold lock
          });
        }
      });
    });

    return this.initPromise;
  }

  private async startAsLeader() {
    // Guard: OPFS is required
    try {
      await navigator.storage.getDirectory();
    } catch {
      throw new Error(
          '[MoltenDb] Origin Private File System (OPFS) is not available in this browser context. ' +
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
        this.dispatchEvent(data); // ⬅️ Trigger new dispatcher
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
        this.dispatchEvent(data); // ⬅️ Trigger new dispatcher
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
    //  Wait for the engine to boot before routing the message.
    // If the DB is already initialized, this resolves instantly.
    if (action !== 'init') {
      if (this.initPromise) {
        await this.initPromise;
      } else {
        throw new Error('[MoltenDb] You must call db.init() before querying the database.');
      }
    }

    // 2. Generate a unique ID
    const id = (typeof crypto !== 'undefined' && crypto.randomUUID)
        ? crypto.randomUUID()
        : Math.random().toString(36).substring(2, 9);

    return new Promise((resolve, reject) => {
      const successHandler = (res: any) => resolve(mapToObj(res));

      // 3. We are now GUARANTEED that isLeader, worker, and bc are accurately set
      if (this.isLeader && this.worker) {
        this.pendingRequests.set(id, { resolve: successHandler, reject });
        this.worker.postMessage({ id, action, ...payload });
      } else {
        // Follower routing via BroadcastChannel
        const timer = setTimeout(() => {
          if (this.pendingRequests.has(id)) {
            this.pendingRequests.delete(id);
            reject(new Error(`[MoltenDb] Request "${action}" timed out after 10s.`));
          }
        }, 10000);

        this.pendingRequests.set(id, {
          resolve: (res: any) => { clearTimeout(timer); successHandler(res); },
          reject: (e: any) => { clearTimeout(timer); reject(e); }
        });

        this.bc.postMessage({ type: 'query', id, action, payload });
      }
    });
  }  // ── Convenience CRUD helpers ───────────────────────────────────────────────

  async set(collection: string, key: string, value: any): Promise<void> {
    await this.sendMessage('set', {collection, data: {[key]: value}});
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

  async delete(collection: string, key: string): Promise<void> {
    await this.sendMessage('delete', {collection, keys: key});
  }

  compact(): Promise<unknown> {
    return this.sendMessage('compact');
  }

  disconnect() {
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