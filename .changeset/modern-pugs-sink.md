---
"@moltendb-web/angular": minor
"@moltendb-web/core": minor
"@moltendb-web/query": minor
---

### Minor Changes

- **Added `inMemory` option** — run the database entirely in RAM with no OPFS writes. All tabs share a single in-memory store via the leader/follower election; data persists as long as at least one tab is open. When **any** tab refreshes or closes, the shared RAM store is wiped for all tabs. Ideal for ephemeral session caches, testing, and scenarios where persistence is not required.
- **Added `maxKeysPerRequest` option** — sets the maximum number of keys allowed per JSON request (default: `1000`). Mirrors the server-side `--max-keys-per-request` flag and the `max_keys_per_request` field in `DbConfig`.

### Breaking Changes

- **Removed `rateLimitRequests` and `rateLimitWindow` options** — these were server-only properties (HTTP rate limiting) that had no effect in the browser context and were incorrectly exposed in the web package. If you were setting these values, you can safely remove them — they were no-ops in the WASM layer.
