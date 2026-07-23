# MoltenDb Web

<div align="center">
  <img src="assets/logo.png" alt="MoltenDb Logo" width="64"/>

### 🌋 The Embedded Database for the Modern Web

**This is the monorepo for MoltenDb Web — a high-performance Rust engine compiled to WASM with persistent storage via
OPFS.**

**Use it as a full-featured embedded database *or* as a persistent state manager — your app's data survives page
reloads, browser crashes, and unexpected connection loss automatically.**

[Interactive Demo](https://stackblitz.com/~/github.com/maximilian27/moltendb-wasm-demo?file=package.json) • [Original Repository](https://github.com/maximilian27/MoltenDb) • [License](LICENSE.md)

[![NPM Version](https://img.shields.io/npm/v/@moltendb-web/core?style=flat-square&color=orange)](https://www.npmjs.com/package/@moltendb-web/core)
[![License](https://img.shields.io/badge/license-MIT-green?style=flat-square)](LICENSE.md)
[![WASM](https://img.shields.io/badge/wasm-optimized-magenta?style=flat-square)](https://webassembly.org/)
</div>

---

## What's New in v2

### Query Builder

- **Bulk Delete with `.where()`** — delete documents matching a filter clause without listing individual keys.
- **Delete `.order()` + count-only prune** *(query v2.3.0)* — order bulk-delete matches by `_seq` before `.count()` is applied (`'asc'` default = oldest first, `'desc'` = newest first), and prune the oldest/newest `n` documents with a bare `.delete().count(n)` (no `.where()`) — reusing the ordered `_seq` index like an unsorted `get()`.
- **Capped Collections (`.maxSize()`)** — cap a collection to a maximum number of documents; oldest entries are evicted
  automatically when the limit is reached.
- **TTL Collections (`.ttl()`)** — set a time-to-live (in seconds) on a collection; documents are removed automatically
  after expiry.

### Core Engine Performance

- **`Arc<str>` collection-key interning** — the outer `DashMap` key was changed from `String` to `Arc<str>`. During bulk
  insert and WAL replay all documents in the same collection share a single pointer instead of allocating a new `String`
  per document. Saves ~30 B per doc (~30 MB at 1 M docs) and reduces allocator pressure during startup.
- **MessagePack in-memory storage** — the hot document map was switched from `serde_json::Value` to `Box<[u8]>` (
  MessagePack bytes). Reduces steady-state RSS for 1 M docs from ~4 GB to ~500 MB (~8× lower). Decoding to `Value`
  happens lazily on read; write paths encode via `rmp_serde`.

---

## Demos

### 🔬 Interactive Query Demo (Core & Query packages)

Explore the full MoltenDb query builder in a live, zero-setup environment:

- ⚡ **StackBlitz:
  ** [Open Interactive Demo](https://stackblitz.com/~/github.com/maximilian27/moltendb-wasm-demo?file=package.json)

This demo lets you test the full query builder API — `get()`, `set()`, `update()`, `delete()`, `.where()`, `.fields()`,
`.sort()`, `.joins()`, and more — directly in the browser against a real WASM-powered MoltenDb instance.

### 🅰️ Angular Demo App

A real-world Angular application showcasing the `@moltendb-web/angular` integration:

- 🔗 **Demo repo:** [github.com/maximilian27/moltendb-angular](https://github.com/maximilian27/moltendb-angular)
- ⚡ **StackBlitz:** [Open in StackBlitz](https://stackblitz.com/~/github.com/maximilian27/moltendb-angular)
- 🌐 **Live demo:
  ** [moltendb-angular.maximilian-both27.workers.dev/laptops](https://moltendb-angular.maximilian-both27.workers.dev/laptops)

The demo app showcases two real-world scenarios:

- **`/laptops`** — A fully-featured data table with filtering, sorting, column visibility, field projection, and
  reactive summary stats using `moltenDbResource`.
- **`/stress-test`** — A benchmarking page measuring MoltenDB CRUD performance (bulk writes, reads, filtered/sorted
  queries, updates, and deletes) displayed as ops/sec.

---

## Packages

This monorepo contains the following packages. Please refer to their individual READMEs for detailed documentation,
usage examples, and API references.

| Package                                     | Description                                               | README                               |
|---------------------------------------------|-----------------------------------------------------------|--------------------------------------|
| [`@moltendb-web/core`](packages/core)       | Core WASM engine — low-level database bindings            | [README](packages/core/README.md)    |
| [`@moltendb-web/query`](packages/query)     | Query builder — ergonomic API on top of core              | [README](packages/query/README.md)   |
| [`@moltendb-web/angular`](packages/angular) | Angular integration — reactive Signals, resources, and DI | [README](packages/angular/README.md) |
| [`@moltendb-web/react`](packages/react)     | React integration — React hooks                           | [README](packages/react/README.md)   |
