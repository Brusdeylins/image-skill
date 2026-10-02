/*
**  nano-banana -- Deterministic Image-Generation CLI for LLM Agents
**  Copyright (c) 2026 Matthias Brusdeylins
**  Licensed under MIT license <https://spdx.org/licenses/MIT>
**
**  core/generate: the single image-generation call against the Gemini Image API
**  (Nano Banana) via the official @google/genai SDK. TLS to the API
**  is the SDK's job (it uses Node's global fetch); TLS trust is merged by
**  infra/tls.
*/

import { writeFileSync } from "node:fs"
import { GoogleGenAI } from "@google/genai"
import { toPng } from "./png.js"
import type { AspectRatio } from "./aspect.js"
import type { ImageSize } from "./models.js"
import type { GenerateResult, InputImage } from "./types.js"

/**  request timeout in milliseconds; bounds a stalled API call  */
const IMAGE_TIMEOUT_MS = 120_000

/**  inputs for one image generation  */
export interface GenerateInput {
    /**  resolved Gemini API key  */
    apiKey: string
    /**  the image prompt (English recommended)  */
    prompt: string
    /**  destination PNG path  */
    outputPath: string
    /**  Gemini model id  */
    model: string
    /**  the resolved aspect ratio  */
    aspectRatio: AspectRatio
    /**  the requested output resolution; omitted to use the model default  */
    imageSize?: ImageSize
    /**  reference images for image-to-image editing/composition  */
    inputImages?: readonly InputImage[]
}

/**
 *  Generate an image from a text prompt and save it to `outputPath`; thought
 *  parts are skipped and the PNG is written directly (not atomic). Returns the
 *  result facts on success.
 *
 *  @param input - the generation inputs
 *  @returns the written-file facts
 *  @throws when the API returns no image, the 120 s deadline passes, or the
 *          image payload is unsupported
 */
export const generateImage = async (input: GenerateInput): Promise<GenerateResult> => {
    const ai = new GoogleGenAI({ apiKey: input.apiKey })

    const imageConfig: { aspectRatio: AspectRatio, imageSize?: ImageSize } =
        { aspectRatio: input.aspectRatio }
    if (input.imageSize !== undefined)
        imageConfig.imageSize = input.imageSize

    /*  with reference images, send the prompt plus inline image parts; else
        a bare prompt string  */
    const contents = input.inputImages !== undefined && input.inputImages.length > 0
        ? [
            { text: input.prompt },
            ...input.inputImages.map((img) => ({ inlineData: { mimeType: img.mimeType, data: img.data } }))
          ]
        : input.prompt

    const signal = AbortSignal.timeout(IMAGE_TIMEOUT_MS)
    let response
    try {
        response = await ai.models.generateContent({
            model: input.model,
            contents,
            config: { responseModalities: ["IMAGE"], imageConfig, abortSignal: signal }
        })
    }
    catch (err) {
        /*  map the deadline abort to a friendly message; keep other errors  */
        const name = err instanceof Error ? err.name : ""
        if (name === "TimeoutError" || (name === "AbortError" && signal.aborted))
            throw new Error(`Image generation timed out after ${IMAGE_TIMEOUT_MS / 1000}s`, { cause: err })
        throw err
    }

    const candidate = response.candidates?.[0]
    const parts     = candidate?.content?.parts ?? []
    for (const part of parts) {
        /*  skip interim "thought" images of thinking models  */
        if (part.thought === true)
            continue
        const inline = part.inlineData
        if (inline?.data !== undefined && inline.data !== "") {
            const png = toPng(Buffer.from(inline.data, "base64"), inline.mimeType)
            writeFileSync(input.outputPath, png)
            return { file: input.outputPath, aspectRatio: input.aspectRatio, model: input.model }
        }
    }

    /*  no image part: surface the most specific cause the API offered  */
    const reason = response.promptFeedback?.blockReason ?? candidate?.finishReason
    const text   = parts.filter((part) => part.thought !== true).map((part) => part.text).filter(Boolean).join(" ")
    const detail = [reason, text].filter(Boolean).join(": ")
    throw new Error(detail !== "" ? `No image returned (${detail})` : "No image returned by API")
}
