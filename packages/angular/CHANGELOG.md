# @moltendb-web/angular

## 1.6.0

### Minor Changes

- 5698865: ### Minor Changes

  - **Added `inMemory` option** — run the database entirely in RAM with no OPFS writes. All tabs share a single in-memory store via the leader/follower election; data persists as long as at least one tab is open. When **any** tab refreshes or closes, the shared RAM store is wiped for all tabs. Ideal for ephemeral session caches, testing, and scenarios where persistence is not required.
  - **Added `maxKeysPerRequest` option** — sets the maximum number of keys allowed per JSON request (default: `1000`). Mirrors the server-side `--max-keys-per-request` flag and the `max_keys_per_request` field in `DbConfig`.

  ### Breaking Changes

  - **Removed `rateLimitRequests` and `rateLimitWindow` options** — these were server-only properties (HTTP rate limiting) that had no effect in the browser context and were incorrectly exposed in the web package. If you were setting these values, you can safely remove them — they were no-ops in the WASM layer.

### Patch Changes

- Updated dependencies [5698865]
  - @moltendb-web/core@1.6.0
  - @moltendb-web/query@1.6.0

## 1.5.1

### Patch Changes

- 5866389: sync core engine
- Updated dependencies [5866389]
  - @moltendb-web/core@1.5.1
  - @moltendb-web/query@1.5.1

## 1.5.0

### Minor Changes

- c087ed6: `@moltendb-web/core` to expose `hotThreshold`, `encryptionKey`, `writeMode`, `rateLimitRequests`, `rateLimitWindow`, and `maxBodySize` options

### Patch Changes

- Updated dependencies [c087ed6]
  - @moltendb-web/core@1.5.0
  - @moltendb-web/query@1.5.0

## 1.4.2

### Patch Changes

- 598ca0b: replace depracted new worker db constructor with create
- Updated dependencies [598ca0b]
  - @moltendb-web/core@1.4.2
  - @moltendb-web/query@1.4.2

## 1.4.1

### Patch Changes

- 74cb3c7: Update angular package readme to reflect latest setup
- Updated dependencies [74cb3c7]
  - @moltendb-web/core@1.4.1
  - @moltendb-web/query@1.4.1

## 1.4.0

### Minor Changes

- 81fd537: The way the rust binary is compiled was changed significantly in the core server repo. Update the naming conventions to match the latest distribution

### Patch Changes

- Updated dependencies [81fd537]
  - @moltendb-web/core@1.4.0
  - @moltendb-web/query@1.4.0

## 1.3.0

### Minor Changes

- a7a43e5: Allow case insensite searches

### Patch Changes

- Updated dependencies [a7a43e5]
  - @moltendb-web/core@1.3.0
  - @moltendb-web/query@1.3.0

## 1.2.0

### Patch Changes

- Updated dependencies [7f71620]
  - @moltendb-web/query@1.2.0
  - @moltendb-web/core@1.2.0

## 1.1.2

### Patch Changes

- 4dc09c8: Enhance docs, describe state manangement usability
- Updated dependencies [4dc09c8]
  - @moltendb-web/core@1.1.2
  - @moltendb-web/query@1.1.2

## 1.1.1

### Patch Changes

- 7dcabd4: Update docs to better reflect the demos
  - @moltendb-web/core@1.1.1
  - @moltendb-web/query@1.1.1

## 1.1.0

### Minor Changes

- 0124968: Move core and query dependencies from peerDependencies for better DX

### Patch Changes

- @moltendb-web/core@1.1.0
- @moltendb-web/query@1.1.0
