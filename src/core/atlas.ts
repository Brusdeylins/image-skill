/*
**  nano-banana -- Deterministic Image-Generation CLI for LLM Agents
**  Copyright (c) 2026 Matthias Brusdeylins
**  Licensed under MIT license <https://spdx.org/licenses/MIT>
**
**  core/atlas: optional Atlas Cloud image backend. Generation POSTs are
**  submitted exactly once; only prediction GETs use bounded backoff.
*/

import { writeFileSync } from "node:fs"
import { toPng } from "./png.js"
import type { AspectRatio } from "./aspect.js"
import type { ImageSize } from "./models.js"
import type { InputImage } from "../infra/imagefile.js"

export const ATLAS_API_BASE = "https://api.atlascloud.ai"
export const ATLAS_TEXT_MODEL = "google/nano-banana-2-lite/text-to-image-developer"
export const ATLAS_EDIT_MODEL = "google/nano-banana-2-lite/edit-developer"
export const ATLAS_IMAGE_SIZES: readonly ImageSize[] = ["1K"]
export const ATLAS_TIMEOUT_MS = 180_000

export interface AtlasGenerateInput {
    apiKey: string
    prompt: string
    outputPath: string
    model: string
    aspectRatio: AspectRatio
    imageSize?: ImageSize
    inputImages?: readonly InputImage[]
}

export interface AtlasGenerateResult {
    file: string
    aspectRatio: AspectRatio
    model: string
}

interface AtlasPrediction {
    id?: string
    status?: string
    outputs?: string[] | null
    error?: string
    urls?: { get?: string }
}

interface AtlasResponse {
    code?: number
    message?: string
    data?: AtlasPrediction | { download_url?: string }
    id?: string
    status?: string
    outputs?: string[] | null
    error?: string
    urls?: { get?: string }
    download_url?: string
}

const sleep = async (milliseconds: number): Promise<void> =>
    new Promise((resolve) => setTimeout(resolve, milliseconds))

const responseError = (body: AtlasResponse): string =>
    body.message ?? body.error ?? "Atlas Cloud request failed"

const fetchJson = async (url: string, init: RequestInit): Promise<AtlasResponse> => {
    const response = await fetch(url, init)
    const text = await response.text()
    let body: AtlasResponse
    try {
        body = JSON.parse(text) as AtlasResponse
    }
    catch {
        throw new Error(`Atlas Cloud returned invalid JSON (HTTP ${response.status})`)
    }
    if (!response.ok || (body.code !== undefined && body.code !== 0 && body.code !== 200))
        throw new Error(`${responseError(body)} (HTTP ${response.status})`)
    return body
}

const predictionFrom = (body: AtlasResponse): AtlasPrediction => {
    const data = body.data
    if (data !== undefined && "status" in data)
        return data
    return body
}

const uploadImage = async (apiKey: string, image: InputImage, index: number): Promise<string> => {
    const form = new FormData()
    const bytes = Buffer.from(image.data, "base64")
    const extension = image.mimeType === "image/jpeg" ? "jpg" : image.mimeType.split("/")[1] ?? "png"
    form.append("file", new Blob([bytes], { type: image.mimeType }), `input-${index}.${extension}`)

    const body = await fetchJson(`${ATLAS_API_BASE}/api/v1/model/uploadMedia`, {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}` },
        body: form,
        signal: AbortSignal.timeout(120_000)
    })
    const data = body.data
    const url = data !== undefined && "download_url" in data ? data.download_url : body.download_url
    if (url === undefined || url === "")
        throw new Error("Atlas Cloud upload returned no download URL")
    return url
}

const pollPrediction = async (apiKey: string, initial: AtlasPrediction): Promise<AtlasPrediction> => {
    if (initial.id === undefined || initial.id === "")
        throw new Error("Atlas Cloud generation returned no prediction id")

    const pollUrl = initial.urls?.get ?? `${ATLAS_API_BASE}/api/v1/model/prediction/${initial.id}`
    const deadline = Date.now() + ATLAS_TIMEOUT_MS
    let delay = 1_000
    let last = initial

    while (Date.now() < deadline) {
        const status = last.status?.toLowerCase()
        if (status === "completed" || status === "succeeded")
            return last
        if (status === "failed" || status === "cancelled" || status === "timeout")
            throw new Error(last.error !== undefined && last.error !== ""
                ? `Atlas Cloud generation ${status}: ${last.error}`
                : `Atlas Cloud generation ${status}`)

        await sleep(delay)
        delay = Math.min(Math.ceil(delay * 1.6), 10_000)
        try {
            const body = await fetchJson(pollUrl, {
                method: "GET",
                headers: { Authorization: `Bearer ${apiKey}` },
                signal: AbortSignal.timeout(30_000)
            })
            last = predictionFrom(body)
        }
        catch (error) {
            if (Date.now() >= deadline)
                throw error
        }
    }
    throw new Error(`Atlas Cloud generation timed out after ${ATLAS_TIMEOUT_MS / 1000}s`)
}

export const atlasModelFor = (hasInputImages: boolean): string =>
    hasInputImages ? ATLAS_EDIT_MODEL : ATLAS_TEXT_MODEL

export const generateAtlasImage = async (input: AtlasGenerateInput): Promise<AtlasGenerateResult> => {
    const images = input.inputImages ?? []
    const imageUrls: string[] = []
    for (const [index, image] of images.entries())
        imageUrls.push(await uploadImage(input.apiKey, image, index + 1))

    const payload: Record<string, unknown> = {
        model: input.model,
        prompt: input.prompt,
        aspect_ratio: input.aspectRatio,
        resolution: (input.imageSize ?? "1K").toLowerCase()
    }
    if (imageUrls.length > 0)
        payload.images = imageUrls

    const submitted = await fetchJson(`${ATLAS_API_BASE}/api/v1/model/generateImage`, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${input.apiKey}`,
            "Content-Type": "application/json"
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(120_000)
    })
    const prediction = await pollPrediction(input.apiKey, predictionFrom(submitted))
    const outputUrl = prediction.outputs?.[0]
    if (outputUrl === undefined || outputUrl === "")
        throw new Error("Atlas Cloud generation completed without an output URL")

    const output = await fetch(outputUrl, { signal: AbortSignal.timeout(120_000) })
    if (!output.ok)
        throw new Error(`Atlas Cloud output download failed (HTTP ${output.status})`)
    const bytes = Buffer.from(await output.arrayBuffer())
    writeFileSync(input.outputPath, toPng(bytes, output.headers.get("content-type") ?? undefined))
    return { file: input.outputPath, aspectRatio: input.aspectRatio, model: input.model }
}
