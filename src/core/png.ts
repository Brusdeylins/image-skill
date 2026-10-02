/*
**  nano-banana -- Deterministic Image-Generation CLI for LLM Agents
**  Copyright (c) 2026 Matthias Brusdeylins
**  Licensed under MIT license <https://spdx.org/licenses/MIT>
**
**  core/png: normalize the API's image bytes to a TRUE PNG. The Gemini image
**  model commonly returns JPEG; writing those bytes into a `.png` would make a
**  mislabeled file that downstream consumers (office tools, validators) may
**  reject or try to repair. Pure-JS codecs are used (jpeg-js + pngjs) so the
**  single-file esbuild bundle stays free of native modules.
*/

import jpeg from "jpeg-js"
import { PNG } from "pngjs"

/**  the 8-byte PNG file signature  */
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

/**  the 2-byte JPEG start-of-image marker  */
const JPEG_SOI = Buffer.from([0xff, 0xd8])

/**  whether `bytes` already begin with the PNG signature  */
export const isPng = (bytes: Buffer): boolean =>
    bytes.length >= 8 && bytes.subarray(0, 8).equals(PNG_SIGNATURE)

/**  whether `bytes` begin with the JPEG start-of-image marker  */
export const isJpeg = (bytes: Buffer): boolean =>
    bytes.length >= 2 && bytes.subarray(0, 2).equals(JPEG_SOI)

/**
 *  Return PNG bytes for the given image. PNG input passes through untouched;
 *  JPEG input is decoded and re-encoded to PNG. Anything else is rejected
 *  rather than written under a misleading `.png` name.
 *
 *  @param bytes - the raw image bytes returned by the API
 *  @param mimeType - the mime type the API reported (a hint; bytes win)
 *  @returns PNG-encoded bytes
 */
export const toPng = (bytes: Buffer, mimeType: string | undefined): Buffer => {
    if (isPng(bytes))
        return bytes
    if (isJpeg(bytes)) {
        const raw = jpeg.decode(bytes, { useTArray: true, formatAsRGBA: true })
        const png = new PNG({ width: raw.width, height: raw.height })
        png.data = Buffer.from(raw.data.buffer, raw.data.byteOffset, raw.data.byteLength)
        return PNG.sync.write(png)
    }
    throw new Error(`Unsupported image format from API (mimeType=${mimeType ?? "unknown"}); `
        + "expected PNG or JPEG")
}
