/*
**  nano-banana -- Deterministic Image-Generation CLI for LLM Agents
**  Copyright (c) 2026 Matthias Brusdeylins
**  Licensed under MIT license <https://spdx.org/licenses/MIT>
**
**  core/video: the video-generation tiers and the video-generation call
**  against the Gemini API. Gemini Omni Flash runs through the Interactions
**  REST API. This module is the single source of truth for the per-model
**  support. UNVERIFIED: Omni task handling and WEBP input images for
**  Omni are not documented. Docs: https://ai.google.dev/gemini-api/docs/omni
*/

import { randomBytes } from "node:crypto"
import { createWriteStream, renameSync, rmSync } from "node:fs"
import { Readable } from "node:stream"
import { pipeline } from "node:stream/promises"
import type { ReadableStream as WebReadableStream } from "node:stream/web"
import type { AspectRatio } from "./aspect.js"
import type { GenerateResult, InputImage } from "./types.js"

/**  the default Gemini video model (Gemini Omni Flash)  */
export const DEFAULT_VIDEO_MODEL = "gemini-omni-1.1-flash"

/**  the API host  */
const API_HOST = "generativelanguage.googleapis.com"

/**  the only origin the API key may be sent to  */
const API_ORIGIN = `https://${API_HOST}`

/**  the Interactions API endpoint used by the Omni models  */
const INTERACTIONS_URL = `${API_ORIGIN}/v1beta/interactions`

/**  the path suffix of a file download URI  */
const DOWNLOAD_SUFFIX = ":download"

/**  the maximum number of redirects followed per request  */
const MAX_REDIRECTS = 5

/**  the stderr line written on every poll while a video is generated  */
const PROGRESS_NOTE = "video generation in progress...\n"

/**  polling interval for the video file in milliseconds  */
const VIDEO_POLL_MS = 10_000

/**  overall video timeout in milliseconds; generation takes 1-6+ minutes  */
const VIDEO_TIMEOUT_MS = 600_000

/**  the output resolutions the video models accept  */
const VIDEO_RESOLUTIONS = ["360p", "720p", "1080p", "4k"] as const

/**  one accepted video resolution  */
type VideoResolution = (typeof VIDEO_RESOLUTIONS)[number]

/**  the aspect ratios every known video tier supports  */
const VIDEO_RATIOS: readonly AspectRatio[] = ["16:9", "9:16"]

/**  one known video-model tier  */
interface VideoModelInfo {
    /**  the Gemini API model id  */
    id: string
    /**  the marketing tier name  */
    name: string
    /**  the aspect ratios this tier supports  */
    aspectRatios: readonly AspectRatio[]
    /**  the output resolutions this tier supports  */
    resolutions: readonly VideoResolution[]
}

/**  the known video tiers; Omni 1080p/4k are upscaled per the docs  */
export const VIDEO_MODELS: readonly VideoModelInfo[] = [
    { id: "gemini-omni-1.1-flash", name: "Gemini Omni Flash", aspectRatios: VIDEO_RATIOS, resolutions: VIDEO_RESOLUTIONS }
]

/**
 *  Whether `model` is an Omni id: every id starting with "gemini-omni".
 *
 *  @param model - the Gemini video model id
 *  @returns true for an Omni id
 */
export const isOmniModel = (model: string): boolean =>
    model.startsWith("gemini-omni")

/**
 *  The catalog entry for `model`; an unknown Omni id falls back to the Omni
 *  tier, any other unknown id has none.
 *
 *  @param model - the Gemini video model id
 *  @returns the catalog entry, if any
 */
export const videoModelInfo = (model: string): VideoModelInfo | undefined =>
    VIDEO_MODELS.find((m) => m.id === model)
        ?? (isOmniModel(model) ? VIDEO_MODELS.find((m) => isOmniModel(m.id)) : undefined)

/**
 *  The aspect ratios the given video `model` officially supports. An unknown
 *  id is not second-guessed and gets both orientations, leaving
 *  the final say to the API.
 *
 *  @param model - the Gemini video model id
 *  @returns the supported aspect ratios
 */
export const videoAspectRatiosForModel = (model: string): readonly AspectRatio[] =>
    videoModelInfo(model)?.aspectRatios ?? VIDEO_RATIOS

/**
 *  The output resolutions the given video `model` supports; an unknown id
 *  gets the full token set.
 *
 *  @param model - the Gemini video model id
 *  @returns the supported resolutions
 */
export const videoResolutionsForModel = (model: string): readonly VideoResolution[] =>
    videoModelInfo(model)?.resolutions ?? VIDEO_RESOLUTIONS

/**  inputs for one video generation  */
export interface VideoGenerateInput {
    /**  resolved Gemini API key  */
    apiKey: string
    /**  the video prompt (English recommended)  */
    prompt: string
    /**  destination MP4 path; replaced via a random .part and rename, its parent directory must exist  */
    outputPath: string
    /**  Gemini video model id  */
    model: string
    /**  the resolved aspect ratio  */
    aspectRatio: AspectRatio
    /**  the requested output resolution; omitted to use the model default  */
    resolution?: VideoResolution
    /**  what the video must NOT contain (appended to the prompt as text); empty counts as absent  */
    negativePrompt?: string
    /**  optional starting image for image-to-video  */
    inputImage?: InputImage
}

/**  one input part of an Interactions API request  */
type OmniInputPart =
    /*  the image-part input shape was observed live  */
    | { type: "image", data: string, mime_type: string }
    | { type: "text", text: string }

/**
 *  The video content part of an Interactions API response; the part shape
 *  and the `:download?alt=media` file URI are documented in the raw REST JSON.
 */
interface OmniVideoPart {
    type: string
    uri?: string
}

/**  the Interactions API response body  */
interface OmniResponse {
    steps?: { type: string, content?: OmniVideoPart[] }[]
}

/**  the file resource polled until it is ACTIVE  */
interface OmniFile {
    state?: string
}

/**  the error body of a failed API request  */
interface ApiErrorBody {
    error?: { message?: string }
}

/**  resolve after `ms` milliseconds  */
const sleep = (ms: number): Promise<void> =>
    new Promise((resolve) => setTimeout(resolve, ms))

/**  the friendly timeout message, with an optional detail in parentheses  */
const timeoutMessage = (detail?: string): string =>
    `Video generation timed out after ${VIDEO_TIMEOUT_MS / 1000}s` + (detail !== undefined ? ` (${detail})` : "")

/**  parse the JSON body of `res`; a non-JSON body throws `<what>: invalid API response`, a deadline abort passes through  */
const readJson = async <T>(res: Response, what: string): Promise<T> => {
    try {
        return await res.json() as T
    }
    catch (error) {
        if (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError"))
            throw error
        throw new Error(`${what}: invalid API response`, { cause: error })
    }
}

/**  throw `<what>: <API message or HTTP status>` when the response is not ok  */
const ensureOk = async (res: Response, what: string): Promise<void> => {
    if (res.ok)
        return
    const raw = await res.text()
    let message = `HTTP ${res.status}`
    try {
        const parsed = JSON.parse(raw) as ApiErrorBody
        if (typeof parsed.error?.message === "string")
            message = parsed.error.message
    }
    catch {
        /*  not JSON: keep the HTTP status  */
    }
    throw new Error(`${what}: ${message}`)
}

/**
 *  Fetch `url` following up to `MAX_REDIRECTS` redirects manually. The API
 *  key header is sent only to URLs on the API origin; a redirect to another
 *  origin is followed without it. Only GET requests are redirected.
 *
 *  @param url - the first URL to request
 *  @param init - method, body and signal of the request
 *  @param apiKey - the Gemini API key
 *  @returns the final response
 */
const fetchApi = async (url: URL, init: RequestInit, apiKey: string): Promise<Response> => {
    let target = url
    for (let hop = 0; ; hop++) {
        const headers = new Headers(init.headers)
        if (target.origin === API_ORIGIN)
            headers.set("x-goog-api-key", apiKey)
        const res      = await fetch(target, { ...init, headers, redirect: "manual" })
        const location = res.headers.get("location")
        if ((init.method !== undefined && init.method !== "GET") || res.status < 300 || res.status >= 400 || location === null)
            return res
        await res.body?.cancel()
        if (hop >= MAX_REDIRECTS)
            throw new Error("Video generation failed: too many redirects")
        target = new URL(location, target)
        if (target.protocol !== "https:")
            throw new Error("Video generation failed: redirect to a non-HTTPS URL")
    }
}

/**
 *  Generate a video through the Gemini Interactions API (Omni models) and
 *  save it as MP4: the file is polled until ACTIVE, then streamed to a random
 *  `.part` file and renamed. All requests share one `deadline`.
 *
 *  @param input - the generation inputs
 *  @param deadline - the epoch milliseconds all requests must finish by
 *  @returns the written-file facts
 */
const runOmniVideo = async (input: VideoGenerateInput, deadline: number): Promise<GenerateResult> => {
    const headers   = { "Content-Type": "application/json" }
    const remaining = (): AbortSignal => AbortSignal.timeout(Math.max(1, deadline - Date.now()))

    /*  Omni has no negative-prompt parameter: append it to the text  */
    const text = input.negativePrompt !== undefined && input.negativePrompt !== ""
        ? `${input.prompt}\n\nDo not include: ${input.negativePrompt}` : input.prompt
    const parts: OmniInputPart[] = []
    if (input.inputImage !== undefined)
        parts.push({ type: "image", data: input.inputImage.data, mime_type: input.inputImage.mimeType })
    parts.push({ type: "text", text })

    const responseFormat: Record<string, string> = {
        type: "video", aspect_ratio: input.aspectRatio, delivery: "uri"
    }
    if (input.resolution !== undefined)
        responseFormat["resolution"] = input.resolution

    const res = await fetchApi(new URL(INTERACTIONS_URL), {
        method: "POST", headers, signal: remaining(),
        body: JSON.stringify({ model: input.model, input: parts, response_format: responseFormat })
    }, input.apiKey)
    await ensureOk(res, "Video generation failed")
    const body = await readJson<OmniResponse>(res, "Video generation failed")

    const video = body.steps?.filter((step) => step.type === "model_output")
        .flatMap((step) => step.content ?? []).find((part) => part.type === "video")
    if (video?.uri === undefined)
        throw new Error("No video returned by API")

    /*  the key is only sent to the API origin, never to a URI the response names  */
    let uri: URL
    try {
        uri = new URL(video.uri)
    }
    catch {
        throw new Error("Video generation failed: invalid file URI")
    }
    if (uri.origin !== API_ORIGIN)
        throw new Error(`Refusing to send the API key to unexpected host "${uri.hostname}"`)
    if (uri.username !== "" || uri.password !== "")
        throw new Error("Video generation failed: unexpected file URI")
    if (!uri.pathname.endsWith(DOWNLOAD_SUFFIX))
        throw new Error("Video generation failed: unexpected file URI")

    /*  poll the file resource until ACTIVE, then stream the bytes to disk  */
    const fileUrl = new URL(uri.href)
    fileUrl.pathname = uri.pathname.slice(0, -DOWNLOAD_SUFFIX.length)
    fileUrl.search   = ""
    for (;;) {
        const poll = await fetchApi(fileUrl, { headers, signal: remaining() }, input.apiKey)
        await ensureOk(poll, "Video generation failed")
        const file = await readJson<OmniFile>(poll, "Video generation failed")
        if (file.state === "ACTIVE")
            break
        if (file.state === "FAILED")
            throw new Error("Video generation failed: file processing failed")
        const left = deadline - Date.now()
        if (left <= 0)
            throw new Error(timeoutMessage(`file ${fileUrl.href} not ACTIVE`))
        process.stderr.write(PROGRESS_NOTE)
        await sleep(Math.min(VIDEO_POLL_MS, left))
    }

    const download = await fetchApi(uri, { headers, signal: remaining() }, input.apiKey)
    await ensureOk(download, "Video download failed")
    if (download.body === null)
        throw new Error("Video download failed: empty body")
    const part = `${input.outputPath}.${randomBytes(4).toString("hex")}.part`
    try {
        await pipeline(Readable.fromWeb(download.body as WebReadableStream), createWriteStream(part, { flags: "wx" }))
        renameSync(part, input.outputPath)
    }
    catch (error) {
        rmSync(part, { force: true })
        throw error
    }

    return { file: input.outputPath, aspectRatio: input.aspectRatio, model: input.model }
}

/**
 *  Generate a video from a text prompt (optionally seeded with a starting
 *  image) through the Interactions API and save it as MP4 to `outputPath`,
 *  replacing it via a random `.part` and rename (the parent directory must
 *  exist). All requests share one deadline of `VIDEO_TIMEOUT_MS`; a deadline
 *  abort of any in-flight request maps to the friendly timeout message.
 *  Returns the result facts on success; throws when the generation fails,
 *  times out, or returns no video.
 *
 *  @param input - the generation inputs
 *  @returns the written-file facts
 */
export const generateVideo = async (input: VideoGenerateInput): Promise<GenerateResult> => {
    const deadline = Date.now() + VIDEO_TIMEOUT_MS
    try {
        return await runOmniVideo(input, deadline)
    }
    catch (error) {
        if (error instanceof Error
            && (error.name === "TimeoutError" || (error.name === "AbortError" && Date.now() >= deadline)))
            throw new Error(timeoutMessage(), { cause: error })
        throw error
    }
}
