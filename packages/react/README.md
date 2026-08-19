# @moltendb-web/react

Official React hooks wrapper for [MoltenDb](https://github.com/maximilian27/moltendb-web).

## React Version Support

| React Version | Supported |
|---------------|-----------|
| 16.8+         | ✅         |
| 17.x          | ✅         |
| 18.x          | ✅         |
| 19.x          | ✅         |

The package uses only stable React hooks (`useState`, `useEffect`, `useRef`, `useContext`, `createContext`) available
since React 16.8. No concurrent features or React 18+ APIs are used in the library itself.

## What's New in v2

- **Bulk Delete with `.where()`** — delete documents matching a filter clause without listing individual keys.
- **Delete `.order()` + count-only prune** *(query v2.3.0)* — order bulk-delete matches by `_seq` before `.count()` is
  applied (`'asc'` default = oldest first, `'desc'` = newest first), and prune the oldest/newest `n` documents with a
  bare `.delete().count(n)` (no `.where()`). See [`@moltendb-web/query`](../query/README.md).
- **Capped Collections (`.maxSize()`)** — cap a collection to a maximum number of documents; oldest entries are evicted
  automatically when the limit is reached.
- **TTL Collections (`.ttl()`)** — set a time-to-live (in seconds) on a collection; documents are removed automatically
  after expiry.

---

## Installation

```bash
npm install @moltendb-web/react
```

`@moltendb-web/core` and `@moltendb-web/query` are automatically installed as dependencies — no need to install them
separately.

## Setup

### Root-level provider (recommended)

Wrap your entire app with `MoltenDbProvider` so all components share a single database instance:

**React 18+ (`createRoot`)**

```tsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import {MoltenDbProvider} from '@moltendb-web/react';
import App from './App';

ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <MoltenDbProvider config={{name: 'mydb'}}>
        <App/>
      </MoltenDbProvider>
    </React.StrictMode>
);
```

**React 16/17 (`ReactDOM.render`)**

```tsx
import React from 'react';
import ReactDOM from 'react-dom';
import {MoltenDbProvider} from '@moltendb-web/react';
import App from './App';

ReactDOM.render(
    <React.StrictMode>
      <MoltenDbProvider config={{name: 'mydb'}}>
        <App/>
      </MoltenDbProvider>
    </React.StrictMode>,
    document.getElementById('root')
);
```

### Component-level provider

You can also scope a `MoltenDbProvider` to a specific subtree or feature area. Each provider creates its own isolated
database instance:

```tsx
import {MoltenDbProvider} from '@moltendb-web/react';

function InventoryFeature() {
  return (
      <MoltenDbProvider config={{name: 'inventory_db', inMemory: false}}>
        <InventoryList/>
        <InventoryStats/>
      </MoltenDbProvider>
  );
}
```

This is useful for:

- **Lazy-loaded routes** — only initialise the DB when the route is visited
- **Isolated feature modules** — each feature uses its own database
- **Testing** — wrap individual components in a provider with `inMemory: true`

```tsx
// Lazy-loaded route example
import {lazy, Suspense} from 'react';
import {MoltenDbProvider} from '@moltendb-web/react';

const Dashboard = lazy(() => import('./Dashboard'));

function App() {
  return (
      <Suspense fallback={<p>Loading…</p>}>
        <MoltenDbProvider config={{name: 'dashboard_db'}}>
          <Dashboard/>
        </MoltenDbProvider>
      </Suspense>
  );
}
```

## Hooks

### `useMoltenDb()`

Returns the `MoltenDbClient` instance for manual queries and mutations. Must be used inside `<MoltenDbProvider>`.

```tsx
import {useMoltenDb} from '@moltendb-web/react';

function AddTodoButton() {
  const client = useMoltenDb();

  const handleClick = async () => {
    await client.collection('todos').set({
      todo_1: {text: 'Hello MoltenDb!', done: false}
    }).exec();
  };

  return <button onClick={handleClick}>Add Todo</button>;
}
```

### `useMoltenDbResource<T>(collection, queryFn, options?)`

Reactively fetches data from a collection. Automatically re-fetches whenever the collection is mutated. Returns
`{ value, isLoading, error }`.

```tsx
import {useMoltenDbResource} from '@moltendb-web/react';

interface Todo {
  text: string;
  done: boolean;
}

function TodoList() {
  const {value: todos, isLoading, error} = useMoltenDbResource<Record<string, Todo>>(
      'todos',
      (col) => col.get().exec()
  );

  if (isLoading) return <p>Loading…</p>;
  if (error) return <p>Error: {error.message}</p>;
  if (!todos) return <p>No todos yet.</p>;

  return (
      <ul>
        {Object.entries(todos).map(([id, todo]) => (
            <li key={id} style={{textDecoration: todo.done ? 'line-through' : 'none'}}>
              {todo.text}
            </li>
        ))}
      </ul>
  );
}
```

#### With query builder options

```tsx
const {value: expensiveLaptops} = useMoltenDbResource(
    'laptops',
    (col) => col.get()
        .where({price: {$gt: 2000}, in_stock: true})
        .sort([{field: 'price', order: 'asc'}])
        .exec()
);
```

#### With an `initialValue`

Pass a third `options` argument to seed `value` instead of always starting at `undefined` — useful while the first
fetch is in flight in the browser, and it's also what `value` resolves to on the server (see
[Server-Side Rendering](#server-side-rendering-ssr) below):

```tsx
const {value: laptops} = useMoltenDbResource<Laptop[]>(
    'laptops',
    (col) => col.get().exec() as Promise<Laptop[]>,
    {initialValue: []}
);
// `laptops` is `[]` immediately — before the first fetch resolves in the browser,
// and forever on the server — instead of `undefined`.
```

### `useMoltenDbIsLeader()`

Returns `true` if the current tab is the **Leader** — the tab running the WASM worker and performing actual writes.
Other tabs act as follower proxies that forward operations to the leader. Must be used inside `<MoltenDbProvider>`.

```tsx
import {useMoltenDbIsLeader} from '@moltendb-web/react';

function TabBadge() {
  const isLeader = useMoltenDbIsLeader();

  return (
      <span className="badge">
      {isLeader ? '👑 Leader' : '🔗 Follower'}
    </span>
  );
}
```

### `useMoltenDbTerminate()`

Returns a function that terminates the MoltenDb worker. Must be used inside `<MoltenDbProvider>`.

### `useMoltenDbClearOpfs()` *(v2.0.0)*

Returns an async function that flushes and closes the OPFS sync handle. Call this **before** `useMoltenDbTerminate()` —
without it the browser throws a "No modification allowed" error when removing the OPFS directory. Must be used inside
`<MoltenDbProvider>`.

```tsx
import { useMoltenDbClearOpfs, useMoltenDbTerminate } from '@moltendb-web/react';

function ResetButton() {
  const clearOpfs = useMoltenDbClearOpfs();
  const terminate = useMoltenDbTerminate();

  const handleReset = async () => {
    if (!confirm('This will delete all local data and reload. Continue?')) return;
    // 1. Flush and close the OPFS sync handle
    await clearOpfs();
    // 2. Now safe to terminate the worker
    terminate();
    location.reload();
  };

  return <button onClick={handleReset}>🗑 Reset All Data</button>;
}
```

### `useMoltenDbEvents(listener)`

Subscribes to real-time mutation events from the database. The `listener` is called with a `DbEvent` whenever any
document is created, updated, deleted, or a collection is dropped. The subscription is **automatically cleaned up** when
the component unmounts — no manual unsubscription needed. Must be used inside `<MoltenDbProvider>`.

The listener does **not** need to be wrapped in `useCallback`. The hook stores it in a ref internally, so the
subscription is never torn down and re-created just because a new function reference is passed on a re-render.

```tsx
import { useState } from 'react';
import { useMoltenDbEvents } from '@moltendb-web/react';
import type { DbEvent } from '@moltendb-web/react';

function LiveFeed() {
  const [events, setEvents] = useState<DbEvent[]>([]);

  // No useCallback needed — the hook handles referential stability internally.
  useMoltenDbEvents((evt: DbEvent) => {
    setEvents((prev) => [evt, ...prev].slice(0, 50));
  });

  return (
    <ul>
      {events.map((e, i) => (
        <li key={i}>{e.event} — {e.collection}/{e.key}</li>
      ))}
    </ul>
  );
}

## API Reference

| Export                                     | Type      | Description                                                                                                              |
|--------------------------------------------|-----------|--------------------------------------------------------------------------------------------------------------------------|
| `MoltenDbProvider`                         | Component | Context provider — initializes MoltenDb and exposes the client to the subtree                                            |
| `useMoltenDb()`                            | Hook      | Returns the `MoltenDbClient` instance                                                                                    |
| `useMoltenDbIsLeader()`                    | Hook      | Returns `true` if the current tab is the Leader (running the WASM worker)                                                |
| `useMoltenDbTerminate()`                   | Hook      | Returns a function that terminates the MoltenDb worker                                                                   |
| `useMoltenDbClearOpfs()`                   | Hook      | *(v2.0.0)* Returns an async function that flushes and closes the OPFS sync handle — call before `useMoltenDbTerminate()` |
| `useMoltenDbResource(collection, queryFn, options?)` | Hook | Reactive data fetching with `value`, `isLoading`, `error`, auto-refresh on mutations, and an optional `initialValue`     |
| `useMoltenDbEvents(listener)`              | Hook      | Subscribe to real-time `DbEvent` mutation events                                                                         |
| `DbEvent`                                  | Type      | Event object emitted on mutations: `{ event, collection, key, new_v }`                                                   |
| `MoltenDbProviderProps`                    | Interface | Props for `MoltenDbProvider`: `{ config: ReactMoltenDbOptions, children }`                                               |
| `ReactMoltenDbOptions`                     | Interface | Config passed to the provider — extends `MoltenDbOptions` with a required `name` field                                   |
| `MoltenDbResourceResult<T>`                | Interface | Return type of `useMoltenDbResource`: `{ value, isLoading, error }`                                                      |
| `MoltenDbResourceOptions<T>`               | Interface | Options accepted by `useMoltenDbResource`: `{ initialValue? }`                                                           |

## Configuration

`ReactMoltenDbOptions` extends the core `MoltenDbOptions` with one required field:

| Option              | Type                | Default      | Description                                                                                                                                           |
|---------------------|---------------------|--------------|-------------------------------------------------------------------------------------------------------------------------------------------------------|
| `name`              | `string`            | **required** | Database name (used as the OPFS directory name)                                                                                                       |
| `inMemory`          | `boolean`           | `false`      | Run entirely in RAM — no OPFS writes. Data persists as long as at least one tab is open; any tab refresh or close wipes the shared store for all tabs |
| `encryptionKey`     | `string`            | `undefined`  | Password for at-rest encryption. If omitted, data is stored as plain JSON                                                                             |
| `writeMode`         | `'async' \| 'sync'` | `'async'`    | Storage write mode: `'async'` for high throughput or `'sync'` for durable writes                                                                      |
| `maxBodySize`       | `number`            | `undefined`  | Maximum request body size in bytes                                                                                                                    |
| `maxKeysPerRequest` | `number`            | `1000`       | Maximum number of keys allowed per JSON request                                                                                                       |
| `workerUrl`         | `string \| URL`     | `undefined`  | Custom URL or path to `moltendb-worker.js`                                                                                                            |

## Server-Side Rendering (SSR)

`MoltenDbProvider` detects whether it is running in the browser or on the server (`typeof window === 'undefined'`)
and **never boots WASM, OPFS, or the Web Locks API outside the browser**. You no longer need to guard every
MoltenDb-using route yourself just to avoid a server crash — the library does it internally:

- **`useMoltenDb()` / `db` / `client`** — on the server these are lightweight no-op stubs with the same public shape
  as the real implementations, so you never need extra `?.` checks to call them. Builder chains keep working
  synchronously (`.collection('x').set({...})`, `.get()`, `.delete().keys('a')`, `.sort([...])`, etc.), but the
  terminal `.exec()` call always rejects with a clear, actionable error:
  `"[MoltenDb] MoltenDb is not available in a server-side rendering context."` — no hang, no synchronous throw
  mid-chain.
- **`useMoltenDbResource()`** — resolves synchronously to a documented empty state on the server: `isLoading` is
  `false`, `error` is `null`, and `value` is `options?.initialValue` (or `undefined` if you didn't pass one). No
  fetch is attempted, so components branching on `isLoading` / `value` / `error` render their empty/no-data state
  immediately, with no console errors about `navigator.locks`, WASM, or OPFS. Pass `{ initialValue: [] }` for
  list-returning `queryFn`s to get a typed empty array on the server instead of `undefined`.

There is **no public readiness API** — no standalone `useMoltenDbReady()` hook is exported (or planned). The
underlying `isReady` flag is a private, internal implementation detail used only by `useMoltenDbResource()` to know
when it's safe to fetch; it is intentionally not part of the public API surface. Gate UI on the database instead
through the `useMoltenDbResource()` result shown above:

```tsx
import {useMoltenDbResource} from '@moltendb-web/react';

function Greetings() {
  const {value: greetings, isLoading, error} = useMoltenDbResource(
      'greetings',
      (col) => col.get().exec()
  );

  if (isLoading) return <p>⚙ Loading…</p>;
  if (error) return <p className="error">{error.message}</p>;
  if (!greetings) return <p>No greetings yet.</p>;

  return (
      <ul>
        {Object.entries(greetings).map(([id, g]: [string, any]) => (
            <li key={id}>{g.text}</li>
        ))}
      </ul>
  );
}
```

On the server this renders the "no data yet" branch immediately (`isLoading`/`error` never match, and `value` is
`undefined` since no `initialValue` was passed here); in the browser it behaves exactly as before, becoming
reactive once MoltenDb boots.

Because of this, excluding MoltenDb-using routes from prerendering/SSR is now a **recommendation for a better first
paint**, not a requirement to avoid a build/SSR crash.

## Notes

- `MoltenDbProvider` initialises the database asynchronously in the browser. Hooks will not return data until the
  (private, internal) readiness flag flips — `useMoltenDbResource` handles this automatically by waiting before
  fetching. On the server this flag never flips, by design (see [Server-Side Rendering](#server-side-rendering-ssr)).
- Multiple `MoltenDbProvider` instances with the **same `name`** will share the same underlying OPFS storage but
  maintain separate in-memory instances. Use the same `name` across tabs for cross-tab sync via the built-in
  leader/follower mechanism.
- The library ships both **ESM** (`dist/index.js`) and **CommonJS** (`dist/index.cjs`) builds with full TypeScript
  declarations.
