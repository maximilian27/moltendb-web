# @moltendb-web/react

Official React hooks wrapper for [MoltenDb](https://github.com/maximilian27/moltendb-web).

## Installation

```bash
npm install @moltendb-web/react @moltendb-web/core @moltendb-web/query
```

## Setup

Wrap your app with `MoltenDbProvider` and pass your config:

```tsx
import { MoltenDbProvider } from '@moltendb-web/react';

function App() {
  return (
    <MoltenDbProvider config={{ name: 'mydb' }}>
      <YourApp />
    </MoltenDbProvider>
  );
}
```

## Hooks

### `useMoltenDb()`

Access the raw `MoltenDbClient` for manual queries or mutations.

```tsx
import { useMoltenDb } from '@moltendb-web/react';

function MyComponent() {
  const client = useMoltenDb();

  const addItem = async () => {
    await client.collection('todos').insert({ text: 'Hello MoltenDb!' });
  };

  return <button onClick={addItem}>Add Todo</button>;
}
```

### `useMoltenDbResource<T>(collection, queryFn)`

Reactively fetch data from a collection. Automatically re-fetches when the collection changes.

```tsx
import { useMoltenDbResource } from '@moltendb-web/react';

interface Todo {
  id: string;
  text: string;
}

function TodoList() {
  const { value: todos, isLoading, error } = useMoltenDbResource<Todo[]>(
    'todos',
    (col) => col.find()
  );

  if (isLoading) return <p>Loading...</p>;
  if (error) return <p>Error: {error.message}</p>;

  return (
    <ul>
      {todos?.map((todo) => <li key={todo.id}>{todo.text}</li>)}
    </ul>
  );
}
```

## API

| Export | Description |
|---|---|
| `MoltenDbProvider` | Context provider — initializes MoltenDb and exposes the client |
| `useMoltenDb()` | Returns the `MoltenDbClient` instance |
| `useMoltenDbResource(collection, queryFn)` | Reactive data fetching hook with `value`, `isLoading`, `error` |
| `useMoltenDbContext()` | Low-level access to the full context (`db`, `client`, `isReady`) |
| `ReactMoltenDbOptions` | Config interface (extends `MoltenDbOptions` with required `name`) |
