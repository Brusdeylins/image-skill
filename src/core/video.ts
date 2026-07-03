/*
**  nano-banana -- Deterministic Image-Generation CLI for LLM Agents
**  Copyright (c) 2026 Matthias Brusdeylins
**  Licensed under MIT license <https://spdx.org/licenses/MIT>
**
**  core/video: the Veo video-generation tiers and the single video-generation
**  call against the Gemini API. Veo runs as a long-running operation: start,
**  poll until done, then save the MP4. Per the documentation, the Veo 3.0
**  tiers are GA (16:9 only, fixed 8 s), while the Veo 3.1 preview tiers add
**  9:16 portrait and the 4/6 s durations. This module is the single source
**  of truth for the per-model support.
*/

import { writeFileSync } from "node:fs"
import { GoogleGenAI, type GenerateVideosConfig, type GenerateVideosParameters } from "@google/genai"
import type { AspectRatio } from "./aspect.js"
import type { InputImage } from "../infra/imagefile.js"

/**  the default Gemini video model (Veo 3, stable/GA)  */
export const DEFAULT_VIDEO_MODEL = "veo-3.0-generate-001"

/**  polling interval for the long-running video operation in milliseconds  */
export const VIDEO_POLL_MS = 10_000

/**  overall video timeout in milliseconds; generation takes 1-6+ minutes  */
export const VIDEO_TIMEOUT_MS = 600_000

/**  the output resolutions the Veo models accept  */
export const VIDEO_RESOLUTIONS = ["720p", "1080p"] as const

/**  one accepted video resolution  */
export type VideoResolution = (typeof VIDEO_RESOLUTIONS)[number]

/**  narrow an arbitrary string to a known video resolution  */
export const isVideoResolution = (value: string): value is VideoResolution =>
    (VIDEO_RESOLUTIONS as readonly string[]).includes(value)

/**  the clip durations (seconds) the Veo models accept  */
export const VIDEO_DURATIONS = [4, 6, 8] as const

/**  one accepted clip duration in seconds  */
export type VideoDuration = (typeof VIDEO_DURATIONS)[number]

/**  narrow an arbitrary number to a known clip duration  */
export const isVideoDuration = (value: number): value is VideoDuration =>
    (VIDEO_DURATIONS as readonly number[]).includes(value)

/**  one known video-model tier  */
export interface VideoModelInfo {
    /**  the Gemini API model id  */
    id: string
    /**  the marketing tier name  */
    name: string
    /**  the aspect ratios this tier supports  */
    aspectRatios: readonly AspectRatio[]
    /**  the output resolutions this tier supports  */
    resolutions: readonly VideoResolution[]
    /**  the clip durations (seconds) this tier supports  */
    durations: readonly VideoDuration[]
}

/**  the known Veo tiers, in ascending capability  */
export const VIDEO_MODELS: readonly VideoModelInfo[] = [
    { id: "veo-3.0-generate-001",          name: "Veo 3",        aspectRatios: ["16:9"],         resolutions: ["720p", "1080p"], durations: [8] },
    { id: "veo-3.0-fast-generate-001",     name: "Veo 3 Fast",   aspectRatios: ["16:9"],         resolutions: ["720p", "1080p"], durations: [8] },
    { id: "veo-3.1-generate-preview",      name: "Veo 3.1",      aspectRatios: ["16:9", "9:16"], resolutions: ["720p", "1080p"], durations: [4, 6, 8] },
    { id: "veo-3.1-fast-generate-preview", name: "Veo 3.1 Fast", aspectRatios: ["16:9", "9:16"], resolutions: ["720p", "1080p"], durations: [4, 6, 8] },
    { id: "veo-3.1-lite-generate-preview", name: "Veo 3.1 Lite", aspectRatios: ["16:9", "9:16"], resolutions: ["720p", "1080p"], durations: [4, 6, 8] }
]

/**
 *  The aspect ratios the given video `model` officially supports. An unknown
 *  (custom) Veo id is not second-guessed and gets both orientations, leaving
 *  the final say to the API.
 *
 *  @param model - the Gemini video model id
 *  @returns the supported aspect ratios
 */
export const videoAspectRatiosForModel = (model: string): readonly AspectRatio[] =>
    VIDEO_MODELS.find((m) => m.id === model)?.aspectRatios ?? ["16:9", "9:16"]

/**
 *  The output resolutions the given video `model` supports; an unknown id
 *  gets the full token set.
 *
 *  @param model - the Gemini video model id
 *  @returns the supported resolutions
 */
export const videoResolutionsForModel = (model: string): readonly VideoResolution[] =>
    VIDEO_MODELS.find((m) => m.id === model)?.resolutions ?? VIDEO_RESOLUTIONS

/**
 *  The clip durations the given video `model` supports; an unknown id gets
 *  the full set.
 *
 *  @param model - the Gemini video model id
 *  @returns the supported durations in seconds
 */
export const videoDurationsForModel = (model: string): readonly VideoDuration[] =>
    VIDEO_MODELS.find((m) => m.id === model)?.durations ?? VIDEO_DURATIONS

/**  inputs for one video generation  */
export interface VideoGenerateInput {
    /**  resolved Gemini API key  */
    apiKey: string
    /**  the video prompt (English recommended)  */
    prompt: string
    /**  destination MP4 path  */
    outputPath: string
    /**  Gemini video model id  */
    model: string
    /**  the resolved aspect ratio  */
    aspectRatio: AspectRatio
    /**  the requested output resolution; omitted to use the model default  */
    resolution?: VideoResolution
    /**  the requested clip duration in seconds; omitted to use the model default  */
    durationSeconds?: VideoDuration
    /**  what the video must NOT contain  */
    negativePrompt?: string
    /**  optional starting image for image-to-video  */
    inputImage?: InputImage
}

/**  the successful result, mirrored onto the stdout JSON envelope  */
export interface VideoGenerateResult {
    /**  written file path  */
    file: string
    /**  the aspect ratio actually requested  */
    aspectRatio: AspectRatio
    /**  the model used  */
    model: string
}

/**
 *  Generate a video from a text prompt (optionally seeded with a starting
 *  image) and save it as MP4 to `outputPath`. Veo is a long-running
 *  operation: the call polls every `VIDEO_POLL_MS` until the operation is
 *  done, bounded by `VIDEO_TIMEOUT_MS`. Returns the result facts on success;
 *  throws when the operation fails, times out, or returns no video.
 *
 *  @param input - the generation inputs
 *  @returns the written-file facts
 */
export const generateVideo = async (input: VideoGenerateInput): Promise<VideoGenerateResult> => {
    const ai = new GoogleGenAI({ apiKey: input.apiKey })

    const config: GenerateVideosConfig = { aspectRatio: input.aspectRatio, numberOfVideos: 1 }
    if (input.resolution !== undefined)
        config.resolution = input.resolution
    if (input.durationSeconds !== undefined)
        config.durationSeconds = input.durationSeconds
    if (input.negativePrompt !== undefined)
        config.negativePrompt = input.negativePrompt

    const params: GenerateVideosParameters = { model: input.model, prompt: input.prompt, config }
    if (input.inputImage !== undefined)
        params.image = { imageBytes: input.inputImage.data, mimeType: input.inputImage.mimeType }

    /*  start the long-running operation, then poll until done or deadline  */
    let operation = await ai.models.generateVideos(params)
    const deadline = Date.now() + VIDEO_TIMEOUT_MS
    while (operation.done !== true) {
        if (Date.now() >= deadline)
            throw new Error(`Video generation timed out after ${VIDEO_TIMEOUT_MS / 1000}s (operation ${operation.name ?? "unknown"} still running)`)
        process.stderr.write("video generation in progress...\n")
        await new Promise((resolve) => setTimeout(resolve, VIDEO_POLL_MS))
        operation = await ai.operations.getVideosOperation({ operation })
    }

    if (operation.error !== undefined) {
        const message = typeof operation.error["message"] === "string"
            ? operation.error["message"] : JSON.stringify(operation.error)
        throw new Error(`Video generation failed: ${message}`)
    }

    /*  no video: surface the most specific cause the API offered  */
    const video = operation.response?.generatedVideos?.[0]?.video
    if (video === undefined) {
        const reasons = operation.response?.raiMediaFilteredReasons?.filter(Boolean).join("; ") ?? ""
        throw new Error(reasons !== "" ? `No video returned (${reasons})` : "No video returned by API")
    }

    /*  inline bytes when present; otherwise let the SDK fetch the file URI  */
    if (video.videoBytes !== undefined && video.videoBytes !== "")
        writeFileSync(input.outputPath, Buffer.from(video.videoBytes, "base64"))
    else
        await ai.files.download({ file: video, downloadPath: input.outputPath })

    return { file: input.outputPath, aspectRatio: input.aspectRatio, model: input.model }
}
