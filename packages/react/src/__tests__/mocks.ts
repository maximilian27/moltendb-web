import { vi } from "vitest";

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
      if (fn === this._boundDispatch) continue;
      fn(new MessageEvent("message", { data }));
    }
  }

  close(): void {
    bcBus.get(this.name)?.delete(this._boundDispatch);
  }
}

export function resetBCBus(): void {
  bcBus.clear();
}

// ─── Fake Worker ──────────────────────────────────────────────────────────────

export class FakeWorker {
  onmessage: ((e: MessageEvent) => void) | null = null;
  onerror: ((e: ErrorEvent) => void) | null = null;
  terminated = false;

  postMessage(data: unknown): void {
    if (this.terminated) return;
    const msg = data as Record<string, unknown>;
    const { id, action } = msg;

    Promise.resolve().then(() => {
      if (this.terminated) return;
      if (action === "init") {
        this.onmessage?.(
          new MessageEvent("message", { data: { id, result: { status: "ok" } } })
        );
      } else {
        this.onmessage?.(new MessageEvent("message", { data: { id, result: null } }));
      }
    });
  }

  terminate(): void {
    this.terminated = true;
  }
}

// ─── navigator.locks mock ─────────────────────────────────────────────────────

type LockCallback = (lock: any | null) => Promise<unknown>;

export const fakeLocks = {
  request(
    name: string,
    optionsOrCallback: any | LockCallback,
    maybeCallback?: LockCallback
  ): Promise<unknown> {
    let callback: LockCallback;
    if (typeof optionsOrCallback === "function") {
      callback = optionsOrCallback;
    } else {
      callback = maybeCallback!;
    }
    return callback({ name });
  },
};

// ─── Install / uninstall globals ──────────────────────────────────────────────

let originalNavigatorDescriptor: PropertyDescriptor | undefined;

export function installMocks(): void {
  const FakeWorkerCtor = class {
    constructor() {
      return new FakeWorker();
    }
  } as unknown as typeof Worker;

  const fakeNavigator = {
    locks: fakeLocks,
    storage: { getDirectory: () => Promise.resolve({}) },
  };

  // `happy-dom` already defines `Worker`/`navigator` on `globalThis`, and
  // `vi.stubGlobal` doesn't reliably override an already-defined accessor
  // property (e.g. `navigator` on `happy-dom`'s `window`), so assign directly
  // to `globalThis` as well to guarantee the fakes take effect.
  vi.stubGlobal("Worker", FakeWorkerCtor);
  vi.stubGlobal("BroadcastChannel", FakeBroadcastChannel);
  vi.stubGlobal("navigator", fakeNavigator);

  originalNavigatorDescriptor = Object.getOwnPropertyDescriptor(
    globalThis,
    "navigator"
  );
  (globalThis as any).Worker = FakeWorkerCtor;
  (globalThis as any).BroadcastChannel = FakeBroadcastChannel;
  Object.defineProperty(globalThis, "navigator", {
    value: fakeNavigator,
    writable: true,
    configurable: true,
  });
}

export function uninstallMocks(): void {
  vi.unstubAllGlobals();
  if (originalNavigatorDescriptor) {
    Object.defineProperty(globalThis, "navigator", originalNavigatorDescriptor);
    originalNavigatorDescriptor = undefined;
  }
  resetBCBus();
}
