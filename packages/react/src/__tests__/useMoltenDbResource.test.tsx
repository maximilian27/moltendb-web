import type { ReactNode } from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { MoltenDbProvider } from "../MoltenDbContext";
import { useMoltenDbResource } from "../useMoltenDbResource";
import { installMocks, uninstallMocks } from "./mocks";

const wrapper = ({ children }: { children: ReactNode }) => (
  <MoltenDbProvider config={{ name: "test-db", inMemory: true }}>
    {children}
  </MoltenDbProvider>
);

describe("useMoltenDbResource (Browser)", () => {
  beforeEach(() => {
    installMocks();
  });

  afterEach(() => {
    uninstallMocks();
  });

  it("fetches data once ready, with no initialValue", async () => {
    const queryFn = vi.fn().mockResolvedValue([{ id: "1", text: "Hello" }]);

    const { result } = renderHook(
      () => useMoltenDbResource("greetings", queryFn),
      { wrapper }
    );

    // Before the fetch resolves, value should be at its (undefined) default.
    expect(result.current.value).toBeUndefined();
    expect(result.current.error).toBe(null);

    await waitFor(() => {
      expect(result.current.value).toEqual([{ id: "1", text: "Hello" }]);
    });

    expect(queryFn).toHaveBeenCalled();
    expect(result.current.isLoading).toBe(false);
    expect(result.current.error).toBe(null);
  });

  it("starts at initialValue synchronously, then gets overwritten once the fetch resolves", async () => {
    const queryFn = vi.fn().mockResolvedValue([{ id: "1", text: "Hello" }]);

    const { result } = renderHook(
      () =>
        useMoltenDbResource("greetings", queryFn, {
          initialValue: [] as { id: string; text: string }[],
        }),
      { wrapper }
    );

    // Synchronously right after the initial render, before the effect's
    // fetch has had a chance to resolve.
    expect(result.current.value).toEqual([]);
    expect(result.current.error).toBe(null);

    await waitFor(() => {
      expect(result.current.value).toEqual([{ id: "1", text: "Hello" }]);
    });

    expect(queryFn).toHaveBeenCalled();
    expect(result.current.isLoading).toBe(false);
    expect(result.current.error).toBe(null);
  });
});
