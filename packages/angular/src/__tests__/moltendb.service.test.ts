import "@angular/compiler";
import { inject, Injector, PLATFORM_ID, runInInjectionContext } from "@angular/core";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { MoltenDbService, MOLTEN_SSR_ERROR_MESSAGE } from "../lib/moltendb.service";
import { MOLTEN_CONFIG } from "../lib/moltendb.provider";
import { installMocks, uninstallMocks } from "./mocks";

describe("MoltenDbService", () => {
  describe("Server (SSR)", () => {
    let injector: Injector;

    beforeEach(() => {
      // Stub globals to ensure they are NOT called
      vi.stubGlobal("navigator", {
        locks: {
          request: vi.fn(() => {
            throw new Error("should not be called");
          }),
        },
        storage: {
          getDirectory: vi.fn(() => {
            throw new Error("should not be called");
          }),
        },
      });
      vi.stubGlobal("Worker", vi.fn(() => {
        throw new Error("should not be called");
      }));

      injector = Injector.create({
        providers: [
          { provide: PLATFORM_ID, useValue: "server" },
          { provide: MOLTEN_CONFIG, useValue: { name: "test-db" } },
          { provide: MoltenDbService, useClass: MoltenDbService },
        ],
      });
    });

    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it("should instantiate without touching browser APIs", () => {
      const service = runInInjectionContext(injector, () => inject(MoltenDbService));
      expect(service).toBeDefined();
      expect(service.db).toBeDefined();
      expect(service.client).toBeDefined();
      expect(service.isReady()).toBe(false);

      // Verify mocks weren't touched
      expect(navigator.locks.request).not.toHaveBeenCalled();
      expect(navigator.storage.getDirectory).not.toHaveBeenCalled();
      expect(Worker).not.toHaveBeenCalled();
    });

    it("should reject .exec() calls with SSR error message", async () => {
      const service = runInInjectionContext(injector, () => inject(MoltenDbService));
      
      const promise = service.client.collection("test").set({ foo: { bar: true } }).exec();
      await expect(promise).rejects.toThrow(MOLTEN_SSR_ERROR_MESSAGE);
    });

    it("should not throw synchronously when building query chains", () => {
      const service = runInInjectionContext(injector, () => inject(MoltenDbService));
      
      expect(() => {
        service.client.collection("test").get();
        service.client.collection("test").delete().keys("a");
      }).not.toThrow();
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

    it("should initialize correctly", async () => {
      const service = runInInjectionContext(injector, () => inject(MoltenDbService));
      
      // Wait for async init
      await new Promise(resolve => setTimeout(resolve, 50));
      
      expect(service.isReady()).toBe(true);
      expect(service.db).toBeDefined();
      expect(service.client).toBeDefined();
    });
  });
});
