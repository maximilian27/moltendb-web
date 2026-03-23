/**
 * Type shim for the WASM-generated moltendb module.
 * The actual implementation files (moltendb.js, moltendb_bg.wasm, etc.)
 * are synced into dist/ by the GitHub Actions "Build WASM & Sync" workflow.
 */

export class WorkerDb {
  constructor(dbName: string);
  handle_message(msg: { action: string; [key: string]: unknown }): unknown;
  subscribe(callback: (eventStr: string) => void): void;
}

export default function init(wasmUrl?: string | URL): Promise<void>;
