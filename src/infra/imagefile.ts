/*
**  nano-banana -- Deterministic Image-Generation CLI for LLM Agents
**  Copyright (c) 2026 Matthias Brusdeylins
**  Licensed under MIT license <https://spdx.org/licenses/MIT>
**
**  infra/imagefile: read a reference/input image from disk for image-to-image
**  generation. The Gemini image models accept up to 14 input images, at most
**  7 MB each, as PNG/JPEG/WEBP. The mime type is detected from the file's magic
**  bytes (not its extension), so a mislabeled file is still typed correctly.
*/

import { readFileSync } from "node:fs"

/**  one decoded input image, ready as an inline data part  */
export interface InputImage {
    /**  the detected mime type  */
    mimeType: string
    /**  the image bytes, base64-encoded  */
    data: string
}

/**  max number of input images per request  */
export const MAX_INPUT_IMAGES = 14

/**  max size of a single input image in bytes  */
export const MAX_INPUT_BYTES = 7 * 1024 * 1024

/**  magic-byte detectors for the accepted input formats  */
const SIGNATURES: ReadonlyArray<{ mime: string, test: (bytes: Buffer) => boolean }> = [
    { mime: "image/png",  test: (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
    { mime: "image/jpeg", test: (b) => b.subarray(0, 2).equals(Buffer.from([0xff, 0xd8])) },
    { mime: "image/webp", test: (b) => b.subarray(0, 4).toString("ascii") === "RIFF" && b.subarray(8, 12).toString("ascii") === "WEBP" }
]

/**
 *  Read an input image, detect its mime type from the magic bytes, and return
 *  it base64-encoded. Throws on an unreadable file, an oversized file, or an
 *  unsupported format -- the caller turns that into a usage error.
 *
 *  @param path - the input image path
 *  @returns the decoded input image
 */
export const readInputImage = (path: string): InputImage => {
    const bytes = readFileSync(path)
    if (bytes.length > MAX_INPUT_BYTES)
        throw new Error(`input image too large: ${path} (${bytes.length} bytes, max ${MAX_INPUT_BYTES})`)
    const sig = SIGNATURES.find((s) => s.test(bytes))
    if (sig === undefined)
        throw new Error(`unsupported input image format: ${path} (expected PNG, JPEG or WEBP)`)
    return { mimeType: sig.mime, data: bytes.toString("base64") }
}
