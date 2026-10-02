/*
**  nano-banana -- Deterministic Image-Generation CLI for LLM Agents
**  Copyright (c) 2026 Matthias Brusdeylins
**  Licensed under MIT license <https://spdx.org/licenses/MIT>
**
**  helpers: fixtures and utilities shared by the test files.
*/

import { mkdtempSync, readdirSync, rmSync } from "node:fs"
import { dirname, join } from "node:path"
import { tmpdir } from "node:os"
import { afterEach } from "vitest"
import jpeg from "jpeg-js"
import { PNG } from "pngjs"

/**  a 2x2 opaque RGBA bitmap reused as codec input  */
const RGBA_2X2 = Buffer.from([
    255, 0, 0, 255,   0, 255, 0, 255,
    0, 0, 255, 255,   255, 255, 0, 255
])

/**  the 8-byte PNG signature, an oracle independent of src/core/png.ts, for asserting real PNG output  */
export const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

/**  the name pattern of the temporary file `<out>.<8 hex chars>.part` written before the final rename  */
export const PART_RE = /\.[0-9a-f]{8}\.part$/

/**  the leftover `.part` files in the directory of `path`  */
export const partFiles = (path: string): string[] =>
    readdirSync(dirname(path)).filter((name) => PART_RE.test(name))

/**  a real 2x2 PNG file as bytes  */
export const pngBytes = (): Buffer => {
    const png = new PNG({ width: 2, height: 2 })
    png.data = Buffer.from(RGBA_2X2)
    return PNG.sync.write(png)
}

/**  a real 2x2 JPEG file as bytes  */
export const jpegBytes = (): Buffer =>
    Buffer.from(jpeg.encode({ data: RGBA_2X2, width: 2, height: 2 }, 90).data)

/**
 *  Register a per-test temporary directory: a fresh `mkdtemp` directory is
 *  created on demand and every directory made is removed after each test.
 *
 *  @returns a function creating a new temporary directory and returning its path
 */
export const useTmpDirs = (): (() => string) => {
    const dirs: string[] = []
    afterEach(() => {
        for (const dir of dirs.splice(0))
            rmSync(dir, { recursive: true, force: true })
    })
    return () => {
        const dir = mkdtempSync(join(tmpdir(), "nb-"))
        dirs.push(dir)
        return dir
    }
}
