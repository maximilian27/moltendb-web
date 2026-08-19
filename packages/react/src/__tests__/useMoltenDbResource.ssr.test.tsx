// @vitest-environment node
import { describe, it, expect } from "vitest";
import { renderToString } from "react-dom/server";
import { MoltenDbProvider } from "../MoltenDbContext";
import {
  useMoltenDbResource,
  MoltenDbResourceResult,
} from "../useMoltenDbResource";

describe("useMoltenDbResource (Server / SSR)", () => {
  it("resolves synchronously to isLoading:false, error:null, value:undefined with no options", () => {
    let captured: MoltenDbResourceResult<unknown> | undefined;

    function Consumer() {
      captured = useMoltenDbResource("greetings", async (col) =>
        col.get().exec()
      );
      return null;
    }

    renderToString(
      <MoltenDbProvider config={{ name: "test-db" }}>
        <Consumer />
      </MoltenDbProvider>
    );

    expect(captured).toBeDefined();
    expect(captured!.isLoading).toBe(false);
    expect(captured!.error).toBe(null);
    expect(captured!.value).toBeUndefined();
  });

  it("honors initialValue and returns it synchronously instead of undefined", () => {
    let captured: MoltenDbResourceResult<unknown[]> | undefined;

    function Consumer() {
      captured = useMoltenDbResource<unknown[]>(
        "greetings",
        async (col) => (await col.get().exec()) as unknown[],
        { initialValue: [] }
      );
      return null;
    }

    renderToString(
      <MoltenDbProvider config={{ name: "test-db" }}>
        <Consumer />
      </MoltenDbProvider>
    );

    expect(captured).toBeDefined();
    expect(captured!.isLoading).toBe(false);
    expect(captured!.error).toBe(null);
    expect(captured!.value).toEqual([]);
  });
});
