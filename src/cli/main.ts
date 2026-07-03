/*
**  nano-banana -- Deterministic Image-Generation CLI for LLM Agents
**  Copyright (c) 2026 Matthias Brusdeylins
**  Licensed under MIT license <https://spdx.org/licenses/MIT>
**
**  cli/main: the command-line entry point. Parses arguments, resolves the
**  model and a model-validated aspect ratio, resolves the API key from the
**  environment, and emits exactly one JSON envelope on stdout so a calling
**  agent can parse the outcome deterministically. `--video` switches from
**  the Nano Banana image models to the Veo video models.
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
import {
    VIDEO_MODELS, DEFAULT_VIDEO_MODEL, generateVideo, videoAspectRatiosForModel,
    videoResolutionsForModel, videoDurationsForModel, isVideoResolution, isVideoDuration,
    type VideoResolution, type VideoDuration, type VideoGenerateInput
} from "../core/video.js"
import { isAspectRatio, type AspectRatio } from "../core/aspect.js"
import { readInputImage, MAX_INPUT_IMAGES, type InputImage } from "../infra/imagefile.js"

/**  print each model with its supported resolutions and aspect ratios  */
const listModels = (): void => {
    console.log("Image models (Nano Banana tiers):")
    for (const m of MODELS) {
        const flag   = m.id === DEFAULT_MODEL ? "  (default)" : ""
        const ratios = aspectRatiosForModel(m.id)
        console.log("")
        console.log(`${m.id}  (${m.name})${flag}`)
        console.log(`  resolutions: ${m.imageSizes.join(", ")}`)
        console.log(`  ratios (${ratios.length}): ${ratios.join(", ")}`)
    }
    console.log("")
    console.log("Video models (Veo tiers, use with --video):")
    for (const m of VIDEO_MODELS) {
        const flag = m.id === DEFAULT_VIDEO_MODEL ? "  (default)" : ""
        console.log("")
        console.log(`${m.id}  (${m.name})${flag}`)
        console.log(`  resolutions: ${m.resolutions.join(", ")}`)
        console.log(`  ratios (${m.aspectRatios.length}): ${m.aspectRatios.join(", ")}`)
        console.log(`  durations (s): ${m.durations.join(", ")}`)
    }
}

/**  the help text  */
const HELP = `nano-banana ${VERSION} -- image/video generation via Google Nano Banana + Veo (Gemini)

Usage:
  nano-banana --prompt "..." --output image.png [--aspect-ratio 16:9]
  nano-banana --prompt "edit: ..." --input ref.png --output out.png
  nano-banana --video --prompt "..." --output clip.mp4 [--resolution 1080p]
  nano-banana --list-models

Options:
  --prompt <text>         generation prompt (English recommended)         [required]
  --output <path>         output path: PNG (image) or MP4 (--video)       [required]
  --input <path>          reference image; repeatable (1-${MAX_INPUT_IMAGES}) for image-to-image,
                          exactly 1 for image-to-video (--video)
  --aspect-ratio <r>      image: 10 standard ratios; gemini-3.1-flash-image adds 4
                          ultra-wide/tall. video: 16:9; Veo 3.1 adds 9:16
                          (see --list-models)   (default 16:9)
  --image-size <s>        image output resolution; model-dependent (see --list-models)
                          (default: the model's own default, ~1K)
  --video                 generate a video (MP4) via Veo instead of an image
  --resolution <r>        video resolution: 720p or 1080p (--video only)
                          (default: the model's own default, 720p)
  --duration <s>          video clip duration in seconds; model-dependent (--video
                          only; Veo 3.0: 8; Veo 3.1: 4/6/8) (default: model's own)
  --negative-prompt <t>   what the video must NOT contain (--video only)
  --model <id>            Gemini model id (default: image ${DEFAULT_MODEL},
                          video ${DEFAULT_VIDEO_MODEL})
  --key-file <path>       read API key from a file (override; default: environment)
  --list-models           list models with supported ratios/resolution and exit
  --version               print version and exit
  --help                  print this help and exit

API key:
  Read from GEMINI_API_KEY or GOOGLE_API_KEY. Never stored in the project.
  --key-file overrides with a file outside the repo (CI secrets).

Image models (see --list-models):
  gemini-2.5-flash-image   Nano Banana 1     10 ratios   1K
  gemini-3-pro-image       Nano Banana Pro   10 ratios   1K/2K/4K        (default)
  gemini-3.1-flash-image   Nano Banana 2     14 ratios   512/1K/2K/4K
  Standard ratios (10): 1:1, 4:5, 5:4, 2:3, 3:2, 3:4, 4:3, 9:16, 16:9, 21:9
  Nano Banana 2 adds (4): 1:4, 4:1, 1:8, 8:1   (ultra-wide / ultra-tall)

Video models (see --list-models):
  veo-3.0-generate-001          Veo 3         16:9        720p/1080p   8s   (default)
  veo-3.0-fast-generate-001     Veo 3 Fast    16:9        720p/1080p   8s
  veo-3.1-generate-preview      Veo 3.1       16:9/9:16   720p/1080p   4/6/8s
  veo-3.1-fast-generate-preview Veo 3.1 Fast  16:9/9:16   720p/1080p   4/6/8s
  veo-3.1-lite-generate-preview Veo 3.1 Lite  16:9/9:16   720p/1080p   4/6/8s
  All Veo 3 tiers generate native audio. Generation takes 1-6 minutes.

Corporate proxy (Zscaler) TLS:
  Trusted automatically from the OS store; override with NODE_EXTRA_CA_CERTS or
  NODE_OPTIONS=--use-system-ca if the Zscaler root is elsewhere.

Output (exactly one JSON envelope on stdout; notes go to stderr):
  ok:    {"status":"ok","file":"...","aspect_ratio":"...","model":"..."}
  error: {"status":"error","message":"..."}

Exit codes:
  0  success
  2  usage error (missing or invalid arguments)
  1  runtime error (API, network, or no image/video returned)`

/**
 *  Resolve the requested `--aspect-ratio`, validated against the chosen
 *  model's supported set.
 *
 *  @param values - the parsed option values
 *  @param model - the resolved Gemini model id
 *  @param allowed - the aspect ratios the model supports
 *  @returns the resolved aspect ratio
 */
const resolveAspectRatio = (values: CliValues, model: string, allowed: readonly AspectRatio[]): AspectRatio => {
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

    const video = values["video"] === true
    const model = values["model"] ?? (video ? DEFAULT_VIDEO_MODEL : DEFAULT_MODEL)

    /*  the video-only options are usage errors in image mode, and vice versa  */
    if (!video) {
        for (const flag of ["resolution", "duration", "negative-prompt"] as const)
            if (values[flag] !== undefined)
                return fail(`--${flag} requires --video`, 2)
    }
    else if (values["image-size"] !== undefined)
        return fail("--image-size is an image option; use --resolution with --video", 2)

    const aspectRatio = resolveAspectRatio(values, model,
        video ? videoAspectRatiosForModel(model) : aspectRatiosForModel(model))

    let imageSize: ImageSize | undefined
    const sizeRaw = values["image-size"]
    if (sizeRaw !== undefined) {
        const allowed = imageSizesForModel(model)
        if (!isImageSize(sizeRaw) || !allowed.includes(sizeRaw))
            return fail(`--image-size "${sizeRaw}" not supported by ${model} (allowed: ${allowed.join(", ")})`, 2)
        imageSize = sizeRaw
    }

    let resolution: VideoResolution | undefined
    const resolutionRaw = values["resolution"]
    if (resolutionRaw !== undefined) {
        const allowed = videoResolutionsForModel(model)
        if (!isVideoResolution(resolutionRaw) || !allowed.includes(resolutionRaw))
            return fail(`--resolution "${resolutionRaw}" not supported by ${model} (allowed: ${allowed.join(", ")})`, 2)
        resolution = resolutionRaw
    }

    let duration: VideoDuration | undefined
    const durationRaw = values["duration"]
    if (durationRaw !== undefined) {
        const allowed = videoDurationsForModel(model)
        const seconds = Number(durationRaw)
        if (!Number.isInteger(seconds) || !isVideoDuration(seconds) || !allowed.includes(seconds))
            return fail(`--duration "${durationRaw}" not supported by ${model} (allowed: ${allowed.join(", ")})`, 2)
        duration = seconds
    }

    let inputImages: InputImage[] | undefined
    const inputPaths = values["input"]
    if (inputPaths !== undefined && inputPaths.length > 0) {
        const maxInputs = video ? 1 : MAX_INPUT_IMAGES
        if (inputPaths.length > maxInputs)
            return fail(`too many --input images: ${inputPaths.length} (max ${maxInputs}${video ? " with --video" : ""})`, 2)
        try {
            inputImages = inputPaths.map(readInputImage)
        }
        catch (err) {
            return fail(err instanceof Error ? err.message : String(err), 2)
        }
    }

    const apiKey = resolveApiKey(values["key-file"])

    /*  trust a corporate Zscaler root from the OS store before the HTTPS call  */
    trustSystemCAs()

    if (video) {
        const input: VideoGenerateInput = { apiKey, prompt, outputPath: output, model, aspectRatio }
        if (resolution !== undefined)
            input.resolution = resolution
        if (duration !== undefined)
            input.durationSeconds = duration
        if (values["negative-prompt"] !== undefined)
            input.negativePrompt = values["negative-prompt"]
        const firstImage = inputImages?.[0]
        if (firstImage !== undefined)
            input.inputImage = firstImage

        const result = await generateVideo(input)
        const envelope: OkEnvelope = {
            status:       "ok",
            file:         result.file,
            aspect_ratio: result.aspectRatio,
            model:        result.model
        }
        if (resolution !== undefined)
            envelope.resolution = resolution
        if (duration !== undefined)
            envelope.duration_seconds = duration
        emitOk(envelope)
        return
    }

    const input: GenerateInput = { apiKey, prompt, outputPath: output, model, aspectRatio }
    if (imageSize !== undefined)
        input.imageSize = imageSize
    if (inputImages !== undefined)
        input.inputImages = inputImages

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
