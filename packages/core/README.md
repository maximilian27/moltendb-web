# MoltenDb Web

<div align="center">
  <img src="../../assets/logo.png" alt="MoltenDb Logo" width="64"/>

  ### 🌋 The Embedded Database for the Modern Web
  **High-performance Rust engine compiled to WASM. Persistent storage via OPFS.**

  [Interactive Demo](https://stackblitz.com/~/github.com/maximilian27/moltendb-wasm-demo?file=package.json) • [Core Engine](https://www.npmjs.com/package/@moltendb-web/core) • [Query Builder](https://www.npmjs.com/package/@moltendb-web/query) • [Original Repository](https://github.com/maximilian27/MoltenDb) • [License](LICENSE.md)

  [![NPM Version](https://img.shields.io/npm/v/@moltendb-web/core?style=flat-square&color=orange)](https://www.npmjs.com/package/@moltendb-web/core)
  [![License](https://img.shields.io/badge/license-MIT-green?style=flat-square)](LICENSE.md)
  [![WASM](https://img.shields.io/badge/wasm-optimized-magenta?style=flat-square)](https://webassembly.org/)
  [![Status](https://img.shields.io/badge/status-release%20candidate-brightgreen?style=flat-square)]()

</div>

---

## What is MoltenDb Web?

MoltenDb is a JSON document database written in Rust that runs directly in your browser. Unlike traditional browser databases limited by `localStorage` quotas or IndexedDB's complex API, MoltenDb leverages the **Origin Private File System (OPFS)** to provide a high-performance, append-only storage engine.

Beyond being a full-featured embedded database, MoltenDb can also serve as a **persistent state manager** for your application. Because all data is written to OPFS, your app's state survives page reloads, browser crashes, and unexpected connection loss — your users will never lose their work.

> **🚀 Release Candidate** — The core engine, multi-tab sync, and storage layer are feature-complete and stabilised for v1. Server sync, encryption and analytics are planned for a future release.

### 🎮 Explore the Full Functionality

The best way to experience MoltenDb is through the **[Interactive Demo on StackBlitz](https://stackblitz.com/~/github.com/maximilian27/moltendb-wasm-demo?file=package.json)**. It provides a complete, live environment where you can test query builder expressions, perform mutations, and see real-time events with zero local setup.

Prefer to run it in your own environment? You can **[clone the demo repository](https://github.com/maximilian27/moltendb-wasm-demo)** to inspect the source code, run the explorers locally, and experiment with your own schema.

**⚠️ Note for Online IDEs:** If you are viewing this on StackBlitz or CodeSandbox, the WASM engine may be blocked by iframe security restrictions. Please click the "Open in New Window/Tab" button in the preview pane to enable the full OPFS storage engine.

### Core Features
- **Pure Rust Engine:** The same query logic used in our server binary, compiled to WebAssembly.
- **OPFS Persistence:** Data persists across page reloads in a dedicated, high-speed sandbox.
- **Worker-Threaded:** The database runs entirely inside a Web Worker—zero impact on your UI thread.
- **Multi-Tab Sync (stabilised):** Leader election via the Web Locks API ensures only one tab owns the OPFS handle. All other tabs proxy reads and writes through a `BroadcastChannel`. Seamless leader promotion when the active tab closes.
- **Automatic Compaction:** The engine automatically compacts the append-only log when it exceeds **500 entries or 5 MB**, keeping storage lean without any manual intervention.
- **Real-Time Pub/Sub:** Every write and delete emits a typed `DbEvent` to all open tabs instantly. The `subscribe()` pattern supports multiple independent listeners per tab — perfect for modern UI frameworks like React and Angular.
- **GraphQL-style Selection:** Request only the fields you need (even deeply nested ones) to save memory and CPU.
- **Auto-Indexing:** The engine monitors your queries and automatically creates indexes for frequently filtered fields.
- **Conflict Resolution:** Incoming writes with `_v ≤ stored _v` are silently skipped.
- **Inline reference embedding (`extends`):** Embed data from another collection at insert time.

---

## Installation

MoltenDb is split into two packages: the core engine and the type-safe, chainable query builder.

```bash
# Install the core engine and WASM artifacts
npm install @moltendb-web/core

# Install the chainable query builder
npm install @moltendb-web/query
```
📦 **Bundler Setup**

MoltenDb handles its own Web Workers and WASM loading automatically. However, depending on your build tool, you may need a tiny config tweak to ensure it serves the static files correctly.

**For Vite:**
Exclude the core package from pre-bundling in your vite.config.js:

```js
// vite.config.js`
export default defineConfig({
  optimizeDeps: { exclude: ['@moltendb-web/core'] }
});
```

**For Webpack 5 (Next.js, Create React App):**
Ensure Webpack treats the `.wasm` binary as a static resource in `webpack.config.js`:

```js
module.exports = {
  module: {
    rules: [{ test: /\.wasm$/, type: 'asset/resource' }]
  }
};
```
---

# Quick Start
1. Initialize the Client

MoltenDb handles the Web Worker and WASM instantiation for you.
TypeScript
```ts
import { MoltenDb } from '@moltendb-web/core';
import { MoltenDbClient, WorkerTransport } from '@moltendb-web/query';

const db = new MoltenDb('moltendb_demo');
await db.init();

// Connect the query builder to the WASM worker
const client = new MoltenDbClient(db);

// 2. Insert and Query

// Use the @moltendb-web/query builder for a type-safe experience. 

// Insert data
await client.collection('laptops').set({
  lp1: {
    brand: "Apple",
      model: "MacBook Pro",
      price: 1999,
      in_stock: true,
      memory_id: 'mem1',
      specs: {
        cpu: {
          cores: 8,
          clock_speed: 3.5,
        },
        display: {
          refresh_hz: 60,
        }
      }
  },
  lp2: {
    brand: "Apple",
    model: "MacBook Air",
    price: 900,
    in_stock: true,
      memory_id: 'mem2',
      specs: {
      cpu: {
        cores: 4,
        clock_speed: 3.5,
      },
      display: {
        refresh_hz: 60,
      }
    }
  }
}).exec();

await client.collection('memory').set({
    mem1: { 
      capacity_gb: 16,
      type: 'DDR4',  
      speed_mhz: 4800,
      upgradeable: false  
    },
    mem2: {
      capacity_gb: 64,
      type: 'DDR5',  
      speed_mhz: 5600,
      upgradeable: true 
    },
}).exec();

// Query with field selection
const results = await client.collection('laptops')
  .get()
  .where({ brand: { $in: ["Apple", "Dell"] }, in_stock: true }) // Using $in operator
  .fields(['model', 'price']) // Only return these specific fields
  .sort([{ field: 'price', order: 'desc' }])
  .exec();

console.log(results); 
// [
//  {
//    "_key": "lp1",
//    "model": "MacBook Pro",
//    "price": 1999
//  },
//  {
//    "_key": "lp2",
//    "model": "MacBook Air",
//    "price": 900
//  }
// ]

// Powerful Query Capabilities
// GraphQL-style Field Selection

// Never over-fetch data again. Use dot-notation to extract deeply nested values.

await client.collection('laptops')
  .get()
  .fields(["brand", "specs.cpu.cores", "specs.display.refresh_hz"])
  .exec();

// Inline Joins

// Resolve relationships between collections at query time.

await client.collection('laptops')
  .get()
  .joins([{ 
    alias: 'ram', 
    from: 'memory', 
    on: 'memory_id', 
    fields: ['capacity_gb', 'type'] 
  }])
  .exec();

// Supported Query Operators

MoltenDb supports a variety of operators in the `where` clause:

| Operator | Aliases | Description |
|---|---|---|
| `$eq` | `$equals` | Exact equality |
| `$ne` | `$notEquals` | Not equal |
| `$gt` | `$greaterThan` | Greater than (numeric) |
| `$gte` | | Greater than or equal |
| `$lt` | `$lessThan` | Less than (numeric) |
| `$lte` | | Less than or equal |
| `$contains` | `$ct` | Substring check (string) or membership check (array) |
| `$in` | `$oneOf` | Field value is one of a list |
| `$nin` | `$notIn` | Field value is not in a list |

// Inline reference embedding (`extends`)

The `extends` key embeds data from another collection directly into the stored document at insert time — no join needed on reads.

```ts
await client.collection('laptops')
  .set({
    lp7: {
      brand: "MSI",
      model: "Titan GT77",
      price: 3299,
    }
  })
  .extends({
    ram: "memory.mem4",
    screen: "display.dsp3"
  })
  .exec();
```

**When to use `extends` vs `joins`:**

| | `extends` | `joins` |
|---|---|---|
| Resolved at | Insert time (once) | Query time (every request) |
| Data freshness | Snapshot — may become stale | Always live |
| Read cost | O(1) — data already embedded | O(1) per join per document |
| Use when | Data rarely changes, fast reads matter | Data changes frequently, freshness matters |

---
## Storage Architecture

### How the Log Works

MoltenDb uses an append-only JSON log. Every write is a new line, ensuring your data is safe even if the tab is closed unexpectedly.

- **Automatic Compaction:** When the log exceeds **500 entries or 5 MB**, the engine automatically "squashes" the log, removing superseded document versions to reclaim space. No manual `compact()` calls are needed in normal operation.
- **Persistence:** All data is stored in the Origin Private File System (OPFS). This is a special file system for web apps that provides much higher performance than IndexedDB.

### Multi-Tab Sync

MoltenDb uses the **Web Locks API** for leader election. The first tab to acquire the lock becomes the *leader* and owns the OPFS file handle directly. Every subsequent tab becomes a *follower* and proxies all reads and writes through a `BroadcastChannel` to the leader.

When the leader tab is closed, the next queued follower automatically acquires the lock and promotes itself to leader — no data loss, no manual reconnection required.

```
Tab 1 (Leader) ──owns──▶ Web Worker ──▶ WASM Engine ──▶ OPFS
     │
     └── BroadcastChannel ──▶ Tab 2 (Follower)
                          ──▶ Tab 3 (Follower)
```

### Real-Time Events (Pub/Sub)

MoltenDb has a built-in pub/sub system that automatically notifies **all open tabs** whenever a document is created, updated, or deleted — no polling required.

You can attach multiple independent listeners using the subscribe() method, making it trivial to keep different UI components (like React hooks or Angular signals) in sync without memory leaks:

```ts
const db = new MoltenDb('my-app');
await db.init();

// Attach a listener (Returns an unsubscribe function)
const unsubscribe = db.subscribe((event) => {
  console.log(event.event);      // 'change' | 'delete' | 'drop'
  console.log(event.collection); // e.g. 'laptops'
  console.log(event.key);        // e.g. 'lp1'
  console.log(event.new_v);      // new version number, or null on delete
});

// Later, when the UI component unmounts:
unsubscribe();
```

The event fires on the **leader tab** (directly from the WASM engine) and is automatically broadcast over the `BroadcastChannel` so every **follower tab** receives it too. This makes it trivial to keep your UI in sync across tabs without any extra infrastructure:

```ts
db.subscribe(({ event, collection, key }) => {
  if (collection === 'laptops') {
    refreshLaptopList(); // re-query and re-render
  }
});
```

The `DbEvent` type is exported from the package for full TypeScript support:

```ts
import { MoltenDb, DbEvent } from '@moltendb-web/core';

const db = new MoltenDb('my-app');
await db.init();

db.subscribe((e: DbEvent) => { /* fully typed */ });```

---

### Performance Note

Because MoltenDb uses OPFS, your browser must support `SharedArrayBuffer`. Most modern browsers support this, but your server must send the following headers:

```http
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

---

## Testing

The core package ships with a comprehensive test suite built on **Vitest**:

```bash
cd packages/core
npm test              # run all unit & integration tests
npm run test:coverage # with coverage report
```

### What's covered

| Suite | Tests | What it verifies |
|---|---|---|
| `init()` | 5 | Leader election, idempotency, worker error propagation |
| CRUD — leader | 9 | set/get/delete/getAll round-trips, collection isolation |
| CRUD — follower | 3 | BroadcastChannel proxy path for all mutations |
| Worker error handling | 3 | Transient errors, unknown actions, request isolation |
| Leader promotion | 2 | Follower takes over when leader tab closes |
| `Pub/Sub (subscribe)`  | 2 | Multi-subscriber event delivery across tabs |
| Follower timeout | 1 | Pending requests reject after 10 s if leader disappears |
| `terminate` / `disconnect` | 3 | Worker cleanup, timer teardown |
| Stress — rapid writes | 3 | 100 sequential, 50 concurrent, interleaved set/delete |
| BC name isolation | 2 | Two databases on the same origin don't bleed data |
| Bulk insert stress | 3 | 1 000 concurrent sets, 500 mixed ops, compact under pressure |
| Multi-tab parallel stress | 4 | 3 tabs × 100 writes, ID collision safety, follower reads after burst, promotion under load |

**Total: 50 tests — all green.**

---

## Project Structure

This monorepo contains the following packages:

- **`packages/core`:** The core WASM engine, Web Worker logic, and the MoltenDb main client.
- **`packages/query`:** The type-safe, chainable Query Builder.

## Roadmap

- [x] **Multi-Tab Sync:** Leader election for multiple tabs to share a single OPFS instance — **stabilised in RC1**.
- [x] **Automatic Compaction:** Log compacts automatically at 500 entries or 5 MB — **stabilised in RC1**.
- [x] **Rich Test Suite:** 50 unit, integration, and stress tests via Vitest — **stabilised in RC1**.
- [ ] **React Adapter:** Official `@moltendb-web/react` package with `useQuery` hooks and real-time context providers.
- [x] **Angular Adapter:** Official `@moltendb-web/angular` package featuring Signal-based data fetching.
- [ ] **Delta Sync:** Automatic two-way sync with the MoltenDb Rust server.
- [ ] **Data Encryption:** Transparent encryption-at-rest using hardware-backed keys (Web Crypto API).
- [ ] **Analytics Functionality:** Run complex analytics queries straight in the browser without blocking the UI.


## Contributing & Feedback

Found a bug or have a feature request? Please open an issue on the [GitHub issue tracker](https://github.com/maximilian27/moltendb-web/issues).

---

## License

The MoltenDb Web packages (`@moltendb-web/core` and `@moltendb-web/query`) are licensed under the MIT License.

The **MoltenDb Server** (Rust backend) remains under the Business Source License 1.1 (Free for organizations under $5M revenue, requires a license for managed services).

For commercial licensing or questions: [maximilian.both27@outlook.com](mailto:maximilian.both27@outlook.com)
