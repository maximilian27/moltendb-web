# MoltenDB Web

<div align="center">
  <img src="../../assets/logo.png" alt="MoltenDB Logo" width="64"/>

  ### 🌋 The Embedded Database for the Modern Web
  **High-performance Rust engine compiled to WASM. Persistent storage via OPFS.**

  [Interactive Demo](https://stackblitz.com/~/github.com/maximilian27/moltendb-wasm-demo?file=package.json) • [Core Engine](https://www.npmjs.com/package/@moltendb-web/core) • [Query Builder](https://www.npmjs.com/package/@moltendb-web/query) • [Original Repository](https://github.com/maximilian27/MoltenDB) • [License](LICENSE.md)

  [![NPM Version](https://img.shields.io/npm/v/@moltendb-web/core?style=flat-square&color=orange)](https://www.npmjs.com/package/@moltendb-web/core)
  [![License](https://img.shields.io/badge/license-BSL%201.1-blue?style=flat-square)](LICENSE.md)
  [![WASM](https://img.shields.io/badge/wasm-optimized-magenta?style=flat-square)](https://webassembly.org/)

</div>

---

## What is MoltenDB Web?

MoltenDB is a JSON document database written in Rust that runs directly in your browser. Unlike traditional browser databases limited by `localStorage` quotas or IndexedDB's complex API, MoltenDB leverages the **Origin Private File System (OPFS)** to provide a high-performance, append-only storage engine.

### 🎮 Explore the Full Functionality

The best way to experience MoltenDB is through the **[Interactive Demo on StackBlitz](https://stackblitz.com/~/github.com/maximilian27/moltendb-wasm-demo?file=package.json)**. It provides a complete, live environment where you can test query builder expressions, perform mutations, and see real-time events with zero local setup.

Prefer to run it in your own environment? You can **[clone the demo repository](https://github.com/maximilian27/moltendb-wasm-demo)** to inspect the source code, run the explorers locally, and experiment with your own schema.

**⚠️ Note for Online IDEs:** If you are viewing this on StackBlitz or CodeSandbox, the WASM engine may be blocked by iframe security restrictions. Please click the "Open in New Window/Tab" button in the preview pane to enable the full OPFS storage engine.

### Core Features
- **Pure Rust Engine:** The same query logic used in our server binary, compiled to WebAssembly.
- **OPFS Persistence:** Data persists across page reloads in a dedicated, high-speed sandbox.
- **Worker-Threaded:** The database runs entirely inside a Web Worker—zero impact on your UI thread.
- **GraphQL-style Selection:** Request only the fields you need (even deeply nested ones) to save memory and CPU.
- **Auto-Indexing:** The engine monitors your queries and automatically creates indexes for frequently filtered fields.
- **Conflict Resolution:** Incoming writes with `_v ≤ stored _v` are silently skipped.
- **Inline reference embedding (`extends`):** Embed data from another collection at insert time.

---

## Installation

MoltenDB is split into two packages: the core engine and the type-safe, chainable query builder.

```bash
# Install the core engine and WASM artifacts
npm install @moltendb-web/core

# Install the chainable query builder
npm install @moltendb-web/query
```

---

# Quick Start
1. Initialize the Client

MoltenDB handles the Web Worker and WASM instantiation for you.
TypeScript
```ts
import { MoltenDB } from '@moltendb-web/core';
import { MoltenDBClient, WorkerTransport } from '@moltendb-web/query';

const workerUrl = new URL('@moltendb-web/core/worker', import.meta.url).href;
const db = new MoltenDB('moltendb_demo', { syncEnabled: false, workerUrl });
await db.init();

// Connect the query builder to the WASM worker
const client = new MoltenDBClient(new WorkerTransport(db.worker));

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

MoltenDB supports a variety of operators in the `where` clause:

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

MoltenDB uses an append-only JSON log. Every write is a new line, ensuring your data is safe even if the tab is closed unexpectedly.

- **Compaction:** When the log exceeds 5MB or 500 entries, the engine automatically "squashes" the log, removing old versions of documents to save space.
- **Persistence:** All data is stored in the Origin Private File System (OPFS). This is a special file system for web apps that provides much higher performance than IndexedDB.

### Performance Note

Because MoltenDB uses OPFS, your browser must support `SharedArrayBuffer`. Most modern browsers support this, but your server must send the following headers:

```http
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

## Project Structure

This monorepo contains the following packages:

- **`packages/core`:** The core WASM engine, Web Worker logic, and the MoltenDB main client.
- **`packages/query`:** The type-safe, chainable Query Builder.

## Roadmap

- [ ] ~~**Multi-Tab Sync:** Leader election for multiple tabs to share a single OPFS instance.~~ ✅
- [ ] **Delta Sync:** Automatic two-way sync with the MoltenDB Rust server.
- [ ] **Analytics functionality:** Run analytics queries straight in the browser. 

## License

MoltenDB is licensed under the **Business Source License 1.1**.

- Free for personal use and organizations with annual revenue under $5 million USD.
- Converts to MIT automatically 3 years after each version's release date.

For commercial licensing or questions: [maximilian.both27@outlook.com](mailto:maximilian.both27@outlook.com)


