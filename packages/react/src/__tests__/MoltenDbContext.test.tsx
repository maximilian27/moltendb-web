import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { render, waitFor } from "@testing-library/react";
import { MoltenDbProvider, useMoltenDbContext } from "../MoltenDbContext";
import { useMoltenDb } from "../useMoltenDb";
import { installMocks, uninstallMocks } from "./mocks";

describe("MoltenDbProvider (Browser)", () => {
  beforeEach(() => {
    installMocks();
  });

  afterEach(() => {
    uninstallMocks();
  });

  it("boots the real engine and exposes a working client/db", async () => {
    let capturedClient: ReturnType<typeof useMoltenDb> | undefined;
    let capturedIsReady: boolean | undefined;

    function Consumer() {
      capturedClient = useMoltenDb();
      capturedIsReady = useMoltenDbContext().isReady;
      return null;
    }

    render(
      <MoltenDbProvider config={{ name: "test-db", inMemory: true }}>
        <Consumer />
      </MoltenDbProvider>
    );

    await waitFor(() => {
      expect(capturedIsReady).toBe(true);
    });

    expect(capturedClient).toBeDefined();

    await expect(
      capturedClient!.collection("x").get().exec()
    ).resolves.not.toBeInstanceOf(Error);
  });

  it("exposes a populated db instance via the context", async () => {
    let capturedDb: ReturnType<typeof useMoltenDbContext>["db"] | undefined;
    let capturedIsReady: boolean | undefined;

    function Consumer() {
      const ctx = useMoltenDbContext();
      capturedDb = ctx.db;
      capturedIsReady = ctx.isReady;
      return null;
    }

    render(
      <MoltenDbProvider config={{ name: "test-db", inMemory: true }}>
        <Consumer />
      </MoltenDbProvider>
    );

    await waitFor(() => {
      expect(capturedIsReady).toBe(true);
    });

    expect(capturedDb).toBeDefined();
    expect(capturedDb!.isLeader).toBe(true);
  });
});
