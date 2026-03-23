export class MoltenDB {
    dbName;
    workerUrl;
    worker = null;
    messageId = 0;
    pendingRequests = new Map();
    // Multi-tab Sync State
    isLeader = false;
    bc;
    // Server Sync State
    syncEnabled;
    serverUrl;
    syncIntervalMs;
    authToken;
    ws = null;
    syncCallbacks = [];
    syncQueue = [];
    syncTimer = null;
    /** ⚡ Hook to listen to native real-time DB mutations (works on all tabs) */
    onEvent;
    constructor(dbName = 'moltendb', options = {}) {
        this.dbName = dbName;
        this.workerUrl = options.workerUrl;
        this.syncEnabled = options.syncEnabled ?? false;
        this.serverUrl = options.serverUrl ?? 'wss://localhost:3000/ws';
        this.syncIntervalMs = options.syncIntervalMs ?? 5000;
        this.authToken = options.authToken;
    }
    async init() {
        this.bc = new BroadcastChannel(`moltendb_channel_${this.dbName}`);
        return new Promise((resolveInit) => {
            // 1. Try to grab the lock immediately (Leader Election)
            navigator.locks.request(`moltendb_lock_${this.dbName}`, { ifAvailable: true }, async (lock) => {
                if (lock) {
                    // We got the lock! We are the active DB host.
                    await this.startAsLeader();
                    resolveInit();
                    // Return a promise that never resolves to hold the lock until the tab closes
                    return new Promise(() => { });
                }
                else {
                    // Lock is taken. We are a proxy follower.
                    this.startAsFollower();
                    resolveInit();
                    // 2. Queue up in the background. If the Leader tab closes, this lock resolves!
                    navigator.locks.request(`moltendb_lock_${this.dbName}`, async (fallbackLock) => {
                        console.log(`[MoltenDB] Previous leader disconnected. Promoting this tab to Leader.`);
                        await this.startAsLeader();
                        return new Promise(() => { }); // Hold lock
                    });
                }
            });
        });
    }
    async startAsLeader() {
        this.isLeader = true;
        if (this.worker)
            this.worker.terminate(); // Clean slate if promoted
        // We must inline `new URL` directly inside `new Worker` so bundlers catch it!
        if (this.workerUrl) {
            this.worker = new Worker(this.workerUrl, { type: 'module', name: `moltendb-${this.dbName}-leader` });
        }
        else {
            this.worker = new Worker(new URL('./moltendb-worker.js', import.meta.url), { type: 'module', name: `moltendb-${this.dbName}-leader` });
        }
        // Handle messages strictly from our local Worker
        this.worker.onmessage = (e) => {
            const data = e.data;
            if (data.type === 'event') {
                // Trigger local UI hook
                if (this.onEvent)
                    this.onEvent(data);
                // Broadcast the native event to all Follower tabs
                this.bc.postMessage(data);
                return;
            }
            // Resolve pending local promises
            const req = this.pendingRequests.get(data.id);
            if (req) {
                if (data.error)
                    req.reject(new Error(data.error));
                else
                    req.resolve(data.result);
                this.pendingRequests.delete(data.id);
            }
        };
        // Initialize the WASM Engine
        await new Promise((resolve, reject) => {
            const id = this.messageId++;
            this.pendingRequests.set(id, { resolve, reject });
            this.worker.postMessage({ id, action: 'init', dbName: this.dbName });
        });
        // Listen to the BroadcastChannel for queries coming from Follower tabs
        this.bc.onmessage = async (e) => {
            const msg = e.data;
            if (msg.type === 'query' && msg.action) {
                try {
                    const result = await this.sendMessage(msg.action, msg.payload);
                    this.bc.postMessage({ type: 'response', id: msg.id, result });
                }
                catch (err) {
                    this.bc.postMessage({ type: 'response', id: msg.id, error: err.message });
                }
            }
        };
        // If backend sync is enabled, only the Leader manages the WebSocket
        if (this.syncEnabled) {
            this.startSync();
        }
    }
    startAsFollower() {
        this.isLeader = false;
        // We don't need a worker, we rely on the Leader.
        if (this.worker) {
            this.worker.terminate();
            this.worker = null;
        }
        // Listen to the BroadcastChannel for answers from the Leader
        this.bc.onmessage = (e) => {
            const data = e.data;
            if (data.type === 'event') {
                // Trigger local UI hook as if it happened in this tab
                if (this.onEvent)
                    this.onEvent(data);
                return;
            }
            if (data.type === 'response') {
                // Resolve our proxied promises
                const req = this.pendingRequests.get(data.id);
                if (req) {
                    if (data.error)
                        req.reject(new Error(data.error));
                    else
                        req.resolve(data.result);
                    this.pendingRequests.delete(data.id);
                }
            }
        };
    }
    async sendMessage(action, payload) {
        const id = this.messageId++;
        return new Promise((resolve, reject) => {
            this.pendingRequests.set(id, { resolve, reject });
            if (this.isLeader && this.worker) {
                // Direct execution on the local Worker
                this.worker.postMessage({ id, action, ...payload });
            }
            else {
                // Proxy the request to the Leader tab
                this.bc.postMessage({ type: 'query', id, action, payload });
            }
        });
    }
    // ── Convenience CRUD helpers ──────────────────────────────────────────────
    async set(collection, key, value, options = {}) {
        await this.sendMessage('set', { collection, data: { [key]: value } });
        if (this.syncEnabled && !options.skipSync && this.isLeader) {
            this.syncQueue.push({ action: 'set', collection, data: { [key]: value } });
        }
    }
    get(collection, key) {
        return this.sendMessage('get', { collection, keys: key });
    }
    getAll(collection) {
        return this.sendMessage('get', { collection });
    }
    async delete(collection, key, options = {}) {
        await this.sendMessage('delete', { collection, keys: key });
        if (this.syncEnabled && !options.skipSync && this.isLeader) {
            this.syncQueue.push({ action: 'delete', collection, keys: key });
        }
    }
    compact() {
        return this.sendMessage('compact');
    }
    // ── Server Sync Implementation (Leader Only) ──────────────────────────────
    startSync() {
        this.ws = new WebSocket(this.serverUrl);
        this.ws.onopen = () => {
            if (this.authToken) {
                this.ws?.send(JSON.stringify({ type: 'auth', token: this.authToken }));
            }
        };
        this.ws.onmessage = (e) => {
            try {
                const msg = JSON.parse(e.data);
                if (msg.event) {
                    for (const cb of this.syncCallbacks)
                        cb(msg);
                }
            }
            catch (err) { }
        };
        this.syncTimer = setInterval(async () => {
            if (!this.ws || this.ws.readyState !== WebSocket.OPEN)
                return;
            if (this.syncQueue.length === 0)
                return;
            const batch = this.syncQueue.splice(0, this.syncQueue.length);
            this.ws.send(JSON.stringify({ type: 'batch', operations: batch }));
        }, this.syncIntervalMs);
    }
    onSyncEvent(callback) {
        this.syncCallbacks.push(callback);
    }
    disconnect() {
        if (this.syncTimer)
            clearInterval(this.syncTimer);
        if (this.ws)
            this.ws.close();
        if (this.bc)
            this.bc.close();
    }
    terminate() {
        this.disconnect();
        if (this.worker)
            this.worker.terminate();
    }
}
