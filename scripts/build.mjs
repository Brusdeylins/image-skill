/*
**  nano-banana -- Deterministic Image-Generation CLI for LLM Agents
**  Copyright (c) 2026 Matthias Brusdeylins
**  Licensed under MIT license <https://spdx.org/licenses/MIT>
**
**  build.mjs: bundle the CLI into a single executable ESM file
**  (dst/nano-banana.mjs). Runtime dependencies (the @google/genai SDK) are
**  bundled, so the published artifact and the skill copy need no node_modules
**  at execution time.
*/

import * as esbuild from "esbuild"
import { readFileSync } from "node:fs"

const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"))

await esbuild.build({
    entryPoints: ["src/cli/main.ts"],
    outfile: "dst/nano-banana.mjs",
    bundle: true,
    platform: "node",
    format: "esm",
    target: "node20",
    banner: {
        /*  bundled CommonJS dependencies need require/__dirname in the ESM bundle  */
        js: "#!/usr/bin/env node\n"
            + "import { createRequire as __nanoCreateRequire } from 'node:module';\n"
            + "import { fileURLToPath as __nanoFileURLToPath } from 'node:url';\n"
            + "import { dirname as __nanoDirname } from 'node:path';\n"
            + "const require = __nanoCreateRequire(import.meta.url);\n"
            + "const __filename = __nanoFileURLToPath(import.meta.url);\n"
            + "const __dirname = __nanoDirname(__filename);"
    },
    define: {
        "NANO_VERSION": JSON.stringify(pkg.version),
        "NANO_PACKAGE": JSON.stringify(pkg.name)
    },
    logLevel: "info"
})
