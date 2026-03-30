# @moltendb-web/query

Type-safe, chainable query builder for [MoltenDb](https://github.com/maximilian27/MoltenDb).

Works in vanilla JavaScript and TypeScript. Compiles as an npm module (CJS + ESM + `.d.ts`).

### 🌋 Explore the Full Functionality

The best way to experience the MoltenDb query builder is through our **[Interactive Demo on StackBlitz](https://stackblitz.com/~/github.com/maximilian27/moltendb-wasm-demo?file=package.json)**. It contains a complete, live environment where you can test query builder expressions, perform mutations, and see real-time events without any local setup.

---

## Installation

```bash
npm install @moltendb-web/query
```

---

## Quick start

```ts
import { MoltenDb } from '@moltendb-web/core';
import { MoltenDbClient, WorkerTransport } from '@moltendb-web/query';

// 1. Initialize the Core Engine (boots WASM worker)
const db = new MoltenDb('moltendb_demo');
await db.init();

// 2. Connect the Query Builder to the worker
const client = new MoltenDbClient(db);

// SET — insert / upsert
await client.collection('laptops')
    .set({
        lp1: { brand: 'Lenovo', model: 'ThinkPad X1', price: 1499, in_stock: true },
        lp2: { brand: 'Apple',  model: 'MacBook Pro',  price: 3499, in_stock: true },
    })
    .exec();

// GET — query with WHERE, field projection, sort and pagination
const results = await client.collection('laptops')
  .get()
  .where({ brand: 'Apple' })
  .fields(['brand', 'model', 'price'])
  .sort([{ field: 'price', order: 'asc' }])
  .count(5)
  .exec();

// UPDATE — partial patch (only listed fields are changed)
await client.collection('laptops')
  .update({ lp1: { price: 1749, in_stock: false } })
  .exec();

// DELETE — single key
await client.collection('laptops').delete().keys('lp1').exec();

// DELETE — batch
await client.collection('laptops').delete().keys(['lp1', 'lp2']).exec();

// DELETE — drop entire collection
await client.collection('laptops').delete().drop().exec();
```

---

## Operations & allowed fields

Each operation only exposes the methods that are valid for it — invalid
combinations are caught at compile time by TypeScript.

### `get()` — read / query

| Method | Description |
|---|---|
| `.keys(key \| key[])` | Fetch one or more documents by key |
| `.where(clause)` | Filter with operators: `$eq $ne $gt $gte $lt $lte $in $nin $contains` (and aliases) |
| `.fields(string[])` | Return only these fields (dot-notation supported) |
| `.excludedFields(string[])` | Return everything except these fields |
| `.joins(JoinSpec[])` | Embed related documents from other collections |
| `.sort(SortSpec[])` | Sort results (multi-field, asc/desc) |
| `.count(n)` | Limit results to N documents |
| `.offset(n)` | Skip first N results (pagination) |
| `.build()` | Return the raw JSON payload without sending |
| `.exec()` | Send the query and return the result |

### `set(data)` — insert / upsert

| Method | Description |
|---|---|
| `.extends(map)` | Embed snapshots from other collections at insert time |
| `.build()` | Return the raw JSON payload without sending |
| `.exec()` | Send and return `{ count, status }` |

`data` can be a `{ key: document }` map or a `Document[]` array (UUIDv7 keys are auto-assigned for arrays).

### `update(data)` — partial patch

| Method | Description |
|---|---|
| `.build()` | Return the raw JSON payload without sending |
| `.exec()` | Send and return `{ count, status }` |

Only the fields present in each patch object are updated — all other fields are left unchanged.

### `delete()` — delete documents or drop collection

| Method | Description |
|---|---|
| `.keys(key \| key[])` | Delete one or more documents by key |
| `.drop()` | Drop the entire collection |
| `.build()` | Return the raw JSON payload without sending |
| `.exec()` | Send and return `{ count, status }` |

---

## WHERE operators

```ts
// Exact equality (implicit or explicit)
.where({ brand: 'Apple' })
.where({ brand: { $eq: 'Apple' } })
.where({ brand: { $equals: 'Apple' } }) // alias

// Comparison
.where({ price: { $gt: 1000, $lt: 3000 } })
.where({ price: { $greaterThan: 1000, $lessThan: 3000 } }) // aliases
.where({ 'specs.cpu.cores': { $gte: 12 } })

// Not equal
.where({ 'specs.cpu.brand': { $ne: 'Intel' } })
.where({ 'specs.cpu.brand': { $notEquals: 'Intel' } }) // alias

// In / not-in list
.where({ brand: { $in: ['Apple', 'Dell'] } })
.where({ brand: { $oneOf: ['Apple', 'Dell'] } }) // alias
.where({ brand: { $nin: ['Framework'] } })
.where({ brand: { $notIn: ['Framework'] } }) // alias

// Contains (string substring or array element)
.where({ model: { $contains: 'Pro' } })
.where({ model: { $ct: 'Pro' } }) // alias
.where({ tags:  { $contains: 'gaming' } })

// Multiple conditions (implicit AND)
.where({ in_stock: true, 'specs.cpu.brand': 'Intel' })
```

---

## Joins

```ts
const results = await client.collection('laptops')
  .get()
  .fields(['brand', 'model', 'price'])
  .joins([
    { alias: 'ram',    from: 'memory',  on: 'memory_id',  fields: ['capacity_gb', 'type'] },
    { alias: 'screen', from: 'display', on: 'display_id', fields: ['refresh_hz', 'panel'] },
  ])
  .exec();
// Each result: { brand, model, price, ram: { capacity_gb, type }, screen: { refresh_hz, panel } }
```

---

## Extends (snapshot embedding at insert time)

```ts
await client.collection('laptops')
  .set({
    lp7: {
      brand: 'MSI', model: 'Titan GT77', price: 3299,
      specs: { cpu: { brand: 'Intel', cores: 16, ghz: 5.0 } },
    },
  })
  .extends({ ram: 'memory.mem4', screen: 'display.dsp3' })
  .exec();
// lp7 is stored with the full mem4 and dsp3 documents embedded inline.
```

**When to use `extends` vs `joins`:**

| | `extends` | `joins` |
|---|---|---|
| Resolved at | Insert time (once) | Query time (every request) |
| Data freshness | Snapshot — may become stale | Always live |
| Read cost | O(1) — data already embedded | O(1) per join per document |
| Use when | Data rarely changes, fast reads matter | Data changes frequently, freshness matters |

---

## Custom transport

Implement `MoltenTransport` to connect to any backend:

```ts
import { MoltenTransport, MoltenDbClient, Document, JsonValue } from '@moltendb-web/query';

class FetchTransport implements MoltenTransport {
  constructor(private baseUrl: string, private token: string) {}

  async send(action: 'get' | 'set' | 'update' | 'delete', payload: Document): Promise<JsonValue> {
    const res = await fetch(`${this.baseUrl}/${action}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.token}`,
      },
      body: JSON.stringify(payload),
    });
    return res.json();
  }
}

const db = new MoltenDbClient(new FetchTransport('[https://api.mydomain.com](https://api.mydomain.com)', myToken));
```

---

## Build

```bash
npm run build      # Builds CJS, ESM, and type declarations
npm run typecheck  # Type-check without emitting
npm run test       # Run the Jest test suite
```

## Contributing & Feedback

Found a bug or have a feature request? Please open an issue on the [GitHub issue tracker](https://github.com/maximilian27/moltendb-web/issues).

---

## License

MIT
