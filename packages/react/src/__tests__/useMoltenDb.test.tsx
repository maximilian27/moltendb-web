import type { ReactNode } from "react";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import * as hookModule from "../useMoltenDb";
import * as indexModule from "../index";
import { useMoltenDb } from "../useMoltenDb";
import { MoltenDbProvider } from "../MoltenDbContext";
import { installMocks, uninstallMocks } from "./mocks";

describe("useMoltenDb", () => {
  it("does not export useMoltenDbReady from useMoltenDb.ts", () => {
    expect((hookModule as any).useMoltenDbReady).toBeUndefined();
  });

  it("does not export useMoltenDbReady from index.ts", () => {
    expect((indexModule as any).useMoltenDbReady).toBeUndefined();
  });

  describe("Browser", () => {
    beforeEach(() => {
      installMocks();
    });

    afterEach(() => {
      uninstallMocks();
    });

    it("returns a working MoltenDbClient once the engine is ready", async () => {
      const wrapper = ({ children }: { children: ReactNode }) => (
        <MoltenDbProvider config={{ name: "test-db", inMemory: true }}>
          {children}
        </MoltenDbProvider>
      );

      const { result } = renderHook(() => useMoltenDb(), { wrapper });

      expect(result.current).toBeDefined();

      await waitFor(async () => {
        await expect(
          result.current.collection("x").get().exec()
        ).resolves.not.toBeInstanceOf(Error);
      });
    });

    it("exposes the same client instance across re-renders", () => {
      let renders = 0;
      const wrapper = ({ children }: { children: ReactNode }) => {
        renders++;
        return (
          <MoltenDbProvider config={{ name: "test-db", inMemory: true }}>
            {children}
          </MoltenDbProvider>
        );
      };

      const { result, rerender } = renderHook(() => useMoltenDb(), {
        wrapper,
      });
      const first = result.current;
      rerender();
      expect(result.current).toBe(first);
      expect(renders).toBeGreaterThanOrEqual(2);
    });
  });
});
