import { inject, Injectable, PLATFORM_ID, signal } from "@angular/core";
import { isPlatformBrowser } from "@angular/common";
import { MoltenDb } from "@moltendb-web/core";
import { MoltenDbClient, MoltenTransport } from "@moltendb-web/query";
import { MOLTEN_CONFIG } from "./moltendb.provider";

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

@Injectable({ providedIn: "root" })
export class MoltenDbService {
  public db: MoltenDb;
  public client: MoltenDbClient;

  // Internal signal used by `moltenDbResource()` to know when WASM is booted and
  // Leader Election is done. @internal — not part of the public API: `MoltenDbService`
  // itself is never re-exported from `public-api.ts`, and no getter or standalone
  // `moltenDbReady()`-style function should ever be added to expose this signal.
  // Stays `false` forever on the server, which is what makes `moltenDbResource()`
  // skip fetching there with no changes needed on its "don't fetch" path.
  public isReady = signal<boolean>(false);

  constructor() {
    const config = inject(MOLTEN_CONFIG);
    const isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

    if (!isBrowser) {
      // Server: never construct the real engine — no WASM, no OPFS, no Web Locks.
      this.db = new ServerMoltenDb(config.name, config);
      this.client = new MoltenDbClient(new ServerTransport());
      return;
    }

    this.db = new MoltenDb(config.name, config);
    this.client = new MoltenDbClient(this.db);

    // Boot the engine and update the signal when done
    this.db
      .init()
      .then(() => {
        this.isReady.set(true);
      })
      .catch((err) => {
        console.error("[MoltenDb] Failed to initialize", err);
      });
  }
}
