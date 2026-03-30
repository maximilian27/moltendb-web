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

## Packages

This monorepo contains the following packages. Please refer to their individual READMEs for detailed documentation, usage examples, and API references.

| Package | Description | README |
|---------|-------------|--------|
| [`@moltendb-web/core`](packages/core) | Core WASM engine — low-level database bindings | [README](packages/core/README.md) |
| [`@moltendb-web/query`](packages/query) | Query builder — ergonomic API on top of core | [README](packages/query/README.md) |
