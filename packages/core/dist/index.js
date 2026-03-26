export class MoltenDB {
    dbName;
    workerUrl;
    worker = null;
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
        if (options.onEvent)
            this.onEvent = options.onEvent;
    }
    initialized = false;
    async init() {
        if (this.initialized)
            return;
        this.initialized = true;
        this.bc = new BroadcastChannel(`moltendb_channel_${this.dbName}`);
        return new Promise((resolveInit, rejectInit) => {
            navigator.locks.request(`moltendb_lock_${this.dbName}`, { ifAvailable: true }, async (lock) => {
                if (lock) {
                    try {
                        await this.startAsLeader();
                        resolveInit();
                    }
                    catch (err) {
                        rejectInit(err);
                    }
                    return new Promise(() => { }); // Hold lock
                }
                else {
                    this.startAsFollower();
                    resolveInit();
                    navigator.locks.request(`moltendb_lock_${this.dbName}`, async () => {
                        console.log(`[MoltenDB] Promoting this tab to Leader.`);
                        await this.startAsLeader();
                        return new Promise(() => { }); // Hold lock
                    });
                }
            });
        });
    }
    async startAsLeader() {
        // Guard: OPFS is required
        try {
            await navigator.storage.getDirectory();
        }
        catch {
            throw new Error('[MoltenDB] Origin Private File System (OPFS) is not available in this browser context. ' +
                'Try a non-private window or a browser that supports OPFS (Chrome 102+, Firefox 111+, Safari 15.2+).');
        }
        this.isLeader = true;
        if (this.worker)
            this.worker.terminate();
        const url = this.workerUrl || new URL('./moltendb-worker.js', import.meta.url);
        this.worker = new Worker(url, { type: 'module', name: `moltendb-${this.dbName}-leader` });
        this.worker.onmessage = (e) => {
            const data = e.data;
            if (data.type === 'event') {
                if (this.onEvent)
                    this.onEvent(data);
                this.bc.postMessage(data);
                return;
            }
            const req = this.pendingRequests.get(data.id);
            if (req) {
                if (data.error)
                    req.reject(new Error(data.error));
                else
                    req.resolve(data.result);
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
                    this.bc.postMessage({ type: 'response', id: msg.id, result });
                }
                catch (err) {
                    this.bc.postMessage({ type: 'response', id: msg.id, error: err.message });
                }
            }
        };
        if (this.syncEnabled)
            this.startSync();
    }
    startAsFollower() {
        this.isLeader = false;
        if (this.worker) {
            this.worker.terminate();
            this.worker = null;
        }
        this.bc.onmessage = (e) => {
            const data = e.data;
            if (data.type === 'event') {
                if (this.onEvent)
                    this.onEvent(data);
                return;
            }
            if (data.type === 'response') {
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
        // FIX: Use random UUIDs so tabs don't collide on message IDs
        const id = crypto.randomUUID();
        return new Promise((resolve, reject) => {
            if (this.isLeader && this.worker) {
                this.pendingRequests.set(id, { resolve, reject });
                this.worker.postMessage({ id, action, ...payload });
            }
            else {
                const timer = setTimeout(() => {
                    if (this.pendingRequests.has(id)) {
                        this.pendingRequests.delete(id);
                        reject(new Error(`[MoltenDB] Request "${action}" timed out.`));
                    }
                }, 10000);
                this.pendingRequests.set(id, {
                    resolve: (v) => { clearTimeout(timer); resolve(v); },
                    reject: (e) => { clearTimeout(timer); reject(e); }
                });
                this.bc.postMessage({ type: 'query', id, action, payload });
            }
        });
    }
    // ── Convenience CRUD helpers (CLEANED - NO DUPLICATES) ─────────────────────
    async set(collection, key, value, options = {}) {
        await this.sendMessage('set', { collection, data: { [key]: value } });
        if (this.syncEnabled && !options.skipSync && this.isLeader) {
            this.syncQueue.push({ action: 'set', collection, data: { [key]: value } });
        }
    }
    async get(collection, key) {
        try {
            return await this.sendMessage('get', { collection, keys: key });
        }
        catch (err) {
            try {
                const errorData = JSON.parse(err.message);
                if (errorData.statusCode === 404)
                    return null;
            }
            catch { }
            throw err;
        }
    }
    async getAll(collection) {
        try {
            const result = await this.sendMessage('get', { collection });
            return result || [];
        }
        catch (err) {
            try {
                const errorData = JSON.parse(err.message);
                if (errorData.statusCode === 404)
                    return [];
            }
            catch { }
            throw err;
        }
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
            catch (err) {
            }
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
        if (this.worker) {
            this.worker.terminate();
            this.worker = null;
        }
    }
}
