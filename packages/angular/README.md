# @moltendb-web/angular

Official Angular integration for [MoltenDb](https://github.com/maximilian27/moltendb-web), providing a seamless reactive developer experience using modern Angular Signals.

> **Requirements:** Angular **17 or higher**. This library uses Angular Signals and standalone APIs introduced in Angular 17.

---

## Demo

See the library in action with a real-world demo application:

- 🔗 **Demo repo:** [github.com/maximilian27/moltendb-angular](https://github.com/maximilian27/moltendb-angular)
- ⚡ **StackBlitz:** [Open in StackBlitz](https://stackblitz.com/~/github.com/maximilian27/moltendb-angular)
- 🌠 **Live demo:** [moltendb-angular.maximilian-both27.workers.dev/laptops](https://moltendb-angular.maximilian-both27.workers.dev/laptops)

---

## Installation

```bash
npm install @moltendb-web/angular
```

`@moltendb-web/core` and `@moltendb-web/query` are automatically installed as dependencies — no need to install them separately.

---

## Step 1: Configure Assets

MoltenDb runs its database engine inside a background Web Worker and relies on WebAssembly (WASM). You must tell Angular to serve these compiled files as public assets.

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
import { ApplicationConfig } from '@angular/core';
import { provideMoltenDb } from '@moltendb-web/angular';

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

Use `moltenDbResource` to bind data to your template. It handles loading states, errors, and live collection updates automatically.

```typescript
import { Component } from '@angular/core';
import { moltenDbResource } from '@moltendb-web/angular';

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
      .where({ in_stock: true })
      .sort([{ field: 'price', order: 'asc' }])
      .exec() as Promise<Laptop[]>
  );
}
```

### Imperative access — `moltendbClient()`

Use `moltendbClient()` for mutations and one-off queries triggered by user actions:

```typescript
import { Component } from '@angular/core';
import { moltendbClient } from '@moltendb-web/angular';

@Component({ ... })
export class AdminComponent {
  private client = moltendbClient();

  async addLaptop() {
    await this.client.collection('laptops').set({
      lp_new: { brand: 'Framework', model: 'Laptop 16', price: 1049, in_stock: true }
    }).exec();
    // Any moltenDbResource watching 'laptops' refreshes automatically
  }
}
```

---

## Hooks

### `moltendbClient()`

Returns the `MoltenDbClient` instance for imperative database access. Must be called in an injection context.

### `moltenDbResource<T>(collection, queryFn)`

Creates a reactive resource bound to a collection. Automatically re-fetches when the collection is mutated. Must be called in an injection context.

Returns a `MoltenDbResource<T>` with three readonly signals:

| Signal | Type | Description |
|---|---|---|
| `value` | `Signal<T \| undefined>` | The latest query result |
| `isLoading` | `Signal<boolean>` | `true` while a fetch is in progress |
| `error` | `Signal<any \| null>` | The last error, or `null` if none |

### `moltenDbReady()`

Returns `true` once MoltenDb has finished initialising. Useful for gating UI until the database is ready. Must be called in an injection context.

```typescript
import { Component } from '@angular/core';
import { moltenDbReady } from '@moltendb-web/angular';

@Component({
  selector: 'app-shell',
  template: `
    @if (!isReady()) {
      <p>⚙ Initialising database…</p>
    } @else {
      <ng-content />
    }
  `
})
export class AppShellComponent {
  isReady = moltenDbReady;
}
```

### `moltenDbIsLeader()`

Returns `true` if the current tab is the **Leader** — the tab running the WASM worker and performing actual writes. Other tabs act as follower proxies. Must be called in an injection context.

```typescript
import { Component } from '@angular/core';
import { moltenDbIsLeader } from '@moltendb-web/angular';

@Component({
  selector: 'app-tab-badge',
  template: `<span>{{ isLeader() ? '👑 Leader' : '🔗 Follower' }}</span>`
})
export class TabBadgeComponent {
  isLeader = moltenDbIsLeader;
}
```

### `moltenDbTerminate()`

Terminates the MoltenDb worker. You must call this before clearing OPFS storage to avoid file-lock conflicts. Must be called in an injection context.

```typescript
import { Component } from '@angular/core';
import { moltenDbTerminate } from '@moltendb-web/angular';

@Component({
  selector: 'app-reset-button',
  template: `<button (click)="handleReset()">🗑 Reset All Data</button>`
})
export class ResetButtonComponent {
  private terminate = moltenDbTerminate;

  async handleReset() {
    if (!confirm('Delete all local data?')) return;
    this.terminate();
    const root = await navigator.storage.getDirectory();
    await root.removeEntry('mydb', { recursive: true });
    location.reload();
  }
}
```

### `moltenDbEvents(listener)`

Subscribes to real-time mutation events. The `listener` is called with a `DbEvent` whenever any document is created, updated, deleted, or a collection is dropped. Returns an unsubscribe function — call it in `ngOnDestroy` to prevent memory leaks. Must be called in an injection context.

```typescript
import { Component, OnDestroy } from '@angular/core';
import { moltenDbEvents } from '@moltendb-web/angular';
import type { DbEvent } from '@moltendb-web/angular';

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
export class LiveFeedComponent implements OnDestroy {
  events: DbEvent[] = [];
  private unsub: () => void;

  constructor() {
    this.unsub = moltenDbEvents((evt) => {
      this.events = [evt, ...this.events].slice(0, 50);
    });
  }

  ngOnDestroy() {
    this.unsub();
  }
}
```

---

## API Reference

| Export | Type | Description |
|---|---|---|
| `provideMoltenDb(config)` | Provider | Registers MoltenDb as an Angular environment provider |
| `moltendbClient()` | Injection hook | Returns the `MoltenDbClient` instance |
| `moltenDbReady()` | Injection hook | Returns `true` once MoltenDb has finished initialising |
| `moltenDbIsLeader()` | Injection hook | Returns `true` if the current tab is the Leader |
| `moltenDbTerminate()` | Injection hook | Terminates the MoltenDb worker — call before clearing OPFS storage |
| `moltenDbResource(collection, queryFn)` | Injection hook | Reactive resource with `value`, `isLoading`, `error` signals and auto-refresh |
| `moltenDbEvents(listener)` | Injection hook | Subscribe to real-time `DbEvent` mutation events; returns unsubscribe function |
| `DbEvent` | Type | Event object emitted on mutations: `{ event, collection, key, new_v }` |
| `AngularMoltenDbOptions` | Interface | Config passed to `provideMoltenDb` — extends `MoltenDbOptions` with a required `name` field |
| `MoltenDbResource<T>` | Interface | Return type of `moltenDbResource`: `{ value, isLoading, error }` signals |

---

## Configuration

`AngularMoltenDbOptions` extends the core `MoltenDbOptions` with one required field:

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

---

## Notes

- `provideMoltenDb()` uses Angular's `APP_INITIALIZER` to block app bootstrap until the database is ready — no need to check a `isReady` flag in most components.
- Multiple apps using the **same `name`** will share the same underlying OPFS storage and sync across tabs via the built-in leader/follower mechanism.
- `moltenDbResource` re-fetches automatically when the bound collection is mutated by any tab — no manual refresh needed.
