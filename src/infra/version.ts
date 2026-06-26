/*
**  nano-banana -- Deterministic Image-Generation CLI for LLM Agents
**  Copyright (c) 2026 Matthias Brusdeylins
**  Licensed under MIT license <https://spdx.org/licenses/MIT>
**
**  infra/version: version facts injected at build time, with dev fallbacks
**  for running straight from source.
*/

/**  current CLI version (injected at build time, dev fallback otherwise)  */
export const VERSION: string = typeof NANO_VERSION !== "undefined" ? NANO_VERSION : "0.0.0-dev"

/**  npm package name (injected at build time, dev fallback otherwise)  */
export const PACKAGE: string = typeof NANO_PACKAGE !== "undefined" ? NANO_PACKAGE : "@brusdeylins/nano-banana"
