/*
**  nano-banana -- Deterministic Image-Generation CLI for LLM Agents
**  Copyright (c) 2026 Matthias Brusdeylins
**  Licensed under MIT license <https://spdx.org/licenses/MIT>
**
**  global-setup: cli.test drives the built bundle, so rebuild it before the
**  run when it is missing or older than the newest source file; fail with a
**  clear message when the rebuild does not produce it.
*/

import { execFileSync } from "node:child_process"
import { existsSync, readdirSync, statSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { join } from "node:path"

/**  the project root  */
const ROOT = fileURLToPath(new URL("..", import.meta.url))

/**  the built CLI bundle  */
const BUNDLE = join(ROOT, "dst", "nano-banana.mjs")

/**  the newest modification time (ms) of any file below `dir`  */
const newest = (dir: string): number =>
    readdirSync(dir, { withFileTypes: true }).reduce((max, entry) => {
        const path = join(dir, entry.name)
        return Math.max(max, entry.isDirectory() ? newest(path) : statSync(path).mtimeMs)
    }, 0)

/**  rebuild the bundle when it is stale or absent  */
export default (): void => {
    const sources = Math.max(
        newest(join(ROOT, "src")),
        statSync(join(ROOT, "package.json")).mtimeMs,
        statSync(join(ROOT, "package-lock.json")).mtimeMs,
        statSync(join(ROOT, "tsconfig.json")).mtimeMs,
        statSync(join(ROOT, "scripts", "build.mjs")).mtimeMs
    )
    if (existsSync(BUNDLE) && statSync(BUNDLE).mtimeMs >= sources)
        return
    try {
        execFileSync(process.execPath, [join(ROOT, "scripts", "build.mjs")], { cwd: ROOT, stdio: "pipe" })
    }
    catch (err) {
        const stderr = String((err as { stderr?: Buffer | string }).stderr ?? "").trim()
        throw new Error(`the CLI bundle ${BUNDLE} is stale or missing and "node scripts/build.mjs" failed: ${stderr}`, { cause: err })
    }
    if (!existsSync(BUNDLE))
        throw new Error(`the CLI bundle ${BUNDLE} is missing after "node scripts/build.mjs"`)
}
