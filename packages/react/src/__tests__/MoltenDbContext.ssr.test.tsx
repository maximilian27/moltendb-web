// @vitest-environment node
import { describe, it, expect, vi } from "vitest";
import { renderToString } from "react-dom/server";
import { MoltenDbProvider, MOLTEN_SSR_ERROR_MESSAGE } from "../MoltenDbContext";
import { useMoltenDb } from "../useMoltenDb";

describe("MoltenDbProvider (Server / SSR)", () => {
  it("does not throw and provides a defined client via renderToString", () => {
    let captured: ReturnType<typeof useMoltenDb> | undefined;

    function Consumer() {
      captured = useMoltenDb();
      return null;
    }

    expect(() =>
      renderToString(
        <MoltenDbProvider config={{ name: "test-db" }}>
          <Consumer />
        </MoltenDbProvider>
      )
    ).not.toThrow();

    expect(captured).toBeDefined();
  });

  it("rejects .exec() calls with the documented SSR error message", async () => {
    let captured: ReturnType<typeof useMoltenDb> | undefined;

    function Consumer() {
      captured = useMoltenDb();
      return null;
    }

    renderToString(
      <MoltenDbProvider config={{ name: "test-db" }}>
        <Consumer />
      </MoltenDbProvider>
    );

    const client = captured!;

    await expect(
      client.collection("x").set({ a: { foo: 1 } }).exec()
    ).rejects.toThrow(MOLTEN_SSR_ERROR_MESSAGE);
    await expect(client.collection("x").get().exec()).rejects.toThrow(
      MOLTEN_SSR_ERROR_MESSAGE
    );
    await expect(
      client.collection("x").delete().keys("a").exec()
    ).rejects.toThrow(MOLTEN_SSR_ERROR_MESSAGE);
  });

  it("does not throw synchronously when building query chains", () => {
    let captured: ReturnType<typeof useMoltenDb> | undefined;

    function Consumer() {
      captured = useMoltenDb();
      return null;
    }

    renderToString(
      <MoltenDbProvider config={{ name: "test-db" }}>
        <Consumer />
      </MoltenDbProvider>
    );

    const client = captured!;

    expect(() => client.collection("x").set({ a: { foo: 1 } })).not.toThrow();
    expect(() => client.collection("x").get()).not.toThrow();
    expect(() => client.collection("x").delete().keys("a")).not.toThrow();
  });

  it("never touches navigator/Worker/BroadcastChannel on the server", () => {
    // A true `node` environment has no `window` at all.
    expect(typeof window).toBe("undefined");

    const workerSpy = vi.fn(() => {
      throw new Error("Worker should never be constructed on the server");
    });
    const bcSpy = vi.fn(() => {
      throw new Error(
        "BroadcastChannel should never be constructed on the server"
      );
    });
    (globalThis as any).Worker = workerSpy;
    (globalThis as any).BroadcastChannel = bcSpy;

    // Some Node versions ship a minimal `navigator` with a real Web Locks
    // implementation (unlike a genuine SSR/Node.js server without polyfills).
    // Spy on `.request` so we can assert the SSR stub path never calls it,
    // regardless of whether it happens to exist in this test runner.
    const originalNavigatorDescriptor = Object.getOwnPropertyDescriptor(
      globalThis,
      "navigator"
    );
    const originalNavigator = (globalThis as any).navigator;
    const locksRequestSpy = vi.fn(() => {
      throw new Error("navigator.locks.request should never be called on the server");
    });
    if (originalNavigator) {
      Object.defineProperty(globalThis, "navigator", {
        value: { ...originalNavigator, locks: { request: locksRequestSpy } },
        writable: true,
        configurable: true,
      });
    }

    let captured: ReturnType<typeof useMoltenDb> | undefined;
    function Consumer() {
      captured = useMoltenDb();
      return null;
    }

    expect(() =>
      renderToString(
        <MoltenDbProvider config={{ name: "test-db" }}>
          <Consumer />
        </MoltenDbProvider>
      )
    ).not.toThrow();

    expect(captured).toBeDefined();
    expect(workerSpy).not.toHaveBeenCalled();
    expect(bcSpy).not.toHaveBeenCalled();
    expect(locksRequestSpy).not.toHaveBeenCalled();

    delete (globalThis as any).Worker;
    delete (globalThis as any).BroadcastChannel;
    if (originalNavigatorDescriptor) {
      Object.defineProperty(globalThis, "navigator", originalNavigatorDescriptor);
    }
  });
});
