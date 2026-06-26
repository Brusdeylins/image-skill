/*
**  nano-banana -- Deterministic Image-Generation CLI for LLM Agents
**  Copyright (c) 2026 Matthias Brusdeylins
**  Licensed under MIT license <https://spdx.org/licenses/MIT>
**
**  cli/main: the command-line entry point. Parses arguments, resolves the
**  aspect ratio (from a PowerPoint layout or an explicit value), resolves the
**  API key from the environment, and emits exactly one JSON envelope on
**  stdout so a calling agent can parse the outcome deterministically.
*/

import { parseArgs } from "../infra/args.js"
import { resolveApiKey } from "../infra/apikey.js"
import { trustSystemCAs } from "../infra/tls.js"
import { VERSION, PACKAGE } from "../infra/version.js"
import { generateImage, DEFAULT_MODEL } from "../core/generate.js"
import {
    ASPECT_RATIOS, isAspectRatio,
    LAYOUT_RATIOS, LAYOUT_NAMES, LAYOUT_PLACEHOLDER_RATIOS,
    type AspectRatio
} from "../core/layouts.js"

/**  switches that never take a value  */
const SWITCHES = ["list-layouts", "help", "version"] as const

/**  print the table of layouts that carry an image placeholder  */
const listLayouts = (): void => {
    console.log("Layouts with image placeholders:")
    console.log(`${"Layout".padStart(6)}  ${"Aspect".padStart(6)}  Name`)
    console.log(`${"------".padStart(6)}  ${"------".padStart(6)}  ----`)
    for (const idx of Object.keys(LAYOUT_NAMES).map(Number).sort((a, b) => a - b)) {
        const ratio = LAYOUT_RATIOS[idx] ?? "16:9"
        console.log(`${String(idx).padStart(6)}  ${ratio.padStart(6)}  ${LAYOUT_NAMES[idx]}`)
    }
}

/**  the help text  */
const HELP = `nano-banana ${VERSION} -- image generation via Google Nano Banana Pro (Gemini)

Usage:
  nano-banana --prompt "..." --output image.png [--aspect-ratio 16:9]
  nano-banana --prompt "..." --output image.png --layout 0 [--placeholder 11]
  nano-banana --list-layouts

Options:
  --prompt <text>         image generation prompt (English recommended)   [required]
  --output <path>         output PNG path                                 [required]
  --aspect-ratio <r>      ${ASPECT_RATIOS.join(", ")}   (default 16:9)
  --layout <n>            PowerPoint layout index (overrides --aspect-ratio)
  --placeholder <n>       placeholder index within layout (multi-image layouts)
  --model <id>            Gemini model id (default ${DEFAULT_MODEL})
  --key-file <path>       read API key from a file (override; default: environment)
  --list-layouts          list layouts with image placeholders and exit
  --version               print version and exit
  --help                  print this help and exit

API key:
  Read from GEMINI_API_KEY or GOOGLE_API_KEY. Never stored in the project.

Corporate proxy (Zscaler) TLS:
  Run with  NODE_OPTIONS=--use-system-ca  (Node >= 22, trusts the macOS
  keychain) or  NODE_EXTRA_CA_CERTS=/path/to/zscaler-root.crt.`

/**
 *  Resolve the requested aspect ratio from `--layout`/`--placeholder` or the
 *  explicit `--aspect-ratio`. Notes about the resolution go to stderr so they
 *  never pollute the stdout JSON envelope.
 *
 *  @param options - the parsed `--flag value` options
 *  @returns the resolved aspect ratio
 */
const resolveAspectRatio = (options: Record<string, string>): AspectRatio => {
    const layoutRaw = options["layout"]
    if (layoutRaw !== undefined) {
        const layout = Number(layoutRaw)
        const phRaw = options["placeholder"]
        if (phRaw !== undefined) {
            const key = `${layout}:${Number(phRaw)}`
            const ratio = LAYOUT_PLACEHOLDER_RATIOS[key]
            if (ratio !== undefined) {
                console.error(`Layout ${layout} ph ${Number(phRaw)} -> ${ratio}`)
                return ratio
            }
        }
        const ratio = LAYOUT_RATIOS[layout]
        if (ratio !== undefined) {
            console.error(`Layout ${layout} (${LAYOUT_NAMES[layout] ?? "?"}) -> ${ratio}`)
            return ratio
        }
        console.error(`Warning: Layout ${layout} has no image placeholder, using default 16:9`)
        return "16:9"
    }
    const explicit = options["aspect-ratio"] ?? "16:9"
    if (!isAspectRatio(explicit)) {
        console.error(`Error: invalid --aspect-ratio "${explicit}" (allowed: ${ASPECT_RATIOS.join(", ")})`)
        process.exit(2)
    }
    return explicit
}

/**  parse, dispatch, generate, and print the JSON envelope  */
const main = async (): Promise<void> => {
    const { options, flags } = parseArgs(process.argv.slice(2), SWITCHES)

    if (flags.has("help")) {
        console.log(HELP)
        return
    }
    if (flags.has("version")) {
        console.log(`${PACKAGE} ${VERSION}`)
        return
    }
    if (flags.has("list-layouts")) {
        listLayouts()
        return
    }

    const prompt = options["prompt"]
    const output = options["output"]
    if (prompt === undefined || output === undefined) {
        console.error("Error: --prompt and --output are required (unless --list-layouts)")
        process.exit(2)
    }

    const apiKey = resolveApiKey(options["key-file"])
    const model = options["model"] ?? DEFAULT_MODEL
    const aspectRatio = resolveAspectRatio(options)

    /*  trust a corporate Zscaler root from the OS store before the HTTPS call  */
    trustSystemCAs()

    const result = await generateImage({ apiKey, prompt, outputPath: output, model, aspectRatio })
    console.log(JSON.stringify({
        status: "ok",
        file: result.file,
        aspect_ratio: result.aspectRatio,
        model: result.model
    }))
}

main().catch((err: unknown) => {
    const message = err instanceof Error ? err.message : String(err)
    console.error(JSON.stringify({ status: "error", message }))
    process.exit(1)
})
