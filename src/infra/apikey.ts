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

/**
 *  Resolve the API key. With `keyFile` given, read it; otherwise consult the
 *  environment. Throws with an actionable message when nothing is found, so the
 *  key is never silently empty.
 *
 *  @param keyFile - optional path to a file holding the raw key (override)
 *  @returns the trimmed API key
 */
export const resolveApiKey = (keyFile?: string): string => {
    if (keyFile !== undefined) {
        const key = readFileSync(keyFile, "utf8").trim()
        if (key === "")
            throw new Error(`API key file is empty: ${keyFile}`)
        return key
    }
    for (const name of KEY_ENV_VARS) {
        const value = process.env[name]?.trim()
        if (value !== undefined && value !== "")
            return value
    }
    throw new Error(
        `No API key found. Set ${KEY_ENV_VARS.join(" or ")} in the environment, `
        + "or pass --key-file <path>. The key is NEVER stored in this project.")
}
