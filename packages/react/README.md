# @moltendb-web/react

Official React hooks wrapper for [MoltenDb](https://github.com/maximilian27/moltendb-web).

## React Version Support

| React Version | Supported |
|---|---|
| 16.8+ | ✅ |
| 17.x | ✅ |
| 18.x | ✅ |
| 19.x | ✅ |

The package uses only stable React hooks (`useState`, `useEffect`, `useRef`, `useContext`, `createContext`) available since React 16.8. No concurrent features or React 18+ APIs are used in the library itself.

## Installation

```bash
npm install @moltendb-web/react @moltendb-web/core @moltendb-web/query
```

## Setup

### Root-level provider (recommended)

Wrap your entire app with `MoltenDbProvider` so all components share a single database instance:

**React 18+ (`createRoot`)**
```tsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import { MoltenDbProvider } from '@moltendb-web/react';
import App from './App';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <MoltenDbProvider config={{ name: 'mydb' }}>
      <App />
    </MoltenDbProvider>
  </React.StrictMode>
);
```

**React 16/17 (`ReactDOM.render`)**
```tsx
import React from 'react';
import ReactDOM from 'react-dom';
import { MoltenDbProvider } from '@moltendb-web/react';
import App from './App';

ReactDOM.render(
  <React.StrictMode>
    <MoltenDbProvider config={{ name: 'mydb' }}>
      <App />
    </MoltenDbProvider>
  </React.StrictMode>,
  document.getElementById('root')
);
```

### Component-level provider

You can also scope a `MoltenDbProvider` to a specific subtree or feature area. Each provider creates its own isolated database instance:

```tsx
import { MoltenDbProvider } from '@moltendb-web/react';

function InventoryFeature() {
  return (
    <MoltenDbProvider config={{ name: 'inventory_db', inMemory: false }}>
      <InventoryList />
      <InventoryStats />
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
import { lazy, Suspense } from 'react';
import { MoltenDbProvider } from '@moltendb-web/react';

const Dashboard = lazy(() => import('./Dashboard'));

function App() {
  return (
    <Suspense fallback={<p>Loading…</p>}>
      <MoltenDbProvider config={{ name: 'dashboard_db' }}>
        <Dashboard />
      </MoltenDbProvider>
    </Suspense>
  );
}
```

## Hooks

### `useMoltenDb()`

Returns the `MoltenDbClient` instance for manual queries and mutations. Must be used inside `<MoltenDbProvider>`.

```tsx
import { useMoltenDb } from '@moltendb-web/react';

function AddTodoButton() {
  const client = useMoltenDb();

  const handleClick = async () => {
    await client.collection('todos').set({
      todo_1: { text: 'Hello MoltenDb!', done: false }
    }).exec();
  };

  return <button onClick={handleClick}>Add Todo</button>;
}
```

### `useMoltenDbResource<T>(collection, queryFn)`

Reactively fetches data from a collection. Automatically re-fetches whenever the collection is mutated. Returns `{ value, isLoading, error }`.

```tsx
import { useMoltenDbResource } from '@moltendb-web/react';

interface Todo {
  text: string;
  done: boolean;
}

function TodoList() {
  const { value: todos, isLoading, error } = useMoltenDbResource<Record<string, Todo>>(
    'todos',
    (col) => col.get().exec()
  );

  if (isLoading) return <p>Loading…</p>;
  if (error) return <p>Error: {error.message}</p>;
  if (!todos) return <p>No todos yet.</p>;

  return (
    <ul>
      {Object.entries(todos).map(([id, todo]) => (
        <li key={id} style={{ textDecoration: todo.done ? 'line-through' : 'none' }}>
          {todo.text}
        </li>
      ))}
    </ul>
  );
}
```

#### With query builder options

```tsx
const { value: expensiveLaptops } = useMoltenDbResource(
  'laptops',
  (col) => col.get()
    .where({ price: { $gt: 2000 }, in_stock: true })
    .sort([{ field: 'price', order: 'asc' }])
    .exec()
);
```

### `useMoltenDbReady()`

Returns `true` once MoltenDb has finished initialising. Useful for gating UI until the database is ready. Must be used inside `<MoltenDbProvider>`.

```tsx
import { useMoltenDbReady } from '@moltendb-web/react';

function AppShell({ children }: { children: React.ReactNode }) {
  const isReady = useMoltenDbReady();

  if (!isReady) return <p>⚙ Initialising database…</p>;

  return <>{children}</>;
}
```

### `useMoltenDbEvents(listener)`

Subscribes to real-time mutation events from the database. The `listener` is called with a `DbEvent` whenever any document is created, updated, deleted, or a collection is dropped. Must be used inside `<MoltenDbProvider>`.

```tsx
import { useCallback, useState } from 'react';
import { useMoltenDbEvents } from '@moltendb-web/react';
import type { DbEvent } from '@moltendb-web/react';

function LiveFeed() {
  const [events, setEvents] = useState<DbEvent[]>([]);

  useMoltenDbEvents(useCallback((evt: DbEvent) => {
    setEvents((prev) => [evt, ...prev].slice(0, 50));
  }, []));

  return (
    <ul>
      {events.map((e, i) => (
        <li key={i}>{e.event} — {e.collection}/{e.key}</li>
      ))}
    </ul>
  );
}
```

> **Tip:** Wrap the listener in `useCallback` with an empty dependency array to keep it stable and avoid re-subscribing on every render.

## API Reference

| Export | Type | Description |
|---|---|---|
| `MoltenDbProvider` | Component | Context provider — initializes MoltenDb and exposes the client to the subtree |
| `useMoltenDb()` | Hook | Returns the `MoltenDbClient` instance |
| `useMoltenDbReady()` | Hook | Returns `true` once MoltenDb has finished initialising |
| `useMoltenDbResource(collection, queryFn)` | Hook | Reactive data fetching with `value`, `isLoading`, `error` and auto-refresh on mutations |
| `useMoltenDbEvents(listener)` | Hook | Subscribe to real-time `DbEvent` mutation events |
| `DbEvent` | Type | Event object emitted on mutations: `{ event, collection, key, new_v }` |
| `MoltenDbProviderProps` | Interface | Props for `MoltenDbProvider`: `{ config: ReactMoltenDbOptions, children }` |
| `ReactMoltenDbOptions` | Interface | Config passed to the provider — extends `MoltenDbOptions` with a required `name` field |
| `MoltenDbResourceResult<T>` | Interface | Return type of `useMoltenDbResource`: `{ value, isLoading, error }` |

## Configuration

`ReactMoltenDbOptions` extends the core `MoltenDbOptions` with one required field:

| Option | Type | Default | Description |
|---|---|---|---|
| `name` | `string` | **required** | Database name (used as the OPFS directory name) |
| `inMemory` | `boolean` | `false` | Run entirely in RAM — no OPFS writes. Data persists as long as at least one tab is open; any tab refresh or close wipes the shared store for all tabs |
| `encryptionKey` | `string` | `undefined` | Password for at-rest encryption. If omitted, data is stored as plain JSON |
| `writeMode` | `'async' \| 'sync'` | `'async'` | Storage write mode: `'async'` for high throughput or `'sync'` for durable writes |
| `hotThreshold` | `number` | `50000` | Maximum documents per collection to keep in RAM |
| `maxBodySize` | `number` | `undefined` | Maximum request body size in bytes |
| `maxKeysPerRequest` | `number` | `1000` | Maximum number of keys allowed per JSON request |
| `workerUrl` | `string \| URL` | `undefined` | Custom URL or path to `moltendb-worker.js` |

## Notes

- `MoltenDbProvider` initialises the database asynchronously. Hooks will not return data until `isReady` is `true` — `useMoltenDbResource` handles this automatically by waiting before fetching.
- Multiple `MoltenDbProvider` instances with the **same `name`** will share the same underlying OPFS storage but maintain separate in-memory instances. Use the same `name` across tabs for cross-tab sync via the built-in leader/follower mechanism.
- The library ships both **ESM** (`dist/index.js`) and **CommonJS** (`dist/index.cjs`) builds with full TypeScript declarations.
