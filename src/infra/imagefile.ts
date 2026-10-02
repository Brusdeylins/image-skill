/*
**  nano-banana -- Deterministic Image-Generation CLI for LLM Agents
**  Copyright (c) 2026 Matthias Brusdeylins
**  Licensed under MIT license <https://spdx.org/licenses/MIT>
**
**  infra/imagefile: read a reference/input image from disk for image-to-image
**  generation. The caps here (14 images, 7 MB each) are CLI limits; Gemini's
**  documented limit is 20 MB of inline data per request and the image count
**  differs per model. Accepts PNG/JPEG/WEBP; the mime type is detected from
**  the magic bytes (not the extension), so a mislabeled file is typed correctly.
*/

import { readFileSync, statSync } from "node:fs"
import { isJpeg, isPng } from "../core/png.js"
import type { InputImage } from "../core/types.js"

/**  max number of input images per request  */
export const MAX_INPUT_IMAGES = 14

/**  max number of input images for video generation (first-frame image)  */
export const MAX_VIDEO_INPUT_IMAGES = 1

/**  max size of a single input image in bytes (a CLI cap, not a documented API limit)  */
export const MAX_INPUT_BYTES = 7 * 1024 * 1024

/**  documented total inline request limit (prompt, system text and inline bytes); counted conservatively in decimal MB  */
export const MAX_INLINE_REQUEST_BYTES = 20_000_000

/**  the ASCII tag opening a RIFF container  */
const RIFF_TAG = "RIFF"

/**  the ASCII form type of a WEBP container  */
const WEBP_TAG = "WEBP"

/**  magic-byte detectors for the accepted input formats  */
const SIGNATURES: ReadonlyArray<{ mime: string, test: (bytes: Buffer) => boolean }> = [
    { mime: "image/png",  test: isPng },
    { mime: "image/jpeg", test: isJpeg },
    { mime: "image/webp", test: (b) => b.subarray(0, 4).toString("ascii") === RIFF_TAG && b.subarray(8, 12).toString("ascii") === WEBP_TAG }
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
    /*  check type and size before reading the file into memory  */
    let stat
    try {
        stat = statSync(path)
    }
    catch (err) {
        throw new Error(`cannot read input image: ${path}`, { cause: err })
    }
    if (!stat.isFile())
        throw new Error(`input image is not a regular file: ${path}`)
    if (stat.size > MAX_INPUT_BYTES)
        throw new Error(`input image too large: ${path} (${stat.size} bytes, max ${MAX_INPUT_BYTES})`)
    let bytes
    try {
        bytes = readFileSync(path)
    }
    catch (err) {
        throw new Error(`cannot read input image: ${path}`, { cause: err })
    }
    /*  re-check the bytes actually read: the file may have grown after statSync (TOCTOU)  */
    if (bytes.length > MAX_INPUT_BYTES)
        throw new Error(`input image too large: ${path} (${bytes.length} bytes, max ${MAX_INPUT_BYTES})`)
    const sig = SIGNATURES.find((s) => s.test(bytes))
    if (sig === undefined)
        throw new Error(`unsupported input image format: ${path} (expected PNG, JPEG or WEBP)`)
    return { mimeType: sig.mime, data: bytes.toString("base64") }
}
