# @moltendb-web/core

## 1.8.0

### Minor Changes

- 864bb59: Remove hotThreshold property from the core. This affects all packages and is a breaking change

## 1.7.0

### Minor Changes

- 3715d68: @moltendb-web/react v1.6.0 — New React hooks wrapper for MoltenDb (MoltenDbProvider, useMoltenDb, useMoltenDbResource, useMoltenDbReady, useMoltenDbIsLeader, useMoltenDbTerminate, useMoltenDbEvents). Supports React 16.8+. Core and query packages install automatically as dependencies.
  @moltendb-web/angular — Added moltenDbReady(), moltenDbIsLeader(), moltenDbTerminate(), moltenDbEvents() and re-exported DbEvent type for full API parity with the React package.

## 1.6.0

### Minor Changes

- 5698865: ### Minor Changes

  - **Added `inMemory` option** — run the database entirely in RAM with no OPFS writes. All tabs share a single in-memory store via the leader/follower election; data persists as long as at least one tab is open. When **any** tab refreshes or closes, the shared RAM store is wiped for all tabs. Ideal for ephemeral session caches, testing, and scenarios where persistence is not required.
  - **Added `maxKeysPerRequest` option** — sets the maximum number of keys allowed per JSON request (default: `1000`). Mirrors the server-side `--max-keys-per-request` flag and the `max_keys_per_request` field in `DbConfig`.

  ### Breaking Changes

  - **Removed `rateLimitRequests` and `rateLimitWindow` options** — these were server-only properties (HTTP rate limiting) that had no effect in the browser context and were incorrectly exposed in the web package. If you were setting these values, you can safely remove them — they were no-ops in the WASM layer.

## 1.5.1

### Patch Changes

- 5866389: sync core engine

## 1.5.0

### Minor Changes

- c087ed6: `@moltendb-web/core` to expose `hotThreshold`, `encryptionKey`, `writeMode`, `rateLimitRequests`, `rateLimitWindow`, and `maxBodySize` options

## 1.4.2

### Patch Changes

- 598ca0b: replace depracted new worker db constructor with create

## 1.4.1

### Patch Changes

- 74cb3c7: Update angular package readme to reflect latest setup

## 1.4.0

### Minor Changes

- 81fd537: The way the rust binary is compiled was changed significantly in the core server repo. Update the naming conventions to match the latest distribution

## 1.3.0

### Minor Changes

- a7a43e5: Allow case insensite searches

## 1.2.0

## 1.1.2

### Patch Changes

- 4dc09c8: Enhance docs, describe state manangement usability

## 1.1.1

## 1.1.0
