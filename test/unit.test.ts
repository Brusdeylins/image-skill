/*
**  nano-banana -- Deterministic Image-Generation CLI for LLM Agents
**  Copyright (c) 2026 Matthias Brusdeylins
**  Licensed under MIT license <https://spdx.org/licenses/MIT>
**
**  unit.test: cover the pure, network-free logic -- the arg parser, the
**  layout/aspect tables and the env-only key resolution.
*/

import { describe, it, expect } from "vitest"
import jpeg from "jpeg-js"
import { PNG } from "pngjs"
import { parseArgs } from "../src/infra/args.js"
import { resolveApiKey, KEY_ENV_VARS } from "../src/infra/apikey.js"
import { isAspectRatio, LAYOUT_RATIOS, LAYOUT_PLACEHOLDER_RATIOS } from "../src/core/layouts.js"
import { toPng } from "../src/core/png.js"

/**  the 8-byte PNG signature, for asserting real PNG output  */
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

describe("parseArgs", () => {
    it("splits options from switches", () => {
        const { options, flags } = parseArgs(
            ["--prompt", "a cat", "--output", "c.png", "--list-layouts"],
            ["list-layouts"])
        expect(options["prompt"]).toBe("a cat")
        expect(options["output"]).toBe("c.png")
        expect(flags.has("list-layouts")).toBe(true)
    })

    it("treats a value-less option before another flag as a switch", () => {
        const { options, flags } = parseArgs(["--layout", "--prompt", "x"], [])
        expect(flags.has("layout")).toBe(true)
        expect(options["prompt"]).toBe("x")
    })
})

describe("layouts", () => {
    it("narrows known aspect ratios", () => {
        expect(isAspectRatio("16:9")).toBe(true)
        expect(isAspectRatio("5:4")).toBe(false)
    })

    it("maps layout 0 to portrait and a layout-14 placeholder to square", () => {
        expect(LAYOUT_RATIOS[0]).toBe("2:3")
        expect(LAYOUT_PLACEHOLDER_RATIOS["14:13"]).toBe("1:1")
    })
})

describe("toPng", () => {
    /*  a 2x2 opaque RGBA bitmap reused as codec input  */
    const rgba = Buffer.from([
        255, 0, 0, 255,   0, 255, 0, 255,
        0, 0, 255, 255,   255, 255, 0, 255
    ])

    it("re-encodes JPEG bytes into a true PNG", () => {
        const jpg = jpeg.encode({ data: rgba, width: 2, height: 2 }, 90).data
        expect(jpg.subarray(0, 2)).toEqual(Buffer.from([0xff, 0xd8]))
        const out = toPng(Buffer.from(jpg), "image/jpeg")
        expect(out.subarray(0, 8)).toEqual(PNG_SIGNATURE)
    })

    it("passes PNG bytes through untouched", () => {
        const png = new PNG({ width: 2, height: 2 })
        png.data = Buffer.from(rgba)
        const bytes = PNG.sync.write(png)
        const out = toPng(bytes, "image/png")
        expect(out).toBe(bytes)
    })

    it("rejects an unsupported format", () => {
        expect(() => toPng(Buffer.from([0x00, 0x01, 0x02, 0x03]), "image/gif"))
            .toThrow(/Unsupported image format/)
    })
})

describe("resolveApiKey", () => {
    it("reads the key from the environment", () => {
        const prev = process.env[KEY_ENV_VARS[0]]
        process.env[KEY_ENV_VARS[0]] = "  secret-key  "
        try {
            expect(resolveApiKey()).toBe("secret-key")
        }
        finally {
            if (prev === undefined)
                Reflect.deleteProperty(process.env, KEY_ENV_VARS[0])
            else
                process.env[KEY_ENV_VARS[0]] = prev
        }
    })

    it("throws an actionable error when no key is present", () => {
        const saved = KEY_ENV_VARS.map((name) => process.env[name])
        for (const name of KEY_ENV_VARS)
            Reflect.deleteProperty(process.env, name)
        try {
            expect(() => resolveApiKey()).toThrow(/No API key found/)
        }
        finally {
            KEY_ENV_VARS.forEach((name, i) => {
                const v = saved[i]
                if (v !== undefined)
                    process.env[name] = v
            })
        }
    })
})
