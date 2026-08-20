/*
**  nano-banana -- Deterministic Image-Generation CLI for LLM Agents
**  Copyright (c) 2026 Matthias Brusdeylins
**  Licensed under MIT license <https://spdx.org/licenses/MIT>
**
**  infra/apikey: resolve the selected provider's API key WITHOUT ever
**  bundling it. An explicit `--key-file` path may override the environment
**  for CI that mounts the secret OUTSIDE the project tree.
*/

import { readFileSync } from "node:fs"

/**  supported API providers  */
export type ApiProvider = "gemini" | "atlas"

/**  Gemini environment variables consulted, in order of precedence  */
export const KEY_ENV_VARS = ["GEMINI_API_KEY", "GOOGLE_API_KEY"] as const

/**  Atlas Cloud environment variables consulted, in order of precedence  */
export const ATLAS_KEY_ENV_VARS = ["ATLASCLOUD_API_KEY", "ATLAS_CLOUD_API_KEY"] as const

/**
 *  Resolve the API key. With `keyFile` given, read it; otherwise consult the
 *  environment. Throws with an actionable message when nothing is found, so the
 *  key is never silently empty.
 *
 *  @param keyFile - optional path to a file holding the raw key (override)
 *  @param provider - selected API provider
 *  @returns the trimmed API key
 */
export const resolveApiKey = (keyFile?: string, provider: ApiProvider = "gemini"): string => {
    if (keyFile !== undefined) {
        const key = readFileSync(keyFile, "utf8").trim()
        if (key === "")
            throw new Error(`API key file is empty: ${keyFile}`)
        return key
    }
    const envVars = provider === "atlas" ? ATLAS_KEY_ENV_VARS : KEY_ENV_VARS
    for (const name of envVars) {
        const value = process.env[name]?.trim()
        if (value !== undefined && value !== "")
            return value
    }
    throw new Error(
        `No ${provider === "atlas" ? "Atlas Cloud" : "Gemini"} API key found. `
        + `Set ${envVars.join(" or ")} in the environment, `
        + "or pass --key-file <path>. The key is NEVER stored in this project.")
}
