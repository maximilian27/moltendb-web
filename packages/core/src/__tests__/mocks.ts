/**
 * Test helpers & mocks for MoltenDB unit tests.
 *
 * We cannot run a real WASM Worker in Vitest/happy-dom, so we replace the
 * three browser primitives that MoltenDB depends on:
 *
 *   • Worker              – fake message-passing with a controllable handler
 *   • BroadcastChannel    – in-process pub/sub bus shared across instances
 *   • navigator.locks     – synchronous lock simulation
 */

import { vi } from 'vitest';

// ─── In-process BroadcastChannel bus ─────────────────────────────────────────

type BCListener = (event: MessageEvent) => void;
const bcBus = new Map<string, Set<BCListener>>();

export class FakeBroadcastChannel {
  readonly name: string;
  onmessage: BCListener | null = null;

  private readonly _boundDispatch: BCListener;

  constructor(name: string) {
    this.name = name;
    this._boundDispatch = (event: MessageEvent) => this.onmessage?.(event);
    if (!bcBus.has(name)) bcBus.set(name, new Set());
    bcBus.get(name)!.add(this._boundDispatch);
  }

  postMessage(data: unknown): void {
    const listeners = bcBus.get(this.name);
    if (!listeners) return;
    for (const fn of listeners) {
      // Skip self (mirrors real BroadcastChannel behaviour)
      if (fn === this._boundDispatch) continue;
      fn(new MessageEvent('message', { data }));
    }
  }

  close(): void {
    bcBus.get(this.name)?.delete(this._boundDispatch);
  }
}

/** Reset the shared bus between tests. */
export function resetBCBus(): void {
  bcBus.clear();
}

// ─── Fake Worker ──────────────────────────────────────────────────────────────

/**
 * A controllable fake Worker.
 *
 * By default it behaves like a healthy MoltenDB worker:
 *   - 'init'   → { status: 'ok' }
 *   - 'set'    → null
 *   - 'get'    → the value previously stored via 'set'
 *   - 'delete' → null
 *   - 'getAll' → all stored values
 *   - 'compact'→ null
 *
 * You can override `handler` to inject errors or custom responses.
 */
export class FakeWorker {
  onmessage: ((e: MessageEvent) => void) | null = null;
  onerror: ((e: ErrorEvent) => void) | null = null;
  terminated = false;

  private store = new Map<string, Map<string, unknown>>();

  /** Override to intercept / break specific messages. */
  handler: (msg: Record<string, unknown>) => unknown = (msg) =>
    this._defaultHandler(msg);

  postMessage(data: unknown): void {
    if (this.terminated) return;
    const msg = data as Record<string, unknown>;
    const { id, action } = msg;

    // Simulate async worker response
    Promise.resolve().then(() => {
      if (this.terminated) return;
      try {
        const result = this.handler(msg);
        this.onmessage?.(new MessageEvent('message', { data: { id, result } }));
      } catch (err) {
        this.onmessage?.(
          new MessageEvent('message', {
            data: { id, error: String(err) },
          }),
        );
      }
    });
  }

  terminate(): void {
    this.terminated = true;
  }

  private _defaultHandler(msg: Record<string, unknown>): unknown {
    const action = msg.action as string;
    const collection = msg.collection as string | undefined;

    if (action === 'init') return { status: 'ok' };

    if (action === 'set' && collection) {
      const data = msg.data as Record<string, unknown>;
      if (!this.store.has(collection)) this.store.set(collection, new Map());
      for (const [k, v] of Object.entries(data)) {
        this.store.get(collection)!.set(k, v);
      }
      return null;
    }

    if (action === 'get' && collection) {
      const col = this.store.get(collection);
      if (!col) return null;
      const keys = msg.keys as string | undefined;
      if (keys) return col.get(keys) ?? null;
      return Object.fromEntries(col);
    }

    if (action === 'delete' && collection) {
      const keys = msg.keys as string;
      this.store.get(collection)?.delete(keys);
      return null;
    }

    if (action === 'compact') return null;

    throw new Error(`[FakeWorker] Unknown action: ${action}`);
  }
}

// ─── navigator.locks mock ─────────────────────────────────────────────────────

type LockCallback = (lock: Lock | null) => Promise<unknown>;

interface FakeLockState {
  held: boolean;
  queuedCallbacks: LockCallback[];
}

const lockRegistry = new Map<string, FakeLockState>();

function getOrCreateLock(name: string): FakeLockState {
  if (!lockRegistry.has(name)) {
    lockRegistry.set(name, { held: false, queuedCallbacks: [] });
  }
  return lockRegistry.get(name)!;
}

/**
 * Simulates navigator.locks.request.
 *
 * - ifAvailable: true  → grants immediately if free, returns null if taken
 * - ifAvailable: false → queues the callback; call `releaseLock(name)` to
 *                        simulate the current holder releasing it
 */
export const fakeLocks = {
  request(
    name: string,
    optionsOrCallback: { ifAvailable?: boolean } | LockCallback,
    maybeCallback?: LockCallback,
  ): Promise<unknown> {
    let options: { ifAvailable?: boolean } = {};
    let callback: LockCallback;

    if (typeof optionsOrCallback === 'function') {
      callback = optionsOrCallback;
    } else {
      options = optionsOrCallback;
      callback = maybeCallback!;
    }

    const state = getOrCreateLock(name);

    if (options.ifAvailable) {
      if (!state.held) {
        state.held = true;
        return callback({ name } as Lock);
      } else {
        return callback(null);
      }
    }

    // Queued (blocking) request
    if (!state.held) {
      state.held = true;
      return callback({ name } as Lock);
    }

    return new Promise((resolve) => {
      state.queuedCallbacks.push(async (lock) => {
        resolve(await callback(lock));
      });
    });
  },
};

/** Simulate the current lock holder releasing the lock (e.g. tab closed). */
export function releaseLock(name: string): void {
  const state = lockRegistry.get(name);
  if (!state) return;
  const next = state.queuedCallbacks.shift();
  if (next) {
    next({ name } as Lock);
  } else {
    state.held = false;
  }
}

/** Reset all lock state between tests. */
export function resetLocks(): void {
  lockRegistry.clear();
}

// ─── Install / uninstall globals ──────────────────────────────────────────────

let workerFactory: (() => FakeWorker) | null = null;
const createdWorkers: FakeWorker[] = [];

/**
 * Call this in `beforeEach` to wire up all browser globals.
 * Pass an optional factory to control which FakeWorker is created.
 */
export function installMocks(factory?: () => FakeWorker): void {
  workerFactory = factory ?? (() => new FakeWorker());
  createdWorkers.length = 0;

  vi.stubGlobal(
    'Worker',
    class {
      constructor(_url: string | URL, _opts?: WorkerOptions) {
        const fake = workerFactory!();
        createdWorkers.push(fake);
        return fake;
      }
    },
  );

  vi.stubGlobal('BroadcastChannel', FakeBroadcastChannel);
  vi.stubGlobal('navigator', {
    locks: fakeLocks,
    storage: { getDirectory: () => Promise.resolve({}) },
  });
}

/** Call this in `afterEach`. */
export function uninstallMocks(): void {
  vi.unstubAllGlobals();
  resetBCBus();
  resetLocks();
  workerFactory = null;
  createdWorkers.length = 0;
}

/** Get the nth FakeWorker created since `installMocks`. */
export function getWorker(index = 0): FakeWorker {
  return createdWorkers[index];
}
