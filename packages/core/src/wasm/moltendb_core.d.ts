/* tslint:disable */
/* eslint-disable */

/**
 * The WASM-exposed database handle used by the JavaScript Web Worker.
 *
 * `#[wasm_bindgen]` on the struct makes it visible to JavaScript.
 * JavaScript creates an instance with: `const db = await new WorkerDb("mydb")`
 *
 * The struct wraps a `Db` — the same engine used on the server.
 * All methods on this struct are thin adapters that:
 *   1. Convert JavaScript values (JsValue) to Rust types.
 *   2. Call the underlying Db methods.
 *   3. Convert the result back to JsValue for JavaScript.
 */
export class WorkerDb {
    private constructor();
    free(): void;
    [Symbol.dispose](): void;
    /**
     * Initialize the database and open (or create) the OPFS storage file.
     *
     * Called from JavaScript as:
     *   `const db = await WorkerDb.create("click_analytics_db", 50000, "my-secret-key")`
     *
     * A named static factory function is used instead of an async constructor
     * because `#[wasm_bindgen(constructor)]` with `async fn` produces invalid
     * TypeScript bindings and is deprecated in wasm-bindgen.
     *
     * `async` because opening the OPFS file handle is an async browser API.
     * Returns `Result<WorkerDb, JsValue>` — on error, the JsValue becomes a
     * JavaScript exception that the worker's try/catch can handle.
     *
     * # Arguments
     * * `db_name` — The name of the OPFS file to open (e.g. "click_analytics_db").
     *   Each unique name is a separate database file in the browser's OPFS storage.
     * * `encryption_key` — Optional password for at-rest encryption.
     * * `write_mode` — Optional write mode: "async" (default) or "sync".
     * * `max_body_size` — Optional maximum request body size in bytes (default: 10MB).
     * * `max_keys_per_request` — Optional maximum keys allowed per request (default: 1000).
     * * `in_memory` — Optional flag to run entirely in RAM with no OPFS writes (default: false).
     *   When `true`, all data is lost when the worker is terminated — useful for ephemeral
     *   session caches or testing without touching OPFS storage.
     */
    static create(db_name: string, encryption_key?: string | null, write_mode?: string | null, max_body_size?: number | null, max_keys_per_request?: number | null, in_memory?: boolean | null): Promise<WorkerDb>;
    /**
     * Route an incoming message from the JavaScript worker to the correct handler.
     *
     * Called from moltendb-worker.js as:
     *   `db.handle_message({ action: 'get', collection: 'laptops', keys: 'lp1' })`
     *
     * The `data` parameter is a plain JavaScript object (not a MessageEvent wrapper).
     * It must have an `action` field that determines which operation to perform.
     *
     * Supported actions — identical to the HTTP server endpoints:
     *   - "get"      → query documents (single key, batch, full collection, WHERE, joins, sort, pagination)
     *   - "set"      → insert or upsert documents: { collection, data: { key: doc, ... } }
     *   - "update"   → patch/merge documents:      { collection, data: { key: patch, ... } }
     *   - "delete"   → delete documents or drop:   { collection, keys: ... } or { drop: true }
     *   - "compact"  → compact the OPFS log file
     *   - "get_size" → return current OPFS file size in bytes
     *   - "clear"    → wipe all in-memory state (in-memory mode only)
     *
     * Returns a JsValue result on success, or a JsValue error string on failure.
     */
    handle_message(data: any): any;
    /**
     * Subscribe to real-time database changes.
     * The provided JavaScript function will be called with a JSON string
     * representing the mutation event.
     */
    subscribe(callback: Function): void;
}

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly __wbg_workerdb_free: (a: number, b: number) => void;
    readonly workerdb_create: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number) => number;
    readonly workerdb_handle_message: (a: number, b: number, c: number) => void;
    readonly workerdb_subscribe: (a: number, b: number) => void;
    readonly __wasm_bindgen_func_elem_3769: (a: number, b: number, c: number, d: number) => void;
    readonly __wasm_bindgen_func_elem_3781: (a: number, b: number, c: number, d: number) => void;
    readonly __wbindgen_export: (a: number, b: number) => number;
    readonly __wbindgen_export2: (a: number, b: number, c: number, d: number) => number;
    readonly __wbindgen_export3: (a: number) => void;
    readonly __wbindgen_export4: (a: number, b: number, c: number) => void;
    readonly __wbindgen_export5: (a: number, b: number) => void;
    readonly __wbindgen_add_to_stack_pointer: (a: number) => number;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;

/**
 * Instantiates the given `module`, which can either be bytes or
 * a precompiled `WebAssembly.Module`.
 *
 * @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
 *
 * @returns {InitOutput}
 */
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
 * If `module_or_path` is {RequestInfo} or {URL}, makes a request and
 * for everything else, calls `WebAssembly.instantiate` directly.
 *
 * @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
 *
 * @returns {Promise<InitOutput>}
 */
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
