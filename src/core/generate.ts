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
import type { AspectRatio } from "./layouts.js"

/**  the default Gemini image model (Nano Banana Pro, stable -- the
 *  `-preview` alias is deprecated)  */
export const DEFAULT_MODEL = "gemini-3-pro-image"

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

    const response = await ai.models.generateContent({
        model: input.model,
        contents: input.prompt,
        config: {
            responseModalities: ["IMAGE"],
            imageConfig: { aspectRatio: input.aspectRatio }
        }
    })

    const parts = response.candidates?.[0]?.content?.parts ?? []
    for (const part of parts) {
        const data = part.inlineData?.data
        if (data !== undefined && data !== "") {
            const png = toPng(Buffer.from(data, "base64"), part.inlineData?.mimeType)
            writeFileSync(input.outputPath, png)
            return { file: input.outputPath, aspectRatio: input.aspectRatio, model: input.model }
        }
    }

    const blocked = response.promptFeedback?.blockReason
    throw new Error(blocked !== undefined
        ? `No image returned: prompt blocked (${blocked})`
        : "No image returned by API")
}
