import "@angular/compiler";
import { PLATFORM_ID, runInInjectionContext, Injector, inject } from "@angular/core";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { moltenDbResource } from "../lib/moltendb.resource";
import { MoltenDbService } from "../lib/moltendb.service";
import { MOLTEN_CONFIG } from "../lib/moltendb.provider";
import { installMocks, uninstallMocks } from "./mocks";

vi.mock("@angular/core", async (importOriginal) => {
  const original = await importOriginal<any>();
  return {
    ...original,
    effect: vi.fn().mockImplementation((cb: any) => {
      cb(() => {});
      return { destroy: () => {} };
    }),
  };
});

describe("moltenDbResource", () => {
  describe("Server (SSR)", () => {
    beforeEach(() => {
    });

    it("should return empty state synchronously and not trigger effects", () => {
      const consoleSpy = vi.spyOn(console, "error");

      const injector = Injector.create({
        providers: [
          { provide: PLATFORM_ID, useValue: "server" },
          { provide: MOLTEN_CONFIG, useValue: { name: "test-db" } },
          { provide: MoltenDbService, useClass: MoltenDbService },
        ],
      });

      const resource = runInInjectionContext(injector, () =>
        moltenDbResource("greetings", async (col) => col.get().exec())
      );

      expect(resource.isLoading()).toBe(false);
      expect(resource.error()).toBe(null);
      expect(resource.value()).toBeUndefined();

      expect(consoleSpy).not.toHaveBeenCalled();
    });

    it("should return the provided initialValue synchronously instead of undefined", () => {
      const injector = Injector.create({
        providers: [
          { provide: PLATFORM_ID, useValue: "server" },
          { provide: MOLTEN_CONFIG, useValue: { name: "test-db" } },
          { provide: MoltenDbService, useClass: MoltenDbService },
        ],
      });

      const resource = runInInjectionContext(injector, () =>
        moltenDbResource("greetings", async (col) => col.get().exec(), {
          initialValue: [] as { id: string; text: string }[],
        })
      );

      expect(resource.isLoading()).toBe(false);
      expect(resource.error()).toBe(null);
      expect(resource.value()).toEqual([]);
    });
  });

  describe("Browser", () => {
    beforeEach(() => {
      installMocks();
    });

    afterEach(() => {
      uninstallMocks();
    });

    it("should fetch data once ready", async () => {
      const queryFn = vi.fn().mockResolvedValue([{ id: "1", text: "Hello" }]);

      const injector = Injector.create({
        providers: [
          { provide: PLATFORM_ID, useValue: "browser" },
          { provide: MOLTEN_CONFIG, useValue: { name: "test-db" } },
          { provide: MoltenDbService, useClass: MoltenDbService },
        ],
      });

      let resource: any;
      runInInjectionContext(injector, () => {
        const service = inject(MoltenDbService);
        service.isReady.set(true); // Ensure it's ready so effect (mocked) runs fetchData

        resource = moltenDbResource("greetings", queryFn);
      });

      // Wait for fetchData
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(queryFn).toHaveBeenCalled();
      expect(resource.value()).toEqual([{ id: "1", text: "Hello" }]);
      expect(resource.isLoading()).toBe(false);
      expect(resource.error()).toBe(null);
    });

    it("should start at initialValue before the fetch resolves, and not call queryFn if never ready", () => {
      const queryFn = vi.fn().mockResolvedValue([{ id: "1", text: "Hello" }]);

      const injector = Injector.create({
        providers: [
          { provide: PLATFORM_ID, useValue: "browser" },
          { provide: MOLTEN_CONFIG, useValue: { name: "test-db" } },
          { provide: MoltenDbService, useClass: MoltenDbService },
        ],
      });

      // Deliberately never flip isReady() so `fetchData()` never runs — this
      // proves `initialValue` alone (not a fetch) seeds `value()`.
      const resource = runInInjectionContext(injector, () =>
        moltenDbResource("greetings", queryFn, { initialValue: [] })
      );

      expect(queryFn).not.toHaveBeenCalled();
      expect(resource.value()).toEqual([]);
      expect(resource.isLoading()).toBe(false);
      expect(resource.error()).toBe(null);
    });

    it("should overwrite initialValue once the first fetch resolves", async () => {
      const queryFn = vi.fn().mockResolvedValue([{ id: "1", text: "Hello" }]);

      const injector = Injector.create({
        providers: [
          { provide: PLATFORM_ID, useValue: "browser" },
          { provide: MOLTEN_CONFIG, useValue: { name: "test-db" } },
          { provide: MoltenDbService, useClass: MoltenDbService },
        ],
      });

      let resource: any;
      runInInjectionContext(injector, () => {
        const service = inject(MoltenDbService);
        service.isReady.set(true); // Ensure it's ready so effect (mocked) runs fetchData
        resource = moltenDbResource("greetings", queryFn, { initialValue: [] });
      });

      // Wait for fetchData
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(queryFn).toHaveBeenCalled();
      expect(resource.value()).toEqual([{ id: "1", text: "Hello" }]);
      expect(resource.isLoading()).toBe(false);
      expect(resource.error()).toBe(null);
    });
  });
});
