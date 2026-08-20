/*
**  nano-banana -- Deterministic Image-Generation CLI for LLM Agents
**  Copyright (c) 2026 Matthias Brusdeylins
**  Licensed under MIT license <https://spdx.org/licenses/MIT>
**
**  unit.test: cover the pure, network-free logic -- the arg parser, the
**  layout/aspect tables and the env-only key resolution.
*/

import { describe, it, expect } from "vitest"
import { execFileSync } from "node:child_process"
import { fileURLToPath } from "node:url"
import { writeFileSync, rmSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"
import jpeg from "jpeg-js"
import { PNG } from "pngjs"
import { parseCli } from "../src/infra/args.js"
import { resolveApiKey, ATLAS_KEY_ENV_VARS, KEY_ENV_VARS } from "../src/infra/apikey.js"
import { isAspectRatio } from "../src/core/aspect.js"
import { aspectRatiosForModel, imageSizesForModel } from "../src/core/models.js"
import {
    videoAspectRatiosForModel, videoResolutionsForModel, videoDurationsForModel
} from "../src/core/video.js"
import { readInputImage } from "../src/infra/imagefile.js"
import { toPng } from "../src/core/png.js"
import { ATLAS_EDIT_MODEL, ATLAS_TEXT_MODEL, atlasModelFor } from "../src/core/atlas.js"

/**  absolute path to the built CLI bundle (cwd-independent)  */
const CLI_BUNDLE = fileURLToPath(new URL("../dst/nano-banana.mjs", import.meta.url))

/**  the 8-byte PNG signature, for asserting real PNG output  */
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

describe("parseCli", () => {
    it("parses string options and boolean switches", () => {
        const values = parseCli(["--prompt", "a cat", "--output", "c.png", "--list-models"])
        expect(values["prompt"]).toBe("a cat")
        expect(values["output"]).toBe("c.png")
        expect(values["list-models"]).toBe(true)
    })

    it("parses an Atlas provider selection", () => {
        const values = parseCli(["--provider", "atlas", "--prompt", "a cat", "--output", "c.png"])
        expect(values["provider"]).toBe("atlas")
    })

    it("keeps a `--`-prefixed value via the `=` form (P6)", () => {
        const values = parseCli(["--prompt=--dramatic lighting", "--output", "c.png"])
        expect(values["prompt"]).toBe("--dramatic lighting")
    })

    it("rejects an unknown flag", () => {
        expect(() => parseCli(["--nope"])).toThrow()
    })
})

describe("cli envelope", () => {
    /*  run the built bundle and capture stdout + exit code  */
    const runCli = (args: readonly string[]): { out: string, code: number } => {
        try {
            return { out: execFileSync("node", [CLI_BUNDLE, ...args], { encoding: "utf8" }), code: 0 }
        }
        catch (err) {
            const e = err as { stdout?: string, status?: number }
            return { out: e.stdout ?? "", code: e.status ?? 0 }
        }
    }

    it("emits a JSON error envelope on missing args, non-zero exit (P1)", () => {
        const { out, code } = runCli([])
        const env = JSON.parse(out.trim()) as { status: string }
        expect(env.status).toBe("error")
        expect(code).not.toBe(0)
    })

    it("rejects an extreme ratio on a model that does not support it", () => {
        const { out, code } = runCli([
            "--prompt", "x", "--output", "/tmp/nb-never.png",
            "--model", "gemini-3-pro-image", "--aspect-ratio", "1:4"
        ])
        const env = JSON.parse(out.trim()) as { status: string, message: string }
        expect(env.status).toBe("error")
        expect(env.message).toContain("not supported by gemini-3-pro-image")
        expect(code).not.toBe(0)
    })

    it("rejects a resolution the model does not support (Pro + 512)", () => {
        const { out, code } = runCli([
            "--prompt", "x", "--output", "/tmp/nb-never.png",
            "--model", "gemini-3-pro-image", "--image-size", "512"
        ])
        const env = JSON.parse(out.trim()) as { status: string, message: string }
        expect(env.status).toBe("error")
        expect(env.message).toContain("--image-size \"512\" not supported by gemini-3-pro-image")
        expect(code).not.toBe(0)
    })

    it("rejects more than the maximum number of --input images", () => {
        const args = ["--prompt", "x", "--output", "/tmp/nb-never.png"]
        for (let i = 0; i < 15; i++)
            args.push("--input", "/tmp/nb-ref.png")
        const { out, code } = runCli(args)
        const env = JSON.parse(out.trim()) as { status: string, message: string }
        expect(env.status).toBe("error")
        expect(env.message).toContain("too many --input images")
        expect(code).not.toBe(0)
    })

    it("rejects the video-only options in image mode", () => {
        const { out, code } = runCli([
            "--prompt", "x", "--output", "/tmp/nb-never.png", "--resolution", "1080p"
        ])
        const env = JSON.parse(out.trim()) as { status: string, message: string }
        expect(env.status).toBe("error")
        expect(env.message).toContain("--resolution requires --video")
        expect(code).not.toBe(0)
    })

    it("rejects --image-size in video mode", () => {
        const { out, code } = runCli([
            "--video", "--prompt", "x", "--output", "/tmp/nb-never.mp4", "--image-size", "2K"
        ])
        const env = JSON.parse(out.trim()) as { status: string, message: string }
        expect(env.status).toBe("error")
        expect(env.message).toContain("use --resolution with --video")
        expect(code).not.toBe(0)
    })

    it("rejects a portrait ratio on a Veo 3.0 model", () => {
        const { out, code } = runCli([
            "--video", "--prompt", "x", "--output", "/tmp/nb-never.mp4",
            "--model", "veo-3.0-generate-001", "--aspect-ratio", "9:16"
        ])
        const env = JSON.parse(out.trim()) as { status: string, message: string }
        expect(env.status).toBe("error")
        expect(env.message).toContain("not supported by veo-3.0-generate-001")
        expect(code).not.toBe(0)
    })

    it("rejects a duration the video model does not support", () => {
        const { out, code } = runCli([
            "--video", "--prompt", "x", "--output", "/tmp/nb-never.mp4",
            "--model", "veo-3.0-generate-001", "--duration", "4"
        ])
        const env = JSON.parse(out.trim()) as { status: string, message: string }
        expect(env.status).toBe("error")
        expect(env.message).toContain("--duration \"4\" not supported by veo-3.0-generate-001")
        expect(code).not.toBe(0)
    })

    it("rejects more than one --input image in video mode", () => {
        const { out, code } = runCli([
            "--video", "--prompt", "x", "--output", "/tmp/nb-never.mp4",
            "--input", "/tmp/nb-ref.png", "--input", "/tmp/nb-ref.png"
        ])
        const env = JSON.parse(out.trim()) as { status: string, message: string }
        expect(env.status).toBe("error")
        expect(env.message).toContain("too many --input images: 2 (max 1 with --video)")
        expect(code).not.toBe(0)
    })

    it("rejects Atlas Cloud for video mode", () => {
        const { out, code } = runCli([
            "--provider", "atlas", "--video", "--prompt", "x", "--output", "/tmp/nb-never.mp4"
        ])
        const env = JSON.parse(out.trim()) as { status: string, message: string }
        expect(env.status).toBe("error")
        expect(env.message).toContain("supports images only")
        expect(code).not.toBe(0)
    })

    it("rejects non-1K resolution for the Atlas Cloud lite model", () => {
        const { out, code } = runCli([
            "--provider", "atlas", "--prompt", "x", "--output", "/tmp/nb-never.png",
            "--image-size", "2K"
        ])
        const env = JSON.parse(out.trim()) as { status: string, message: string }
        expect(env.status).toBe("error")
        expect(env.message).toContain("not supported by google/nano-banana-2-lite")
        expect(code).not.toBe(0)
    })
})

describe("Atlas Cloud models", () => {
    it("selects text or edit model from the presence of input images", () => {
        expect(atlasModelFor(false)).toBe(ATLAS_TEXT_MODEL)
        expect(atlasModelFor(true)).toBe(ATLAS_EDIT_MODEL)
    })
})

describe("aspect", () => {
    it("narrows known aspect ratios", () => {
        expect(isAspectRatio("16:9")).toBe(true)
        expect(isAspectRatio("5:4")).toBe(true)
        expect(isAspectRatio("7:5")).toBe(false)
    })
})

describe("aspectRatiosForModel", () => {
    it("gives 10 standard ratios to Pro and 2.5-flash, 14 to Nano Banana 2", () => {
        expect(aspectRatiosForModel("gemini-3-pro-image")).toHaveLength(10)
        expect(aspectRatiosForModel("gemini-2.5-flash-image")).toHaveLength(10)
        expect(aspectRatiosForModel("gemini-3.1-flash-image")).toHaveLength(14)
    })

    it("offers the extreme ratios only on Nano Banana 2", () => {
        expect(aspectRatiosForModel("gemini-3-pro-image")).not.toContain("1:4")
        expect(aspectRatiosForModel("gemini-3.1-flash-image")).toContain("1:4")
    })
})

describe("imageSizesForModel", () => {
    it("gives 1K-only to 2.5-flash, 1K/2K/4K to Pro, +512 to Nano Banana 2", () => {
        expect(imageSizesForModel("gemini-2.5-flash-image")).toEqual(["1K"])
        expect(imageSizesForModel("gemini-3-pro-image")).toEqual(["1K", "2K", "4K"])
        expect(imageSizesForModel("gemini-3.1-flash-image")).toEqual(["512", "1K", "2K", "4K"])
    })

    it("offers 512 only on Nano Banana 2", () => {
        expect(imageSizesForModel("gemini-3-pro-image")).not.toContain("512")
        expect(imageSizesForModel("gemini-3.1-flash-image")).toContain("512")
    })
})

describe("video model tables", () => {
    it("gives 16:9-only to Veo 3.0, 16:9 + 9:16 to Veo 3.1", () => {
        expect(videoAspectRatiosForModel("veo-3.0-generate-001")).toEqual(["16:9"])
        expect(videoAspectRatiosForModel("veo-3.1-generate-preview")).toEqual(["16:9", "9:16"])
    })

    it("gives 720p/1080p to every Veo tier", () => {
        expect(videoResolutionsForModel("veo-3.0-generate-001")).toEqual(["720p", "1080p"])
        expect(videoResolutionsForModel("veo-3.1-lite-generate-preview")).toEqual(["720p", "1080p"])
    })

    it("gives 8s-only to Veo 3.0, 4/6/8s to Veo 3.1", () => {
        expect(videoDurationsForModel("veo-3.0-fast-generate-001")).toEqual([8])
        expect(videoDurationsForModel("veo-3.1-generate-preview")).toEqual([4, 6, 8])
    })

    it("does not second-guess an unknown Veo id", () => {
        expect(videoAspectRatiosForModel("veo-9.9-generate-001")).toEqual(["16:9", "9:16"])
        expect(videoDurationsForModel("veo-9.9-generate-001")).toEqual([4, 6, 8])
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

describe("readInputImage", () => {
    /*  a 2x2 opaque RGBA bitmap reused as codec input  */
    const rgba = Buffer.from([
        255, 0, 0, 255,   0, 255, 0, 255,
        0, 0, 255, 255,   255, 255, 0, 255
    ])

    it("detects PNG and JPEG from magic bytes, base64-encoded", () => {
        const png = new PNG({ width: 2, height: 2 })
        png.data = Buffer.from(rgba)
        const pngPath = join(tmpdir(), "nb-in.png")
        const jpgPath = join(tmpdir(), "nb-in.jpg")
        writeFileSync(pngPath, PNG.sync.write(png))
        writeFileSync(jpgPath, Buffer.from(jpeg.encode({ data: rgba, width: 2, height: 2 }, 90).data))
        try {
            expect(readInputImage(pngPath).mimeType).toBe("image/png")
            expect(readInputImage(jpgPath).mimeType).toBe("image/jpeg")
            expect(readInputImage(pngPath).data).toMatch(/^[A-Za-z0-9+/]+=*$/)
        }
        finally {
            rmSync(pngPath, { force: true })
            rmSync(jpgPath, { force: true })
        }
    })

    it("rejects an unsupported format", () => {
        const badPath = join(tmpdir(), "nb-in.bin")
        writeFileSync(badPath, Buffer.from([0x00, 0x01, 0x02, 0x03, 0x04]))
        try {
            expect(() => readInputImage(badPath)).toThrow(/unsupported input image format/)
        }
        finally {
            rmSync(badPath, { force: true })
        }
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

    it("reads the Atlas Cloud key only for the Atlas provider", () => {
        const prev = process.env[ATLAS_KEY_ENV_VARS[0]]
        process.env[ATLAS_KEY_ENV_VARS[0]] = "  atlas-key  "
        try {
            expect(resolveApiKey(undefined, "atlas")).toBe("atlas-key")
        }
        finally {
            if (prev === undefined)
                Reflect.deleteProperty(process.env, ATLAS_KEY_ENV_VARS[0])
            else
                process.env[ATLAS_KEY_ENV_VARS[0]] = prev
        }
    })

    it("throws an actionable error when no key is present", () => {
        const saved = KEY_ENV_VARS.map((name) => process.env[name])
        for (const name of KEY_ENV_VARS)
            Reflect.deleteProperty(process.env, name)
        try {
            expect(() => resolveApiKey()).toThrow(/No Gemini API key found/)
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
