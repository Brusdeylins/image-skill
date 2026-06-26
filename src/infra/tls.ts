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
**  certificate. It is a no-op on Node versions lacking the system-CA API,
**  where NODE_EXTRA_CA_CERTS / NODE_OPTIONS=--use-system-ca remain the manual
**  fallback.
*/

import { getCACertificates, setDefaultCACertificates } from "node:tls"

/**
 *  Add the OS trust store (incl. a corporate Zscaler root) to the default CA
 *  set. Safe and idempotent: it extends -- never replaces -- the bundled roots
 *  and any NODE_EXTRA_CA_CERTS the user supplied, so public endpoints keep
 *  verifying. Failures are swallowed: the bundled defaults stay in force.
 */
export const trustSystemCAs = (): void => {
    if (typeof getCACertificates !== "function" || typeof setDefaultCACertificates !== "function")
        return
    try {
        const current = getCACertificates("default")
        const system  = getCACertificates("system")
        if (system.length > 0)
            setDefaultCACertificates([...current, ...system])
    }
    catch {
        /*  keep the bundled defaults; NODE_EXTRA_CA_CERTS still applies  */
    }
}
