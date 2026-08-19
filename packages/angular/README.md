# @moltendb-web/angular

Official Angular integration for [MoltenDb](https://github.com/maximilian27/moltendb-web), providing a seamless reactive
developer experience using modern Angular Signals.

> **Requirements:** Angular **17 or higher**. This library uses Angular Signals and standalone APIs introduced in
> Angular 17.

---

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

## Demo

See the library in action with a real-world demo application:

- 🔗 **Demo repo:** [github.com/maximilian27/moltendb-angular](https://github.com/maximilian27/moltendb-angular)
- ⚡ **StackBlitz:** [Open in StackBlitz](https://stackblitz.com/~/github.com/maximilian27/moltendb-angular)
- 🌠 **Live demo:
  ** [moltendb-angular.maximilian-both27.workers.dev/laptops](https://moltendb-angular.maximilian-both27.workers.dev/laptops)

---

## Installation

```bash
npm install @moltendb-web/angular
```

`@moltendb-web/core` and `@moltendb-web/query` are automatically installed as dependencies — no need to install them
separately.

---

## Step 1: Configure Assets

MoltenDb runs its database engine inside a background Web Worker and relies on WebAssembly (WASM). You must tell Angular
to serve these compiled files as public assets.

Update the `assets` array in your `angular.json`:

```json
"assets": [
{
"glob": "moltendb-worker.js",
"input": "node_modules/@moltendb-web/core/dist",
"output": "/"
},
{
"glob": "moltendb_core.js",
"input": "node_modules/@moltendb-web/core/dist/wasm",
"output": "/wasm/"
},
{
"glob": "*.wasm",
"input": "node_modules/@moltendb-web/core/dist/wasm",
"output": "/wasm/"
}
]
```

> **Note:** Restart your Angular dev server after modifying `angular.json`.

---

## Step 2: Provide MoltenDb

Initialise MoltenDb in your root `app.config.ts`:

```typescript
import {ApplicationConfig} from '@angular/core';
import {provideMoltenDb} from '@moltendb-web/angular';

export const appConfig: ApplicationConfig = {
  providers: [
    provideMoltenDb({
      name: 'my_app_db',
      workerUrl: '/moltendb-worker.js',
    })
  ]
};
```

---

## Step 3: Fetching and Mutating Data

### Reactive data — `moltenDbResource()`

Use `moltenDbResource` to bind data to your template. It handles loading states, errors, and live collection updates
automatically.

```typescript
import {Component} from '@angular/core';
import {moltenDbResource} from '@moltendb-web/angular';

interface Laptop {
  _key: string;
  brand: string;
  model: string;
  price: number;
}

@Component({
  selector: 'app-laptops',
  template: `
    @if (laptops.isLoading() && !laptops.value()) {
      <p>Loading…</p>
    }
    @if (laptops.value(); as list) {
      <ul>
        @for (item of list; track item._key) {
          <li>{{ item.brand }} {{ item.model }} — {{ item.price | currency }}</li>
        }
      </ul>
    }
    @if (laptops.error()) {
      <p class="error">{{ laptops.error().message }}</p>
    }
  `
})
export class LaptopsComponent {
  laptops = moltenDbResource<Laptop[]>('laptops', (col) =>
      col.get()
          .where({in_stock: true})
          .sort([{field: 'price', order: 'asc'}])
          .exec() as Promise<Laptop[]>
  );
}
```

### Imperative access — `moltendbClient()`

Use `moltendbClient()` for mutations and one-off queries triggered by user actions:

```typescript
import {Component} from '@angular/core';
import {moltendbClient} from '@moltendb-web/angular';

@Component({...})
export class AdminComponent {
  private client = moltendbClient();

  async addLaptop() {
    await this.client.collection('laptops').set({
      lp_new: {brand: 'Framework', model: 'Laptop 16', price: 1049, in_stock: true}
    }).exec();
    // Any moltenDbResource watching 'laptops' refreshes automatically
  }
}
```

---

## Hooks

### `moltendbClient()`

Returns the `MoltenDbClient` instance for imperative database access. Must be called in an injection context.

### `moltenDbResource<T>(collection, queryFn, options?)`

Creates a reactive resource bound to a collection. Automatically re-fetches when the collection is mutated. Must be
called in an injection context.

Accepts an optional third `options` argument:

| Option         | Type | Default     | Description                                                                                                 |
|----------------|------|-------------|---------------------------------------------------------------------------------------------------------------|
| `initialValue` | `T`  | `undefined` | Seeds the `value` signal before the first fetch resolves in the browser, and is what `value()` stays at on the server (no fetch is ever attempted there) |

```typescript
const laptops = moltenDbResource<Laptop[]>('laptops', (col) => col.get().exec() as Promise<Laptop[]>, {
  initialValue: []
});
// laptops.value() is `[]` immediately — in the browser, before the first fetch resolves,
// and forever on the server, instead of `undefined`.
```

Returns a `MoltenDbResource<T>` with three readonly signals:

| Signal      | Type                     | Description                         |
|-------------|--------------------------|-------------------------------------|
| `value`     | `Signal<T \| undefined>` | The latest query result, or `options?.initialValue` (defaults to `undefined`) before the first fetch resolves |
| `isLoading` | `Signal<boolean>`        | `true` while a fetch is in progress |
| `error`     | `Signal<any \| null>`    | The last error, or `null` if none   |

### `moltenDbIsLeader()`

Returns `true` if the current tab is the **Leader** — the tab running the WASM worker and performing actual writes.
Other tabs act as follower proxies. Must be called in an injection context.

```typescript
import {Component} from '@angular/core';
import {moltenDbIsLeader} from '@moltendb-web/angular';

@Component({
  selector: 'app-tab-badge',
  template: `<span>{{ isLeader() ? '👑 Leader' : '🔗 Follower' }}</span>`
})
export class TabBadgeComponent {
  isLeader = moltenDbIsLeader;
}
```

### `moltenDbTerminate()`

Terminates the MoltenDb worker. Must be called in an injection context.

### `moltenDbClearOpfs()` *(v2.0.0)*

Flushes and closes the OPFS sync handle. Call this **before** `moltenDbTerminate()` — without it the browser throws a "
No modification allowed" error when removing the OPFS directory. Must be called in an injection context.

```typescript
import { Component } from '@angular/core';
import { moltenDbClearOpfs, moltenDbTerminate } from '@moltendb-web/angular';

@Component({
  selector: 'app-reset-button',
  template: `<button (click)="handleReset()">🗑 Reset All Data</button>`
})
export class ResetButtonComponent {
  private clearOpfs = moltenDbClearOpfs;
  private terminate = moltenDbTerminate;

  async handleReset() {
    if (!confirm('This will delete all local data and reload. Continue?')) return;
    // 1. Flush and close the OPFS sync handle
    await this.clearOpfs();
    // 2. Now safe to terminate the worker
    this.terminate();
    location.reload();
  }
}
```

### `moltenDbEvents(listener)` *(v2.0.0 — auto-unsubscribe)*

Subscribes to real-time mutation events. The `listener` is called with a `DbEvent` whenever any document is created,
updated, deleted, or a collection is dropped. The subscription is **automatically cleaned up** when the injection
context (component/service) is destroyed — no `ngOnDestroy` or manual unsubscription needed. Must be called in an
injection context.

```typescript
import {Component} from '@angular/core';
import {moltenDbEvents} from '@moltendb-web/angular';
import type {DbEvent} from '@moltendb-web/angular';

@Component({
  selector: 'app-live-feed',
  template: `
    <ul>
      @for (e of events; track e) {
        <li>{{ e.event }} — {{ e.collection }}/{{ e.key }}</li>
      }
    </ul>
  `
})
export class LiveFeedComponent {
  events: DbEvent[] = [];

  constructor() {
    moltenDbEvents((evt) => {
      this.events = [evt, ...this.events].slice(0, 50);
    });
    // ✅ No ngOnDestroy needed — subscription is auto-cleaned up when component is destroyed
  }
}
```

---

## API Reference

| Export                                  | Type           | Description                                                                                                            |
|-----------------------------------------|----------------|------------------------------------------------------------------------------------------------------------------------|
| `provideMoltenDb(config)`               | Provider       | Registers MoltenDb as an Angular environment provider                                                                  |
| `moltendbClient()`                      | Injection hook | Returns the `MoltenDbClient` instance                                                                                  |
| `moltenDbIsLeader()`                    | Injection hook | Returns `true` if the current tab is the Leader                                                                        |
| `moltenDbTerminate()`                   | Injection hook | Terminates the MoltenDb worker                                                                                         |
| `moltenDbClearOpfs()`                   | Injection hook | *(v2.0.0)* Flush and close the OPFS sync handle — call before `moltenDbTerminate()`                                    |
| `moltenDbResource(collection, queryFn, options?)` | Injection hook | Reactive resource with `value`, `isLoading`, `error` signals, auto-refresh, and an optional `initialValue`             |
| `moltenDbEvents(listener)`              | Injection hook | *(v2.0.0)* Subscribe to real-time `DbEvent` mutation events; auto-unsubscribes when the injection context is destroyed |
| `DbEvent`                               | Type           | Event object emitted on mutations: `{ event, collection, key, new_v }`                                                 |
| `AngularMoltenDbOptions`                | Interface      | Config passed to `provideMoltenDb` — extends `MoltenDbOptions` with a required `name` field                            |
| `MoltenDbResource<T>`                   | Interface      | Return type of `moltenDbResource`: `{ value, isLoading, error }` signals                                               |
| `MoltenDbResourceOptions<T>`            | Interface      | Options accepted by `moltenDbResource`: `{ initialValue? }`                                                            |

---

## Configuration

`AngularMoltenDbOptions` extends the core `MoltenDbOptions` with one required field:

| Option              | Type                | Default      | Description                                                                                                                                           |
|---------------------|---------------------|--------------|-------------------------------------------------------------------------------------------------------------------------------------------------------|
| `name`              | `string`            | **required** | Database name (used as the OPFS directory name)                                                                                                       |
| `inMemory`          | `boolean`           | `false`      | Run entirely in RAM — no OPFS writes. Data persists as long as at least one tab is open; any tab refresh or close wipes the shared store for all tabs |
| `encryptionKey`     | `string`            | `undefined`  | Password for at-rest encryption. If omitted, data is stored as plain JSON                                                                             |
| `writeMode`         | `'async' \| 'sync'` | `'async'`    | Storage write mode: `'async'` for high throughput or `'sync'` for durable writes                                                                      |
| `maxBodySize`       | `number`            | `undefined`  | Maximum request body size in bytes                                                                                                                    |
| `maxKeysPerRequest` | `number`            | `1000`       | Maximum number of keys allowed per JSON request                                                                                                       |
| `workerUrl`         | `string \| URL`     | `undefined`  | Custom URL or path to `moltendb-worker.js`                                                                                                            |

---

## Server-Side Rendering (SSR)

`MoltenDbService` detects whether it is running in the browser or on the server (`PLATFORM_ID` / `isPlatformBrowser`)
and **never boots WASM, OPFS, or the Web Locks API outside the browser**. You no longer need to guard every
MoltenDb-using route yourself just to avoid a server crash — the library does it internally:

- **`moltendbClient()` / `db` / `client`** — on the server these are lightweight no-op stubs with the same public
  shape as the real implementations, so you never need `?.` to call them. Builder chains keep working synchronously
  (`.collection('x').set({...})`, `.get()`, `.delete().keys('a')`, `.sort([...])`, etc.), but the terminal `.exec()`
  call always rejects with a clear, actionable error:
  `"[MoltenDb] MoltenDb is not available in a server-side rendering context."` — no hang, no synchronous throw
  mid-chain.
- **`moltenDbResource()`** — resolves synchronously to a documented empty state on the server: `isLoading()` is
  `false`, `error()` is `null`, and `value()` is `options?.initialValue` (or `undefined` if you didn't pass one). No
  fetch is attempted, so templates using `@if (resource.isLoading())` / `@if (resource.value(); as list)` /
  `@if (resource.error())` render their empty/no-data branch immediately with no console errors about
  `navigator.locks`, WASM, or OPFS. Pass `{ initialValue: [] }` for list-returning `queryFn`s to get a typed empty
  array on the server instead of `undefined`.

There is **no public readiness API** — no `isReady` getter on the service and no standalone `moltenDbReady()`
function is exported (or planned). `isReady` is a private, internal implementation detail used only by
`moltenDbResource()` to know when it's safe to fetch; it is intentionally not part of the public API surface. Gate UI
on the database instead through the `moltenDbResource()` signals shown above:

```typescript
import {Component} from '@angular/core';
import {moltenDbResource} from '@moltendb-web/angular';

@Component({
  selector: 'app-greetings',
  template: `
    @if (greetings.isLoading()) {
      <p>⚙ Loading…</p>
    }
    @if (greetings.value(); as list) {
      <ul>
        @for (item of list; track item._key) {
          <li>{{ item.text }}</li>
        }
      </ul>
    }
    @if (greetings.error()) {
      <p class="error">{{ greetings.error().message }}</p>
    }
  `
})
export class GreetingsComponent {
  greetings = moltenDbResource('greetings', (col) => col.get().exec());
}
```

On the server this renders the "no data yet" branch immediately (nothing matches `isLoading()`/`error()`, and
`value()` is `undefined` since no `initialValue` was passed here); in the browser it behaves exactly as before,
becoming reactive once MoltenDb boots.

Because of this, excluding MoltenDb-using routes from prerendering (e.g. `RenderMode.Client` in
`app.routes.server.ts`) is now a **recommendation for a better first paint**, not a requirement to avoid a
build/SSR crash.

## Notes

- `provideMoltenDb()` uses Angular's `APP_INITIALIZER` to block app bootstrap until the database is ready — no need to
  check a readiness flag in most components. This only applies in the browser; on the server MoltenDb is never
  booted, so there is nothing to wait for.
- Multiple apps using the **same `name`** will share the same underlying OPFS storage and sync across tabs via the
  built-in leader/follower mechanism.
- `moltenDbResource` re-fetches automatically when the bound collection is mutated by any tab — no manual refresh
  needed.
