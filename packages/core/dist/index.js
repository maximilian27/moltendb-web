export class MoltenDB {
    dbName;
    workerUrl;
    worker = null;
    pendingRequests = new Map();
    // Multi-tab Sync State
    isLeader = false;
    bc;
    /** Legacy global hook. Use `subscribe()` for multi-component listeners. */
    onEvent;
    // ── Multi-Subscriber Event System ──────────────────────────────────────────
    eventListeners = new Set();
    constructor(dbName = 'moltendb', options = {}) {
        this.dbName = dbName;
        this.workerUrl = options.workerUrl;
    }
    /**
     * ⚡ Subscribe to real-time DB mutations.
     * @returns An unsubscribe function to prevent memory leaks in UI frameworks.
     */
    subscribe(listener) {
        this.eventListeners.add(listener);
        return () => this.eventListeners.delete(listener);
    }
    /** Manually remove a specific listener */
    unsubscribe(listener) {
        this.eventListeners.delete(listener);
    }
    dispatchEvent(event) {
        // Fire all subscribed component handlers
        for (const listener of this.eventListeners) {
            try {
                listener(event);
            }
            catch (err) {
                console.error('[MoltenDB] Error in subscribed listener', err);
            }
        }
    }
    // ───────────────────────────────────────────────────────────────────────────
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
                this.dispatchEvent(data); // ⬅️ Trigger new dispatcher
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
                this.dispatchEvent(data); // ⬅️ Trigger new dispatcher
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
    // ── Convenience CRUD helpers ───────────────────────────────────────────────
    async set(collection, key, value) {
        await this.sendMessage('set', { collection, data: { [key]: value } });
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
    async delete(collection, key) {
        await this.sendMessage('delete', { collection, keys: key });
    }
    compact() {
        return this.sendMessage('compact');
    }
    disconnect() {
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
