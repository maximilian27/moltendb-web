# MoltenDb Web

<div align="center">
  <img src="assets/logo.png" alt="MoltenDb Logo" width="64"/>

  ### 🌋 The Embedded Database for the Modern Web

  **This is the monorepo for MoltenDb Web — a high-performance Rust engine compiled to WASM with persistent storage via OPFS.**

  [Interactive Demo](https://stackblitz.com/~/github.com/maximilian27/moltendb-wasm-demo?file=package.json) • [Original Repository](https://github.com/maximilian27/MoltenDb) • [License](LICENSE.md)

  [![NPM Version](https://img.shields.io/npm/v/@moltendb-web/core?style=flat-square&color=orange)](https://www.npmjs.com/package/@moltendb-web/core)
  [![License](https://img.shields.io/badge/license-MIT-green?style=flat-square)](LICENSE.md)
  [![WASM](https://img.shields.io/badge/wasm-optimized-magenta?style=flat-square)](https://webassembly.org/)
</div>

---

## Demos

### 🔬 Interactive Query Demo (Core & Query packages)

Explore the full MoltenDb query builder in a live, zero-setup environment:

- ⚡ **StackBlitz:** [Open Interactive Demo](https://stackblitz.com/~/github.com/maximilian27/moltendb-wasm-demo?file=package.json)

This demo lets you test the full query builder API — `get()`, `set()`, `update()`, `delete()`, `.where()`, `.fields()`, `.sort()`, `.joins()`, and more — directly in the browser against a real WASM-powered MoltenDb instance.

### 🅰️ Angular Demo App

A real-world Angular application showcasing the `@moltendb-web/angular` integration:

- 🔗 **Demo repo:** [github.com/maximilian27/moltendb-angular](https://github.com/maximilian27/moltendb-angular)
- ⚡ **StackBlitz:** [Open in StackBlitz](https://stackblitz.com/~/github.com/maximilian27/moltendb-angular)
- 🌐 **Live demo:** [moltendb-angular.maximilian-both27.workers.dev/laptops](https://moltendb-angular.maximilian-both27.workers.dev/laptops)

The demo app showcases two real-world scenarios:
- **`/laptops`** — A fully-featured data table with filtering, sorting, column visibility, field projection, and reactive summary stats using `moltenDbResource`.
- **`/stress-test`** — A benchmarking page measuring MoltenDB CRUD performance (bulk writes, reads, filtered/sorted queries, updates, and deletes) displayed as ops/sec.

---

## Packages

This monorepo contains the following packages. Please refer to their individual READMEs for detailed documentation, usage examples, and API references.

| Package | Description | README |
|---------|-------------|--------|
| [`@moltendb-web/core`](packages/core) | Core WASM engine — low-level database bindings | [README](packages/core/README.md) |
| [`@moltendb-web/query`](packages/query) | Query builder — ergonomic API on top of core | [README](packages/query/README.md) |
| [`@moltendb-web/angular`](packages/angular) | Angular integration — reactive Signals, resources, and DI | [README](packages/angular/README.md) |
