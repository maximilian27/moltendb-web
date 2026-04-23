# @moltendb-web/angular

The official Angular integration for MoltenDb, providing a seamless, highly reactive developer experience using modern Angular Signals.

This package bridges the gap between MoltenDb's powerful Web Worker/WASM engine and your Angular UI, offering auto-updating data resources, built-in loading states, and elegant functional dependency injection.

Beyond querying a database, you can use MoltenDb as a **persistent state manager** for your Angular application. Because all state is written to OPFS, it survives page reloads, browser crashes, and unexpected connection loss — your users will never lose their work.

> **Requirements:** Angular **17 or higher** is required. This library uses Angular Signals and standalone APIs introduced in Angular 17. If this library generates enough interest, a legacy Angular library using RxJS may be created in the future.

---

## Demo

See the library in action with a real-world demo application:

- 🔗 **Demo repo:** [github.com/maximilian27/moltendb-angular](https://github.com/maximilian27/moltendb-angular)
- ⚡ **StackBlitz:** [Open in StackBlitz](https://stackblitz.com/~/github.com/maximilian27/moltendb-angular)
- 🌐 **Live demo:** [moltendb-angular.maximilian-both27.workers.dev/laptops](https://moltendb-angular.maximilian-both27.workers.dev/laptops)

The demo app showcases two real-world scenarios:
- **`/laptops`** — A fully-featured data table with filtering, sorting, column visibility, field projection, and reactive summary stats using `moltenDbResource`.
- **`/stress-test`** — A benchmarking page measuring MoltenDB CRUD performance (bulk writes, reads, filtered/sorted queries, updates, and deletes) displayed as ops/sec.

---

## Installation

```bash
npm install @moltendb-web/angular
```

---

## Step 1: Configure Assets (Crucial)

MoltenDb runs its database engine inside a background Web Worker and relies on WebAssembly (WASM). You must tell Angular to serve these compiled files as public assets so the browser can load them.

Update the `assets` array in your `angular.json` to include the MoltenDb distribution files:

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

Initialize MoltenDb in your app's root configuration (`app.config.ts`). This boots the engine, handles leader election across tabs, and makes the database available to your entire application.

```typescript
import { ApplicationConfig } from '@angular/core';
import { provideMoltenDb } from '@moltendb-web/angular';

export const appConfig: ApplicationConfig = {
  providers: [
    provideMoltenDb({
      name: 'local_test_db',
      workerUrl: '/moltendb-worker.js',
      
      // 🚀 New Hybrid Bitcask & Security Properties
      hotThreshold: 25000,          // Keep up to 25k docs in RAM per collection
      encryptionKey: 'user-secret', // Enable at-rest encryption in OPFS
      writeMode: 'sync',            // Use 'sync' for maximum durability

      // 🛡️ Server Parity & Safety Flags
      maxBodySize: 10485760,        // 10MB limit
      rateLimitRequests: 100,
      rateLimitWindow: 60
    })
  ]
};
```

---

## Step 3: Fetching and Mutating Data

This library provides two distinct ways to interact with your database, depending on whether you are binding data to the UI or performing background mutations.

### 1. The Reactive Way: `moltenDbResource`

Use `moltenDbResource` when you want to display data in your template. It automatically handles loading states, catches errors, and listens for live database changes to keep your UI instantly synced across tabs.

It pre-binds the collection for you, keeping your queries incredibly clean. The query function receives the pre-bound `collection` and the full `client` as arguments:

```typescript
import { Component } from '@angular/core';
import { moltenDbResource } from '@moltendb-web/angular';

interface UserDoc {
  _key: string;
  name: string;
  role: string;
}

@Component({
  selector: 'app-users',
  template: `
    @if (users.isLoading() && !users.value()) {
      <p>Loading...</p>
    }

    @if (users.value(); as userList) {
      <ul>
        @for (user of userList; track user._key) {
          <li>{{ user.name }} ({{ user.role }})</li>
        }
      </ul>
    }

    @if (users.error()) {
      <div class="alert">{{ users.error().message }}</div>
    }
  `
})
export class UsersComponent {
  // ⚡ The resource automatically fetches and updates when 'users' changes!
  users = moltenDbResource<UserDoc[]>('users', async (collection) => {
    console.log('Fetching users...');
    const result = await collection.get().exec();
    return result as unknown as UserDoc[];
  });
}
```

The returned `MoltenDbResource<T>` object exposes three readonly signals:

| Signal | Type | Description |
|---|---|---|
| `value` | `Signal<T \| undefined>` | The latest query result |
| `isLoading` | `Signal<boolean>` | `true` while a fetch is in progress |
| `error` | `Signal<any \| null>` | The last error, or `null` if none |

### 2. The Imperative Way: `moltendbClient()`

Use the `moltendbClient()` injection hook when you need to write data, perform one-off queries in response to user actions (like button clicks), or run complex logic outside of the reactive UI flow.

```typescript
import { Component } from '@angular/core';
import { moltendbClient } from '@moltendb-web/angular';

@Component({
  // ...
})
export class AdminComponent {
  // ⚡ Grab direct, imperative access to the Query Client
  private client = moltendbClient();

  async addUser() {
    const randomId = Math.random().toString(36).substring(2, 9);

    // Direct, imperative database mutation
    await this.client.collection('users').set({
      [randomId]: {
        name: 'Angular Dev ' + randomId,
        role: 'Admin'
      }
    }).exec();

    // Note: Any moltenDbResource listening to the 'users' collection
    // will automatically refresh instantly after this set()!
  }

  async getUsers() {
    // One-off imperative commands
    const allUsers = await this.client.collection('users').get().exec();
  }
}
```

---

## API Reference

### `provideMoltenDb(config)`

Registers MoltenDb as an Angular environment provider. Call this once in your root `app.config.ts`.

| Option | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `name` | `string` | **Required** | The name of your database file in OPFS. |
| `workerUrl` | `string \| URL` | `undefined` | Custom path to the `moltendb-worker.js` script. |
| `hotThreshold` | `number` | `50000` | **Hybrid Bitcask Limit:** Maximum documents per collection to keep in RAM. When exceeded, the oldest documents are paged out to OPFS. |
| `encryptionKey`| `string` | `undefined` | **At-Rest Encryption:** If provided, all data in OPFS is encrypted using XChaCha20-Poly1305. |
| `writeMode` | `'async' \| 'sync'` | `'async'` | **Durability vs Speed:** `'async'` is blazing fast (high throughput), while `'sync'` ensures every write is flushed to disk before returning (safer but slower). **Note:** `async` is recommended for most web apps to avoid blocking during heavy write bursts. |
| `maxBodySize` | `number` | `10485760` | **Payload Limit:** Max body size in bytes. |
| `rateLimitRequests`| `number` | `100` | (Server Parity) Max requests allowed per rate-limit window. |
| `rateLimitWindow` | `number` | `60` | (Server Parity) Size of the rate-limit window in seconds. |

### `moltenDbResource<T>(collection, queryFn)`

Creates a reactive resource bound to a collection. Must be called in an injection context (e.g. inside a component class field initializer).

| Parameter | Type | Description |
|---|---|---|
| `collection` | `string` | The collection name to bind to |
| `queryFn` | `(collection, client) => Promise<T>` | Async function receiving the pre-bound collection and the full `MoltenDbClient` |

Returns a `MoltenDbResource<T>` with `value`, `isLoading`, and `error` signals.

### `moltendbClient()`

An injection hook that returns the underlying `MoltenDbClient` instance for imperative database access. Must be called in an injection context.

