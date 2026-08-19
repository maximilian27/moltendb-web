import React, {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { MoltenDb, MoltenDbOptions } from "@moltendb-web/core";
import { MoltenDbClient, MoltenTransport } from "@moltendb-web/query";

export interface ReactMoltenDbOptions extends MoltenDbOptions {
  name: string;
}

/**
 * `true` when running in a browser (a `window` exists), `false` in a
 * server/SSR context (Node, Next.js/Remix server rendering, etc). Computed
 * once at module load since the runtime environment never changes mid-process.
 */
const isBrowser = typeof window !== "undefined";

/**
 * Thrown by the server-side stubs whenever code tries to actually reach the
 * MoltenDb engine while running outside the browser (SSR / prerendering).
 */
export const MOLTEN_SSR_ERROR_MESSAGE =
  "[MoltenDb] MoltenDb is not available in a server-side rendering context.";

/**
 * Stand-in for `MoltenDb` used when running outside the browser (SSR / prerendering).
 * It never touches WASM, OPFS, or the Web Locks API. `init()` resolves immediately
 * and `clearOpfs()` is a no-op — there is nothing to boot or clear on the server.
 */
class ServerMoltenDb extends MoltenDb {
  override init(): Promise<void> {
    return Promise.resolve();
  }

  override sendMessage(): Promise<never> {
    return Promise.reject(new Error(MOLTEN_SSR_ERROR_MESSAGE));
  }

  override async clearOpfs(): Promise<void> {
    // No OPFS storage exists on the server — nothing to clear.
  }
}

/**
 * Stand-in transport used when running outside the browser (SSR / prerendering).
 * Query builder chains (`.collection().set()`, `.get()`, `.delete()`, ...) keep
 * working synchronously — only the terminal `.exec()` call rejects, with a clear,
 * actionable error instead of hanging forever.
 */
class ServerTransport implements MoltenTransport {
  sendMessage(): Promise<never> {
    return Promise.reject(new Error(MOLTEN_SSR_ERROR_MESSAGE));
  }
}

export interface MoltenDbContextValue {
  db: MoltenDb;
  client: MoltenDbClient;
  // @internal — not part of the public API. No `useMoltenDbReady()`-style hook
  // (or any other public getter) should ever be added to expose this. Stays
  // `false` forever on the server, which is what makes `useMoltenDbResource()`
  // skip fetching there with no changes needed on its "don't fetch" path.
  isReady: boolean;
}

export const MoltenDbContext = createContext<MoltenDbContextValue | null>(null);

export interface MoltenDbProviderProps {
  config: ReactMoltenDbOptions;
  children: React.ReactNode;
}

export function MoltenDbProvider({ config, children }: MoltenDbProviderProps) {
  const [isReady, setIsReady] = useState(false);

  // Use refs so the db/client instances are stable across renders
  const dbRef = useRef<MoltenDb | null>(null);
  const clientRef = useRef<MoltenDbClient | null>(null);

  if (!dbRef.current) {
    if (isBrowser) {
      dbRef.current = new MoltenDb(config.name, config);
      clientRef.current = new MoltenDbClient(dbRef.current);
    } else {
      // Server: never construct the real engine — no WASM, no OPFS, no Web Locks.
      dbRef.current = new ServerMoltenDb(config.name, config);
      clientRef.current = new MoltenDbClient(new ServerTransport());
    }
  }

  useEffect(() => {
    if (!isBrowser) return;

    dbRef
      .current!.init()
      .then(() => setIsReady(true))
      .catch((err) => console.error("[MoltenDb] Failed to initialize", err));
  }, []);

  return (
    <MoltenDbContext.Provider
      value={{
        db: dbRef.current,
        client: clientRef.current!,
        isReady,
      }}
    >
      {children}
    </MoltenDbContext.Provider>
  );
}

export function useMoltenDbContext(): MoltenDbContextValue {
  const ctx = useContext(MoltenDbContext);
  if (!ctx) {
    throw new Error(
      "[MoltenDb] useMoltenDbContext must be used inside <MoltenDbProvider>"
    );
  }
  return ctx;
}
