/*
**  nano-banana -- Deterministic Image-Generation CLI for LLM Agents
**  Copyright (c) 2026 Matthias Brusdeylins
**  Licensed under MIT license <https://spdx.org/licenses/MIT>
**
**  cli/main: the command-line entry point. Parses arguments, resolves the
**  model and a model-validated aspect ratio, resolves the API key from the
**  environment, and emits exactly one JSON envelope on stdout so a calling
**  agent can parse the outcome deterministically. `--video` switches from
**  the Nano Banana image models to the Omni video models.
*/

import { statSync } from "node:fs"
import { dirname, sep } from "node:path"
import { parseCli, type CliValues } from "../infra/args.js"
import { resolveApiKey } from "../infra/apikey.js"
import { trustSystemCAs } from "../infra/tls.js"
import { emitOk, fail, errorMessage, type OkEnvelope } from "../infra/envelope.js"
import { VERSION, PACKAGE } from "../infra/version.js"
import { generateImage, type GenerateInput } from "../core/generate.js"
import {
    MODELS, DEFAULT_MODEL, aspectRatiosForModel, imageSizesForModel, imageModelInfo
} from "../core/models.js"
import {
    VIDEO_MODELS, DEFAULT_VIDEO_MODEL, generateVideo, videoAspectRatiosForModel,
    videoResolutionsForModel, videoModelInfo,
    type VideoGenerateInput
} from "../core/video.js"
import { readInputImage, MAX_INPUT_IMAGES, MAX_VIDEO_INPUT_IMAGES, MAX_INLINE_REQUEST_BYTES } from "../infra/imagefile.js"
import type { InputImage, GenerateResult } from "../core/types.js"

/**  whether the path exists and is a directory  */
const isDirectory = (path: string): boolean => {
    try {
        return statSync(path).isDirectory()
    }
    catch {
        return false
    }
}

/**  print each model with its ratios and resolutions  */
const listModels = (): void => {
    console.log("Image models (Nano Banana tiers):")
    for (const m of MODELS) {
        const flag = m.id === DEFAULT_MODEL ? "  (default)" : ""
        console.log("")
        console.log(`${m.id}  (${m.name})${flag}`)
        console.log(`  resolutions: ${m.imageSizes.join(", ")}`)
        console.log(`  ratios (${m.aspectRatios.length}): ${m.aspectRatios.join(", ")}`)
    }
    console.log("")
    console.log("Video models (Omni tiers, use with --video):")
    for (const m of VIDEO_MODELS) {
        const flag = m.id === DEFAULT_VIDEO_MODEL ? "  (default)" : ""
        console.log("")
        console.log(`${m.id}  (${m.name})${flag}`)
        console.log(`  resolutions: ${m.resolutions.join(", ")}`)
        console.log(`  ratios (${m.aspectRatios.length}): ${m.aspectRatios.join(", ")}`)
    }
}

/**  the help text  */
const HELP = `nano-banana ${VERSION} -- image/video generation via Google Nano Banana + Omni (Gemini)

Usage:
  nano-banana --prompt "..." --output image.png [--aspect-ratio 16:9]
  nano-banana --prompt "edit: ..." --input ref.png --output out.png
  nano-banana --video --prompt "..." --output clip.mp4 [--resolution 1080p]
  nano-banana --list-models

Options:
  --prompt <text>         generation prompt (English recommended)         [required]
  --output <path>         output path: PNG (image) or MP4 (--video) [required];
                          the parent directory must exist (not a directory)
  --input <path>          reference image; repeatable (1-${MAX_INPUT_IMAGES}) for image-to-image,
                          exactly 1 for image-to-video (--video); at most 7 MiB per
                          image and 20 MB (decimal) in total with the prompt
  --aspect-ratio <r>      model-dependent, see --list-models (default 16:9)
  --image-size <s>        image output resolution; model-dependent (see --list-models)
                          (default: the model's own default)
  --video                 generate a video (MP4) via Omni instead of an image
  --resolution <r>        video resolution; model-dependent (see --list-models)
                          (--video only; default: the model's own default)
  --negative-prompt <t>   what the video must NOT contain (--video only; Omni: appended
                          to the prompt as natural language)
  --model <id>            Gemini model id (default: image ${DEFAULT_MODEL},
                          video ${DEFAULT_VIDEO_MODEL})
  --key-file <path>       read API key from a file (override; default: environment)
  --list-models           list models with ratios and resolutions, then exit
  --version               print version and exit
  --help                  print this help and exit

API key:
  Read from GEMINI_API_KEY or GOOGLE_API_KEY. Never stored in the project.
  The key must be visible ASCII (no whitespace or line breaks inside).
  --key-file overrides with a file outside the repo (CI secrets).

Models:
  Run --list-models for each model's ratios and resolutions. All video tiers
  generate native audio; generation takes 1-6 minutes and gives up after 10
  minutes. The clip length is not controllable.

Corporate proxy (Zscaler) TLS:
  Trusted automatically from the OS store; override with NODE_EXTRA_CA_CERTS or
  NODE_OPTIONS=--use-system-ca if the Zscaler root is elsewhere.

Output (exactly one JSON envelope on stdout; notes go to stderr):
  ok:    {"status":"ok","file":"...","aspect_ratio":"...","model":"...",
          optional: "image_size", "resolution"}
  error: {"status":"error","message":"..."}

Exit codes:
  0  success
  2  usage error (missing or invalid arguments or credentials)
  1  runtime error (API, network, or no image/video returned)`

/**
 *  Resolve a string option against the model's allowed values, matching by
 *  their string form.
 *
 *  @param flag - the flag name including dashes, for the message
 *  @param raw - the raw option value
 *  @param model - the resolved Gemini model id
 *  @param allowed - the values the model supports (never empty)
 *  @returns the allowed value whose string form equals `raw`
 */
const resolveChoice = <T extends string | number>(flag: string, raw: string, model: string, allowed: readonly T[]): T => {
    const hit = allowed.find((v) => String(v) === raw)
    if (hit === undefined)
        return fail(`${flag} "${raw}" not supported by ${model} (allowed: ${allowed.join(", ")})`, 2)
    return hit
}

/**  parse, dispatch, generate, and print the JSON envelope  */
const main = async (): Promise<void> => {
    let values: CliValues
    try {
        values = parseCli(process.argv.slice(2))
    }
    catch (err) {
        return fail(errorMessage(err), 2)
    }

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
    if (prompt.trim() === "")
        return fail("--prompt must not be empty", 2)
    if (output === "")
        return fail("--output must not be empty", 2)

    /*  fail before the paid generation if the result could not be written  */
    if (output.endsWith("/") || output.endsWith(sep) || isDirectory(output))
        return fail(`output path is a directory: ${output}`, 2)
    if (!isDirectory(dirname(output)))
        return fail(`output directory does not exist: ${dirname(output)}`, 2)

    const video = values["video"] === true
    const model = values["model"] ?? (video ? DEFAULT_VIDEO_MODEL : DEFAULT_MODEL)

    /*  the video-only options are usage errors in image mode, and vice versa  */
    if (!video) {
        for (const flag of ["resolution", "negative-prompt"] as const)
            if (values[flag] !== undefined)
                return fail(`--${flag} requires --video`, 2)
    }
    else if (values["image-size"] !== undefined)
        return fail("--image-size is an image option; use --resolution with --video", 2)

    /*  an image model id in video mode (or vice versa) is a usage error  */
    if (video && imageModelInfo(model) !== undefined)
        return fail(`--model "${model}" is an image model; it cannot be used with --video`, 2)
    if (!video && videoModelInfo(model) !== undefined)
        return fail(`--model "${model}" is a video model; add --video to use it`, 2)

    const aspectRatio = resolveChoice("--aspect-ratio", values["aspect-ratio"] ?? "16:9", model,
        video ? videoAspectRatiosForModel(model) : aspectRatiosForModel(model))

    const sizeRaw       = values["image-size"]
    const resolutionRaw = values["resolution"]
    const imageSize     = sizeRaw       !== undefined ? resolveChoice("--image-size", sizeRaw, model, imageSizesForModel(model)) : undefined
    const resolution    = resolutionRaw !== undefined ? resolveChoice("--resolution", resolutionRaw, model, videoResolutionsForModel(model)) : undefined

    let inputImages: InputImage[] | undefined
    const inputPaths = values["input"]
    if (inputPaths !== undefined) {
        const maxInputs = video ? MAX_VIDEO_INPUT_IMAGES : MAX_INPUT_IMAGES
        if (inputPaths.length > maxInputs)
            return fail(`too many --input images: ${inputPaths.length} (max ${maxInputs}${video ? " with --video" : ""})`, 2)
        try {
            inputImages = inputPaths.map(readInputImage)
        }
        catch (err) {
            return fail(errorMessage(err), 2)
        }

        /*  the API limits prompt and inline image bytes together  */
        const inlineBytes = inputImages.reduce((sum, image) => sum + image.data.length, 0) + Buffer.byteLength(prompt)
        if (inlineBytes > MAX_INLINE_REQUEST_BYTES)
            return fail(`inline input too large: ${(inlineBytes / 1_000_000).toFixed(1)} MB exceeds the 20 MB request limit (use fewer or smaller images)`, 2)
    }

    let apiKey: string
    try {
        apiKey = resolveApiKey(values["key-file"])
    }
    catch (err) {
        return fail(errorMessage(err), 2)
    }

    /*  trust a corporate Zscaler root from the OS store before the HTTPS call  */
    trustSystemCAs()

    let result: GenerateResult
    const extra: Partial<OkEnvelope> = {}
    if (video) {
        const input: VideoGenerateInput = { apiKey, prompt, outputPath: output, model, aspectRatio }
        if (resolution !== undefined)
            input.resolution = resolution
        if (values["negative-prompt"] !== undefined && values["negative-prompt"] !== "")
            input.negativePrompt = values["negative-prompt"]
        const firstImage = inputImages?.[0]
        if (firstImage !== undefined)
            input.inputImage = firstImage

        result = await generateVideo(input)
        if (resolution !== undefined)
            extra.resolution = resolution
    }
    else {
        const input: GenerateInput = { apiKey, prompt, outputPath: output, model, aspectRatio }
        if (imageSize !== undefined)
            input.imageSize = imageSize
        if (inputImages !== undefined)
            input.inputImages = inputImages

        result = await generateImage(input)
        if (imageSize !== undefined)
            extra.image_size = imageSize
    }
    emitOk({ status: "ok", file: result.file, aspect_ratio: result.aspectRatio, model: result.model, ...extra })
}

main().catch((err: unknown) => {
    fail(errorMessage(err))
})
