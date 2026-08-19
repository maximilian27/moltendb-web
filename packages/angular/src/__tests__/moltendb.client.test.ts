import "@angular/compiler";
import { PLATFORM_ID, Injector, runInInjectionContext } from "@angular/core";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { moltendbClient } from "../lib/moltendb.client";
import { MoltenDbService, MOLTEN_SSR_ERROR_MESSAGE } from "../lib/moltendb.service";
import { MOLTEN_CONFIG } from "../lib/moltendb.provider";
import { installMocks, uninstallMocks } from "./mocks";
import * as clientModule from "../lib/moltendb.client";
import * as publicApi from "../public-api";

describe("moltendbClient", () => {
  describe("Server (SSR)", () => {
    let injector: Injector;

    beforeEach(() => {
      injector = Injector.create({
        providers: [
          { provide: PLATFORM_ID, useValue: "server" },
          { provide: MOLTEN_CONFIG, useValue: { name: "test-db" } },
          { provide: MoltenDbService, useClass: MoltenDbService },
        ],
      });
    });

    it("should reject all .exec() calls with SSR error message", async () => {
      await runInInjectionContext(injector, async () => {
        const client = moltendbClient();
        
        await expect(client.collection("x").set({ a: { foo: 1 } }).exec()).rejects.toThrow(MOLTEN_SSR_ERROR_MESSAGE);
        await expect(client.collection("x").get().exec()).rejects.toThrow(MOLTEN_SSR_ERROR_MESSAGE);
        await expect(client.collection("x").delete().keys("a").exec()).rejects.toThrow(MOLTEN_SSR_ERROR_MESSAGE);
      });
    });

    it("should not throw synchronously when building chains", () => {
      runInInjectionContext(injector, () => {
        const client = moltendbClient();
        expect(() => client.collection("x").set({ a: { foo: 1 } })).not.toThrow();
        expect(() => client.collection("x").get()).not.toThrow();
        expect(() => client.collection("x").delete().keys("a")).not.toThrow();
      });
    });
  });

  describe("Browser", () => {
    let injector: Injector;

    beforeEach(() => {
      installMocks();
      injector = Injector.create({
        providers: [
          { provide: PLATFORM_ID, useValue: "browser" },
          { provide: MOLTEN_CONFIG, useValue: { name: "test-db" } },
          { provide: MoltenDbService, useClass: MoltenDbService },
        ],
      });
    });

    afterEach(() => {
      uninstallMocks();
    });

    it("should work normally", async () => {
      await runInInjectionContext(injector, async () => {
        const client = moltendbClient();
        // Just verify it doesn't reject immediately with SSR error
        const promise = client.collection("x").get().exec();
        await expect(promise).resolves.toBeDefined();
      });
    });
  });

  it("should not export moltenDbReady", () => {
    expect((clientModule as any).moltenDbReady).toBeUndefined();
    expect((publicApi as any).moltenDbReady).toBeUndefined();
  });
});
