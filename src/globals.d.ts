/*
**  nano-banana -- Deterministic Image-Generation CLI for LLM Agents
**  Copyright (c) 2026 Matthias Brusdeylins
**  Licensed under MIT license <https://spdx.org/licenses/MIT>
**
**  globals.d.ts: compile-time constants injected by esbuild's `define`. They
**  exist only in the bundled artifact; the source falls back to dev defaults.
*/

/**  CLI version, injected at build time from package.json  */
declare const NANO_VERSION: string

/**  npm package name, injected at build time from package.json  */
declare const NANO_PACKAGE: string
