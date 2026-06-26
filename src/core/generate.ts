/*
**  nano-banana -- Deterministic Image-Generation CLI for LLM Agents
**  Copyright (c) 2026 Matthias Brusdeylins
**  Licensed under MIT license <https://spdx.org/licenses/MIT>
**
**  core/generate: the single image-generation call against Google Nano Banana
**  Pro (Gemini Image API) via the official @google/genai SDK. TLS to the API
**  is the SDK's job (it uses Node's global fetch); behind a corporate Zscaler
**  proxy, trust is supplied at runtime via NODE_OPTIONS=--use-system-ca or
**  NODE_EXTRA_CA_CERTS -- never bundled here.
*/

import { writeFileSync } from "node:fs"
import { GoogleGenAI } from "@google/genai"
import { toPng } from "./png.js"
import type { AspectRatio } from "./aspect.js"
import type { ImageSize } from "./models.js"
import type { InputImage } from "../infra/imagefile.js"

/**  the default Gemini image model (Nano Banana Pro, stable -- the
 *  `-preview` alias is deprecated)  */
export const DEFAULT_MODEL = "gemini-3-pro-image"

/**  default request timeout in milliseconds; bounds a stalled API call  */
export const DEFAULT_TIMEOUT_MS = 120_000

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

/**  the successful result, mirrored onto the stdout JSON envelope  */
export interface GenerateResult {
    /**  written file path  */
    file: string
    /**  the aspect ratio actually requested  */
    aspectRatio: AspectRatio
    /**  the model used  */
    model: string
}

/**
 *  Generate an image from a text prompt and save it to `outputPath`. Returns
 *  the result facts on success; throws when the API returns no image part.
 *
 *  @param input - the generation inputs
 *  @returns the written-file facts
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

    const response = await ai.models.generateContent({
        model: input.model,
        contents,
        config: {
            responseModalities: ["IMAGE"],
            imageConfig,
            abortSignal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS)
        }
    })

    const candidate = response.candidates?.[0]
    const parts     = candidate?.content?.parts ?? []
    for (const part of parts) {
        const data = part.inlineData?.data
        if (data !== undefined && data !== "") {
            const png = toPng(Buffer.from(data, "base64"), part.inlineData?.mimeType)
            writeFileSync(input.outputPath, png)
            return { file: input.outputPath, aspectRatio: input.aspectRatio, model: input.model }
        }
    }

    /*  no image part: surface the most specific cause the API offered  */
    const reason = response.promptFeedback?.blockReason ?? candidate?.finishReason
    const text   = parts.map((part) => part.text).filter(Boolean).join(" ")
    const detail = [reason, text].filter(Boolean).join(": ")
    throw new Error(detail !== "" ? `No image returned (${detail})` : "No image returned by API")
}
