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
    free(): void;
    [Symbol.dispose](): void;
    /**
     * Execute an analytics query and return the result as a JSON string.
     *
     * This is the method called by the dashboard's auto-refresh loop:
     *   `const resultStr = db.analytics(JSON.stringify(query))`
     *
     * Takes a JSON string (not a JsValue) because the analytics query format
     * is complex and easier to pass as a pre-serialized string from JavaScript.
     *
     * Returns a JSON string (not a JsValue) so JavaScript can parse it with
     * `JSON.parse(resultStr)` and access `result` and `metadata`.
     *
     * Example input:
     *   `'{"collection":"events","metric":{"type":"COUNT"},"where":{"event_type":"button_click"}}'`
     *
     * Example output:
     *   `'{"result":42,"metadata":{"execution_time_ms":0,"rows_scanned":42}}'`
     *
     * `#[wasm_bindgen(js_name = analytics)]` sets the JavaScript method name to
     * "analytics" (matching the call in analytics-worker.js).
     */
    analytics(query_json: string): string;
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
     *
     * Returns a JsValue result on success, or a JsValue error string on failure.
     */
    handle_message(data: any): any;
    /**
     * Initialize the database and open (or create) the OPFS storage file.
     *
     * This is the constructor — called from JavaScript as:
     *   `const db = await new WorkerDb("click_analytics_db")`
     *
     * `#[wasm_bindgen(constructor)]` tells wasm-bindgen that this function
     * is the JavaScript `new WorkerDb(...)` constructor.
     *
     * `async` because opening the OPFS file handle is an async browser API.
     * Returns `Result<WorkerDb, JsValue>` — on error, the JsValue becomes a
     * JavaScript exception that the worker's try/catch can handle.
     *
     * # Arguments
     * * `db_name` — The name of the OPFS file to open (e.g. "click_analytics_db").
     *   Each unique name is a separate database file in the browser's OPFS storage.
     */
    constructor(db_name: string);
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
    readonly workerdb_analytics: (a: number, b: number, c: number, d: number) => void;
    readonly workerdb_handle_message: (a: number, b: number, c: number) => void;
    readonly workerdb_new: (a: number, b: number) => number;
    readonly workerdb_subscribe: (a: number, b: number) => void;
    readonly __wasm_bindgen_func_elem_3613: (a: number, b: number) => void;
    readonly __wasm_bindgen_func_elem_3697: (a: number, b: number, c: number, d: number) => void;
    readonly __wasm_bindgen_func_elem_3702: (a: number, b: number, c: number, d: number) => void;
    readonly __wbindgen_export: (a: number, b: number) => number;
    readonly __wbindgen_export2: (a: number, b: number, c: number, d: number) => number;
    readonly __wbindgen_export3: (a: number) => void;
    readonly __wbindgen_export4: (a: number, b: number, c: number) => void;
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
