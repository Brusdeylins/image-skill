/*
**  nano-banana -- Deterministic Image-Generation CLI for LLM Agents
**  Copyright (c) 2026 Matthias Brusdeylins
**  Licensed under MIT license <https://spdx.org/licenses/MIT>
**
**  infra/tls: trust the OS trust store by default. Node ships its own CA set
**  and ignores the OS keychain, so behind a TLS-intercepting corporate proxy
**  (Zscaler) the API handshake would fail. This merges the system store --
**  where corporate IT installed the Zscaler root -- into the default CA set at
**  startup, so HTTPS just works WITHOUT any env var, shell prefix or bundled
**  certificate. It is a no-op on Node versions without
**  tls.setDefaultCACertificates, where NODE_EXTRA_CA_CERTS /
**  NODE_OPTIONS=--use-system-ca remain the manual fallback.
**
**  The `node:tls` members are reached through the live module object via
**  `createRequire`, NOT a static `import { setDefaultCACertificates }`: on Node
**  versions where the lexer does not list that symbol as a named export (e.g.
**  22.18), the static named import is a hard ESM load-time SyntaxError that
**  would crash the whole CLI. Property access degrades to the runtime guard.
*/

import { createRequire } from "node:module"

/**  live `node:tls` module object (members may be absent on older Node)  */
const nodeRequire = createRequire(import.meta.url)
const tls = nodeRequire("node:tls") as typeof import("node:tls")

/**
 *  Add the OS trust store (incl. a corporate Zscaler root) to the default CA
 *  set. Safe and idempotent: it extends -- never replaces -- the bundled roots
 *  and any NODE_EXTRA_CA_CERTS the user supplied, so public endpoints keep
 *  verifying. Failures are swallowed: the bundled defaults stay in force.
 */
export const trustSystemCAs = (): void => {
    if (typeof tls.getCACertificates !== "function" || typeof tls.setDefaultCACertificates !== "function")
        return
    try {
        const current = tls.getCACertificates("default")
        const system  = tls.getCACertificates("system")
        if (system.length > 0)
            tls.setDefaultCACertificates([...new Set([...current, ...system])])
    }
    catch {
        /*  keep the bundled defaults; NODE_EXTRA_CA_CERTS still applies  */
    }
}
