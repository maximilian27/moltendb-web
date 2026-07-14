export interface MoltenDbOptions {
  /** URL or path to moltendb-worker.js. */
  workerUrl?: string | URL;

  /** Password for at-rest encryption. If not provided, data is stored as plain JSON. */
  encryptionKey?: string;

  /** Storage write mode: 'async' (default, high throughput) or 'sync' (durable). */
  writeMode?: "async" | "sync";

  /**  Maximum request body size in bytes. */
  maxBodySize?: number;

  /** Maximum number of keys allowed per JSON request. Default: 1000. */
  maxKeysPerRequest?: number;

  /**
   * Run entirely in RAM — no OPFS writes.
   *
   * All tabs share a single in-memory store via the leader/follower election.
   * Data persists as long as at least one tab is open.
   * The shared RAM store is wiped only when **all** tabs are closed — a single tab
   * refreshing will not wipe the data.
   *
   * Default: false.
   */
  inMemory?: boolean;
}

export interface DbEvent {
  type: "event";
  event: "change" | "delete" | "drop" | "kill" | "ttl_expiry";
  collection: string;
  key: string;
  new_v: number | null;
}

export class MoltenDb {
  readonly dbName: string;
  readonly workerUrl?: string | URL;
  readonly options: MoltenDbOptions;
  worker: Worker | null = null;
  /** True when OPFS was unavailable and MoltenDb automatically fell back to in-memory mode. */
  public isInMemoryFallback: boolean = false;
  // Multi-tab Sync State
  isLeader: boolean = false;
  /** Legacy global hook. Use `subscribe()` for multi-component listeners. */
  public onEvent?: (event: DbEvent) => void;
  private initPromise: Promise<void> | null = null;
  private pendingRequests = new Map<
    string,
    { resolve: Function; reject: Function }
  >();
  private bc!: BroadcastChannel;
  // ── Multi-Subscriber Event System ──────────────────────────────────────────
  private eventListeners = new Set<(event: DbEvent) => void>();

  constructor(dbName = "moltendb", options: MoltenDbOptions = {}) {
    this.dbName = dbName;
    this.workerUrl = options.workerUrl;
    this.options = options;
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

  /**
   * Set up the Web Locks-based cleanup for in-memory mode.
   * Each tab holds a shared lock while alive. On beforeunload, the tab releases
   * its lock and tries to acquire an exclusive lock — which only succeeds when it
   * is the last tab. Only then is a clear_all signal broadcast to wipe the store.
   *
   * Called either when inMemory is explicitly set (at init time) or after the
   * OPFS-unavailable fallback sets inMemory = true inside startAsLeader.
   */
  private setupInMemoryTabLock(): void {
    navigator.locks.request(
      `moltendb_tabs_${this.dbName}`,
      { mode: "shared" },
      () =>
        new Promise<void>((resolveTab) => {
          window.addEventListener("beforeunload", () => {
            resolveTab();
            // After this tab releases the shared lock, try to acquire an exclusive lock.
            // This succeeds only when no other tab holds the shared lock (i.e. last tab).
            navigator.locks.request(
              `moltendb_tabs_${this.dbName}`,
              { mode: "exclusive", ifAvailable: true },
              (exclusiveLock) => {
                if (exclusiveLock) {
                  try {
                    this.bc?.postMessage({ type: "clear_all" });
                  } catch {}
                }
                return Promise.resolve();
              }
            );
          });
        })
    );
  }

  init(): Promise<void> {
    // 1. If initialization has already started or finished, return the existing promise
    if (this.initPromise) return this.initPromise;

    // 2. Start the initialization and store the promise
    this.initPromise = new Promise<void>((resolveInit, rejectInit) => {
      this.bc = new BroadcastChannel(`moltendb_channel_${this.dbName}`);

      navigator.locks.request(
        `moltendb_lock_${this.dbName}`,
        { ifAvailable: true },
        async (lock) => {
          if (lock) {
            try {
              await this.startAsLeader();
              // Set up in-memory tab-lock cleanup after startAsLeader, because an OPFS
              // fallback inside startAsLeader may have set inMemory = true at that point.
              if (this.options.inMemory) {
                this.setupInMemoryTabLock();
              }
              resolveInit();
            } catch (err) {
              rejectInit(err as Error);
            }
            return new Promise(() => {}); // Hold lock
          } else {
            this.startAsFollower();
            // For followers, inMemory was already set by the user option (no fallback needed
            // here — the leader is the one that checks OPFS and may set the fallback flag).
            if (this.options.inMemory) {
              this.setupInMemoryTabLock();
            }
            resolveInit();

            // Wait in the background to become leader if the current leader dies
            navigator.locks.request(
              `moltendb_lock_${this.dbName}`,
              async () => {
                console.log(`[MoltenDb] Promoting this tab to Leader.`);
                await this.startAsLeader();
                return new Promise(() => {}); // Hold lock
              }
            );
          }
        }
      );
    });

    return this.initPromise;
  }
  // ───────────────────────────────────────────────────────────────────────────

  async sendMessage(
    action: string,
    payload?: Record<string, unknown>
  ): Promise<any> {
    //  Wait for the engine to boot before routing the message.
    // If the DB is already initialized, this resolves instantly.
    if (action !== "init") {
      if (this.initPromise) {
        await this.initPromise;
      } else {
        throw new Error(
          "[MoltenDb] You must call db.init() before querying the database."
        );
      }
    }

    // 2. Generate a unique ID
    const id =
      typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : Math.random().toString(36).substring(2, 9);

    return new Promise((resolve, reject) => {
      // 3. We are now GUARANTEED that isLeader, worker, and bc are accurately set
      if (this.isLeader && this.worker) {
        this.pendingRequests.set(id, { resolve, reject });
        this.worker.postMessage({ id, action, ...payload });
      } else {
        // Follower routing via BroadcastChannel
        const timer = setTimeout(() => {
          if (this.pendingRequests.has(id)) {
            this.pendingRequests.delete(id);
            reject(
              new Error(`[MoltenDb] Request "${action}" timed out after 10s.`)
            );
          }
        }, 10000);

        this.pendingRequests.set(id, {
          resolve: (res: any) => {
            clearTimeout(timer);
            resolve(res);
          },
          reject: (e: any) => {
            clearTimeout(timer);
            reject(e);
          },
        });

        this.bc.postMessage({ type: "query", id, action, payload });
      }
    });
  } // ── Convenience CRUD helpers ───────────────────────────────────────────────

  async set(collection: string, key: string, value: any): Promise<void> {
    await this.sendMessage("set", { collection, data: { [key]: value } });
  }

  async get(collection: string, key: string): Promise<unknown> {
    try {
      return await this.sendMessage("get", { collection, keys: key });
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
      const result = await this.sendMessage("get", { collection });
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
    await this.sendMessage("delete", { collection, keys: key });
  }

  compact(): Promise<unknown> {
    return this.sendMessage("compact");
  }

  /**
   * Truncate and close the OPFS file handle, then remove the OPFS directory.
   *
   * Works from any tab — followers automatically route the `clear_opfs` message
   * through the leader via BroadcastChannel, so the leader worker (which holds
   * the exclusive FileSystemSyncAccessHandle) is the one that actually closes
   * the file before the directory is removed.
   *
   * After this resolves, call the `terminate` method and `location.reload()` if needed or re-initialize the database.
   */
  async clearOpfs(): Promise<void> {
    // 1. Tell Rust to flush, truncate, and CLOSE the FileSystemSyncAccessHandle.
    //    Without this, removeEntry() throws "No modification allowed".
    await this.sendMessage("clear_opfs");

    // 2. Remove the OPFS directory — the handle is now closed, so this succeeds.
    const root = await navigator.storage.getDirectory();
    await root.removeEntry(this.dbName, { recursive: true });

    // 3. Hit the Kill Switch for all other tabs
    this.bc?.postMessage({ type: "kill_signal" });
  }

  disconnect() {
    if (this.bc) this.bc.close();
  }

  /** Terminates the MoltenDb worker. Call after clearing OPFS storage. */
  terminate() {
    this.disconnect();
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
    this.initPromise = null;
    this.isLeader = false;
  }

  private dispatchEvent(event: DbEvent) {
    // Fire all subscribed component handlers
    for (const listener of this.eventListeners) {
      try {
        listener(event);
      } catch (err) {
        console.error("[MoltenDb] Error in subscribed listener", err);
      }
    }
  }

  private async startAsLeader() {
    // Guard: OPFS is required unless running in-memory
    if (!this.options.inMemory) {
      try {
        await navigator.storage.getDirectory();
      } catch {
        console.warn(
          "[MoltenDb] Origin Private File System (OPFS) is not available in this browser context " +
            "(e.g. private/incognito window, unsupported browser, or cross-origin iframe). " +
            "Falling back to in-memory mode — data will not be persisted across sessions. " +
            "To suppress this warning, set { inMemory: true } explicitly."
        );
        this.options.inMemory = true;
        this.isInMemoryFallback = true;
      }
    }

    this.isLeader = true;
    if (this.worker) this.worker.terminate();

    const url =
      this.workerUrl || new URL("./moltendb-worker.js", import.meta.url);
    this.worker = new Worker(url, {
      type: "module",
      name: `moltendb-${this.dbName}-leader`,
    });

    this.worker.onmessage = (e) => {
      const data = e.data;

      if (data.type === "event") {
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
    await this.sendMessage("init", {
      dbName: this.dbName,
      encryptionKey: this.options.encryptionKey,
      inMemory: this.options.inMemory,
      maxBodySize: this.options.maxBodySize,
      maxKeysPerRequest: this.options.maxKeysPerRequest,
      writeMode: this.options.writeMode,
    });

    this.bc.onmessage = async (e) => {
      const msg = e.data;

      // --- THE KILL SWITCH ---
      if (msg.type === "kill_signal") {
        this.terminate(); // Kills zombie worker instantly
        this.dispatchEvent({
          type: "event",
          event: "kill",
          collection: "*",
          key: "*",
          new_v: null,
        });
        return;
      }
      // Any tab unloading in in-memory mode broadcasts this — wipe the shared RAM store.
      if (msg.type === "clear_all") {
        try {
          await this.sendMessage("clear", {});
          this.bc.postMessage({ type: "cleared" });
          console.log("[MoltenDb] In-memory store wiped (tab unloaded).");
        } catch (err) {
          console.warn("[MoltenDb] Failed to clear in-memory store:", err);
        }
        return;
      }

      if (msg.type === "query" && msg.action) {
        try {
          const result = await this.sendMessage(msg.action, msg.payload);
          this.bc.postMessage({ type: "response", id: msg.id, result });
        } catch (err: any) {
          this.bc.postMessage({
            type: "response",
            id: msg.id,
            error: err.message,
          });
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
      // --- THE KILKILL SWITCH ---
      if (data.type === "kill_signal") {
        this.terminate(); // Kills zombie worker instantly
        this.dispatchEvent({
          type: "event",
          event: "kill",
          collection: "*",
          key: "*",
          new_v: null,
        });
        return;
      }
      if (data.type === "event") {
        this.dispatchEvent(data); // ⬅️ Trigger new dispatcher
        return;
      }
      // In-memory wipe notification from leader — reject all in-flight requests.
      if (data.type === "cleared") {
        console.log("[MoltenDb] In-memory store was wiped by another tab.");
        for (const [id, req] of this.pendingRequests) {
          req.reject(
            new Error("[MoltenDb] In-memory store was cleared by a tab reload.")
          );
          this.pendingRequests.delete(id);
        }
        return;
      }
      if (data.type === "response") {
        const req = this.pendingRequests.get(data.id);
        if (req) {
          if (data.error) req.reject(new Error(data.error));
          else req.resolve(data.result);
          this.pendingRequests.delete(data.id);
        }
      }
    };
  }
}
