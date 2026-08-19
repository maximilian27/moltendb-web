---
"@moltendb-web/angular": minor
---

feat: `moltenDbResource()` accepts an optional `initialValue` via a new third `options` argument.

- `moltenDbResource(collection, queryFn, { initialValue })` seeds the `value` signal with `initialValue` instead of always defaulting to `undefined`.
- In the browser, `value()` starts at `initialValue` and is overwritten once the first fetch resolves (or a later refetch completes) — refetch semantics are otherwise unchanged.
- On the server (SSR/prerendering), `value()` now returns `initialValue` (still synchronous, still `isLoading() === false` and `error() === null`) instead of always `undefined` — e.g. pass `{ initialValue: [] }` for list-returning `queryFn`s to get a typed empty array.
- The `value` signal's type remains `Signal<T | undefined>` (backward compatible) whether or not `initialValue` is supplied.
