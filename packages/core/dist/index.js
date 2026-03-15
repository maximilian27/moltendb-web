/**
 * MoltenDB main-thread client.
 *
 * Usage:
 *   import { MoltenDB } from 'moltendb-wasm';
 *
 *   const db = new MoltenDB('my-db', {
 *     // Required: URL or path to the moltendb-worker.js file.
 *     // With a bundler:  new URL('moltendb-wasm/worker', import.meta.url)
 *     // Plain script:    '/node_modules/moltendb-wasm/dist/moltendb-worker.js'
 *     workerUrl: new URL('moltendb-wasm/worker', import.meta.url),
 *   });
 *   await db.init();
 */
export class MoltenDB {
    /**
     * @param {string} dbName - OPFS file name (unique per database).
     * @param {object} [options]
     * @param {string|URL} [options.workerUrl] - URL to moltendb-worker.js.
     *   Defaults to './moltendb-worker.js' (works when served from the same directory).
     * @param {boolean} [options.syncEnabled=false] - Enable WebSocket sync.
     * @param {string}  [options.serverUrl='wss://localhost:3000/ws'] - WS server URL.
     * @param {number}  [options.syncIntervalMs=5000] - Sync batch flush interval.
     * @param {string}  [options.authToken] - JWT token for WS authentication.
     */
    constructor(dbName = 'moltendb', options = {}) {
        this.dbName         = dbName;
        this.workerUrl      = options.workerUrl ?? './moltendb-worker.js';
        this.worker         = null;
        this.messageId      = 0;
        this.pendingRequests = new Map();

        this.syncEnabled    = options.syncEnabled    ?? false;
        this.serverUrl      = options.serverUrl      ?? 'wss://localhost:3000/ws';
        this.syncIntervalMs = options.syncIntervalMs ?? 5000;
        this.authToken      = options.authToken      ?? null;

        this.ws             = null;
        this.syncCallbacks  = new Set();
        this.syncQueue      = [];
        this.syncTimer      = null;
    }

    /** Initialise the Web Worker and open the OPFS database. */
    async init() {
        return new Promise((resolve, reject) => {
            this.worker = new Worker(this.workerUrl, { type: 'module' });

            this.worker.onmessage = (event) => {
                const { id, result, error } = event.data;
                const pending = this.pendingRequests.get(id);
                if (!pending) return;
                this.pendingRequests.delete(id);
                if (error) pending.reject(new Error(error));
                else       pending.resolve(result);
            };

            this.worker.onerror = (err) => {
                console.error('[MoltenDB] Worker error:', err);
                reject(err);
            };

            this.sendMessage('init', { dbName: this.dbName })
                .then(() => this.syncEnabled ? this.connectSync() : undefined)
                .then(resolve)
                .catch(reject);
        });
    }

    /**
     * Send a raw message to the worker and return a Promise for the result.
     * @param {string} action
     * @param {object} [params]
     */
    sendMessage(action, params = {}) {
        return new Promise((resolve, reject) => {
            const id = this.messageId++;
            this.pendingRequests.set(id, { resolve, reject });
            this.worker.postMessage({ id, action, ...params });
        });
    }

    // ── WebSocket sync ────────────────────────────────────────────────────────

    connectSync() {
        return new Promise((resolve, reject) => {
            this.ws = new WebSocket(this.serverUrl);

            this.ws.onopen = () => {
                if (this.authToken) {
                    this.ws.send(JSON.stringify({ action: 'AUTH', token: this.authToken }));
                }
                if (this.syncTimer) clearInterval(this.syncTimer);
                this.syncTimer = setInterval(() => this.flushSyncQueue(), this.syncIntervalMs);
                resolve();
            };

            this.ws.onmessage = (event) => {
                try { this.handleServerUpdate(JSON.parse(event.data)); }
                catch (e) { console.error('[MoltenDB] Failed to parse server message:', e); }
            };

            this.ws.onclose = () => {
                if (this.syncTimer) clearInterval(this.syncTimer);
                setTimeout(() => this.connectSync(), 3000);
            };

            this.ws.onerror = (err) => reject(err);
        });
    }

    handleServerUpdate(update) {
        if (update.event === 'change' && update.collection && update.key) {
            // Re-fetch the updated document from the server and apply locally.
            // (The WS push only carries the key + new _v, not the full document.)
        }
        this.syncCallbacks.forEach(cb => cb(update));
    }

    /** Subscribe to real-time server push events. Returns an unsubscribe fn. */
    onSync(callback) {
        this.syncCallbacks.add(callback);
        return () => this.syncCallbacks.delete(callback);
    }

    flushSyncQueue() {
        if (!this.syncQueue.length || !this.ws || this.ws.readyState !== WebSocket.OPEN) return;
        const batch = this.syncQueue.splice(0);
        this.ws.send(JSON.stringify({ action: 'set', operations: batch }));
    }

    // ── Convenience CRUD helpers ──────────────────────────────────────────────

    /** Insert / upsert one document. */
    async set(collection, key, value, options = {}) {
        await this.sendMessage('set', { collection, data: { [key]: value } });
        if (this.syncEnabled && !options.skipSync) {
            this.syncQueue.push({ action: 'set', collection, data: { [key]: value } });
        }
    }

    /** Fetch a single document by key. */
    get(collection, key) {
        return this.sendMessage('get', { collection, keys: key });
    }

    /** Fetch all documents in a collection. */
    getAll(collection) {
        return this.sendMessage('get', { collection });
    }

    /** Delete a document by key. */
    async delete(collection, key, options = {}) {
        await this.sendMessage('delete', { collection, keys: key });
        if (this.syncEnabled && !options.skipSync) {
            this.syncQueue.push({ action: 'delete', collection, keys: key });
        }
    }

    /** Compact the OPFS log file. */
    compact() {
        return this.sendMessage('compact');
    }

    /** Close the WebSocket connection and stop the sync timer. */
    disconnect() {
        if (this.syncTimer) clearInterval(this.syncTimer);
        if (this.ws) this.ws.close();
    }

    /** Terminate the Web Worker (and disconnect sync). */
    terminate() {
        this.disconnect();
        if (this.worker) this.worker.terminate();
    }
}
