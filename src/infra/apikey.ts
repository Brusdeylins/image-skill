/*
**  nano-banana -- Deterministic Image-Generation CLI for LLM Agents
**  Copyright (c) 2026 Matthias Brusdeylins
**  Licensed under MIT license <https://spdx.org/licenses/MIT>
**
**  infra/apikey: resolve the Gemini API key WITHOUT ever bundling it. The key
**  comes from the environment (`GEMINI_API_KEY` or `GOOGLE_API_KEY`); an
**  explicit `--key-file` path may override it for CI that mounts the secret
**  as a file OUTSIDE the project tree. No key file ships with this package.
*/

import { readFileSync } from "node:fs"

/**  the environment variables consulted, in order of precedence  */
export const KEY_ENV_VARS = ["GEMINI_API_KEY", "GOOGLE_API_KEY"] as const

/**  visible ASCII only: anything else is invalid as an HTTP header value  */
const HEADER_SAFE_KEY = /^[\x21-\x7e]+$/

/**  reject a key undici would refuse as a header value; its error text echoes the value, so check first  */
const assertHeaderSafe = (key: string): string => {
    if (!HEADER_SAFE_KEY.test(key))
        throw new Error("API key contains characters that are not valid in an HTTP header (stray whitespace or line break?)")
    return key
}

/**
 *  Resolve the API key. With `keyFile` given, read it; otherwise consult the
 *  environment. The key value is never echoed in an error message.
 *
 *  @param keyFile - optional path to a file holding the raw key (override)
 *  @returns the trimmed API key
 *  @throws when no key is found, the key file is unreadable or empty, or the
 *          key is not visible ASCII
 */
export const resolveApiKey = (keyFile?: string): string => {
    if (keyFile !== undefined) {
        let raw: string
        try {
            raw = readFileSync(keyFile, "utf8")
        }
        catch (err) {
            throw new Error(`cannot read API key file: ${keyFile}`, { cause: err })
        }
        const key = raw.trim()
        if (key === "")
            throw new Error(`API key file is empty: ${keyFile}`)
        return assertHeaderSafe(key)
    }
    for (const name of KEY_ENV_VARS) {
        const value = process.env[name]?.trim()
        if (value !== undefined && value !== "")
            return assertHeaderSafe(value)
    }
    throw new Error(
        `No API key found. Set ${KEY_ENV_VARS.join(" or ")} in the environment, `
        + "or pass --key-file <path>. The key is NEVER stored in this project.")
}
