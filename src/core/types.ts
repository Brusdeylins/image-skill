/*
**  nano-banana -- Deterministic Image-Generation CLI for LLM Agents
**  Copyright (c) 2026 Matthias Brusdeylins
**  Licensed under MIT license <https://spdx.org/licenses/MIT>
**
**  core/types: the types shared by the image and video generation calls and
**  by the input-image reader, kept here so no core module depends on infra.
*/

import type { AspectRatio } from "./aspect.js"

/**  one decoded input image, ready as an inline data part  */
export interface InputImage {
    /**  the detected mime type  */
    mimeType: string
    /**  the image bytes, base64-encoded  */
    data: string
}

/**  the successful result of an image or video generation, mirrored onto the stdout JSON envelope  */
export interface GenerateResult {
    /**  written file path  */
    file: string
    /**  the aspect ratio actually requested  */
    aspectRatio: AspectRatio
    /**  the model used  */
    model: string
}
