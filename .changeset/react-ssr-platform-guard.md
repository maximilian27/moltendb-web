---
"@moltendb-web/react": minor
---

feat: SSR-safe platform guard for `MoltenDbProvider`, plus an `initialValue` option for `useMoltenDbResource()`.

- `MoltenDbProvider` now detects server vs. browser (`typeof window === 'undefined'`) and never boots WASM, OPFS, or the Web Locks API on the server. On the server, `db`/`client` are lightweight no-op stubs with the same public shape as the real implementations — no extra `?.` needed.
- On the server, the client's builder chains (`.collection().set()`, `.get()`, `.delete()`, ...) keep working synchronously, but the terminal `.exec()` rejects with a clear error: `"[MoltenDb] MoltenDb is not available in a server-side rendering context."` — no hang.
- On the server, `useMoltenDbResource()` resolves synchronously to a documented empty state (`isLoading` false, `error` null, `value` at `options?.initialValue`/`undefined`) instead of staying in perpetual loading.
- `useMoltenDbResource(collection, queryFn, { initialValue })` seeds `value` with `initialValue` instead of always defaulting to `undefined`, both as the pre-fetch value in the browser and as the permanent server-side value.
- The internal readiness flag remains a private implementation detail — the previously-existing `useMoltenDbReady()` export has been removed (it exposed internal state that was never meant to be public); no replacement readiness hook was added.
