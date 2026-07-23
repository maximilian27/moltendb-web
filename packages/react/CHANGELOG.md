# @moltendb-web/react

## 2.3.0

### Minor Changes

- a9ea23a: bulk deletes without filer and fix wasm ttl issue

### Patch Changes

- Updated dependencies [a9ea23a]
  - @moltendb-web/query@2.3.0
  - @moltendb-web/core@2.3.0

## 2.2.0

### Minor Changes

- d848097: perf: remove object serialization overhead

### Patch Changes

- Updated dependencies [d848097]
  - @moltendb-web/core@2.2.0
  - @moltendb-web/query@2.2.0

## 2.1.0

### Minor Changes

- 1c519ca: perf: wasm module improvements

### Patch Changes

- Updated dependencies [1c519ca]
  - @moltendb-web/core@2.1.0
  - @moltendb-web/query@2.1.0

## 2.0.0

### Perf ( Core Engine )

- **`Arc<str>` collection-key interning** — the outer `DashMap` key was changed from `String` to `Arc<str>`. During bulk
  insert and WAL replay all documents in the same collection share a single pointer instead of allocating a new `String`
  per document. Saves ~30 B per doc (~30 MB at 1 M docs) and reduces allocator pressure during startup.
- **MessagePack in-memory storage** — the hot document map was switched from `serde_json::Value` to `Box<[u8]>` (
  MessagePack bytes). Reduces steady-state RSS for 1 M docs from ~4 GB to ~500 MB (~8× lower). Decoding to `Value`
  happens lazily on read; write paths encode via `rmp_serde`.
-

### Major Changes

- **Bulk Delete with `.where()`** — delete documents matching a filter clause without listing individual keys.
- **Capped Collections (`.maxSize()`)** — cap a collection to a maximum number of documents; oldest entries are evicted
  automatically when the limit is reached.
- **TTL Collections (`.ttl()`)** — set a time-to-live (in seconds) on a collection; documents are removed automatically
  after expiry.

### Patch Changes

- Updated dependencies [1ff51f5]
  - @moltendb-web/query@2.0.0
  - @moltendb-web/core@2.0.0

## 1.8.0

### Minor Changes

- 864bb59: Remove hotThreshold property from the core. This affects all packages and is a breaking change

### Patch Changes

- Updated dependencies [864bb59]
  - @moltendb-web/core@1.8.0
  - @moltendb-web/query@1.8.0

## 1.7.0

### Minor Changes

- 3715d68: @moltendb-web/react v1.6.0 — New React hooks wrapper for MoltenDb (MoltenDbProvider, useMoltenDb,
  useMoltenDbResource, useMoltenDbReady, useMoltenDbIsLeader, useMoltenDbTerminate, useMoltenDbEvents). Supports React
  16.8+. Core and query packages install automatically as dependencies.
  @moltendb-web/angular — Added moltenDbReady(), moltenDbIsLeader(), moltenDbTerminate(), moltenDbEvents() and
  re-exported DbEvent type for full API parity with the React package.

### Patch Changes

- Updated dependencies [3715d68]
  - @moltendb-web/core@1.7.0
  - @moltendb-web/query@1.7.0
