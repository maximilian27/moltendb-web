---
"@moltendb-web/angular": minor
---

feat: SSR-safe platform guard for `MoltenDbService`, `moltendbClient()`, and `moltenDbResource()`.

- `MoltenDbService` now detects server vs. browser (`PLATFORM_ID` / `isPlatformBrowser`) and never boots WASM, OPFS, or the Web Locks API on the server. On the server, `db`/`client` are lightweight no-op stubs with the same public shape as the real implementations — no `?.` needed.
- On the server, `moltendbClient()`'s builder chains (`.collection().set()`, `.get()`, `.delete()`, ...) keep working synchronously, but the terminal `.exec()` rejects with a clear error: `"[MoltenDb] MoltenDb is not available in a server-side rendering context."` — no hang.
- On the server, `moltenDbResource()` resolves synchronously to a documented empty state (`isLoading()` false, `error()` null, `value()` undefined) instead of staying in perpetual loading.
- The internal `isReady` signal remains a private implementation detail — no public getter or standalone `moltenDbReady()` export was added; the previously-existing `moltenDbReady()` export has been removed (it was never meant to be public and caused `NG0203` when called from templates).
