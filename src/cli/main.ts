/*
**  nano-banana -- Deterministic Image-Generation CLI for LLM Agents
**  Copyright (c) 2026 Matthias Brusdeylins
**  Licensed under MIT license <https://spdx.org/licenses/MIT>
**
**  cli/main: the command-line entry point. Parses arguments, resolves the
**  model and a model-validated aspect ratio, resolves the API key from the
**  environment, and emits exactly one JSON envelope on stdout so a calling
**  agent can parse the outcome deterministically.
*/

import { parseCli, type CliValues } from "../infra/args.js"
import { resolveApiKey } from "../infra/apikey.js"
import { trustSystemCAs } from "../infra/tls.js"
import { emitOk, fail, type OkEnvelope } from "../infra/envelope.js"
import { VERSION, PACKAGE } from "../infra/version.js"
import { generateImage, DEFAULT_MODEL, type GenerateInput } from "../core/generate.js"
import {
    MODELS, aspectRatiosForModel, imageSizesForModel, isImageSize, type ImageSize
} from "../core/models.js"
import { isAspectRatio, type AspectRatio } from "../core/aspect.js"

/**  print each model with its supported resolutions and aspect ratios  */
const listModels = (): void => {
    console.log("Models (Nano Banana tiers):")
    for (const m of MODELS) {
        const flag   = m.id === DEFAULT_MODEL ? "  (default)" : ""
        const ratios = aspectRatiosForModel(m.id)
        console.log("")
        console.log(`${m.id}  (${m.name})${flag}`)
        console.log(`  resolutions: ${m.imageSizes.join(", ")}`)
        console.log(`  ratios (${ratios.length}): ${ratios.join(", ")}`)
    }
}

/**  the help text  */
const HELP = `nano-banana ${VERSION} -- image generation via Google Nano Banana Pro (Gemini)

Usage:
  nano-banana --prompt "..." --output image.png [--aspect-ratio 16:9]
  nano-banana --prompt "..." --output image.png --model gemini-3.1-flash-image
  nano-banana --list-models

Options:
  --prompt <text>         image generation prompt (English recommended)   [required]
  --output <path>         output PNG path                                 [required]
  --aspect-ratio <r>      10 standard ratios; gemini-3.1-flash-image adds 4
                          ultra-wide/tall (see --list-models)   (default 16:9)
  --image-size <s>        output resolution; model-dependent (see --list-models)
                          (default: the model's own default, ~1K)
  --model <id>            Gemini model id (default ${DEFAULT_MODEL})
  --key-file <path>       read API key from a file (override; default: environment)
  --list-models           list models with supported ratios/resolution and exit
  --version               print version and exit
  --help                  print this help and exit

API key:
  Read from GEMINI_API_KEY or GOOGLE_API_KEY. Never stored in the project.
  --key-file overrides with a file outside the repo (CI secrets).

Models (see --list-models):
  gemini-2.5-flash-image   Nano Banana 1     10 ratios   1K
  gemini-3-pro-image       Nano Banana Pro   10 ratios   1K/2K/4K        (default)
  gemini-3.1-flash-image   Nano Banana 2     14 ratios   512/1K/2K/4K
  Standard ratios (10): 1:1, 4:5, 5:4, 2:3, 3:2, 3:4, 4:3, 9:16, 16:9, 21:9
  Nano Banana 2 adds (4): 1:4, 4:1, 1:8, 8:1   (ultra-wide / ultra-tall)

Corporate proxy (Zscaler) TLS:
  Trusted automatically from the OS store; override with NODE_EXTRA_CA_CERTS or
  NODE_OPTIONS=--use-system-ca if the Zscaler root is elsewhere.

Output (exactly one JSON envelope on stdout; notes go to stderr):
  ok:    {"status":"ok","file":"...","aspect_ratio":"...","model":"..."}
  error: {"status":"error","message":"..."}

Exit codes:
  0  success
  2  usage error (missing or invalid arguments)
  1  runtime error (API, network, or no image returned)`

/**
 *  Resolve the requested `--aspect-ratio`, validated against the chosen
 *  model's supported set.
 *
 *  @param values - the parsed option values
 *  @param model - the resolved Gemini model id
 *  @returns the resolved aspect ratio
 */
const resolveAspectRatio = (values: CliValues, model: string): AspectRatio => {
    const allowed  = aspectRatiosForModel(model)
    const explicit = values["aspect-ratio"] ?? "16:9"
    if (!isAspectRatio(explicit) || !allowed.includes(explicit))
        return fail(`--aspect-ratio "${explicit}" not supported by ${model} (allowed: ${allowed.join(", ")})`, 2)
    return explicit
}

/**  parse, dispatch, generate, and print the JSON envelope  */
const main = async (): Promise<void> => {
    const values = parseCli(process.argv.slice(2))

    if (values["help"] === true) {
        console.log(HELP)
        return
    }
    if (values["version"] === true) {
        console.log(`${PACKAGE} ${VERSION}`)
        return
    }
    if (values["list-models"] === true) {
        listModels()
        return
    }

    const prompt = values["prompt"]
    const output = values["output"]
    if (prompt === undefined || output === undefined)
        return fail("--prompt and --output are required (unless --list-models)", 2)

    const model       = values["model"] ?? DEFAULT_MODEL
    const aspectRatio = resolveAspectRatio(values, model)

    let imageSize: ImageSize | undefined
    const sizeRaw = values["image-size"]
    if (sizeRaw !== undefined) {
        const allowed = imageSizesForModel(model)
        if (!isImageSize(sizeRaw) || !allowed.includes(sizeRaw))
            return fail(`--image-size "${sizeRaw}" not supported by ${model} (allowed: ${allowed.join(", ")})`, 2)
        imageSize = sizeRaw
    }

    const apiKey = resolveApiKey(values["key-file"])

    /*  trust a corporate Zscaler root from the OS store before the HTTPS call  */
    trustSystemCAs()

    const input: GenerateInput = { apiKey, prompt, outputPath: output, model, aspectRatio }
    if (imageSize !== undefined)
        input.imageSize = imageSize

    const result = await generateImage(input)
    const envelope: OkEnvelope = {
        status:       "ok",
        file:         result.file,
        aspect_ratio: result.aspectRatio,
        model:        result.model
    }
    if (imageSize !== undefined)
        envelope.image_size = imageSize
    emitOk(envelope)
}

main().catch((err: unknown) => {
    const message = err instanceof Error ? err.message : String(err)
    fail(message)
})
