/*
**  nano-banana -- Deterministic Image-Generation CLI for LLM Agents
**  Copyright (c) 2026 Matthias Brusdeylins
**  Licensed under MIT license <https://spdx.org/licenses/MIT>
**
**  unit.test: cover the pure, network-free logic -- the arg parser, the
**  image and video model tables, the API-key resolution, the input-image
**  reader and the PNG normalization. The CLI bundle, the generation calls
**  and the success envelope are covered by cli.test, omni.test,
**  generate.test and main.test.
*/

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { mkdirSync, writeFileSync } from "node:fs"
import tls from "node:tls"
import { join } from "node:path"
import { PNG } from "pngjs"
import { parseCli } from "../src/infra/args.js"
import { resolveApiKey, KEY_ENV_VARS } from "../src/infra/apikey.js"
import { MODELS, DEFAULT_MODEL, aspectRatiosForModel, imageSizesForModel, imageModelInfo } from "../src/core/models.js"
import {
    VIDEO_MODELS, DEFAULT_VIDEO_MODEL, isOmniModel, videoModelInfo,
    videoAspectRatiosForModel, videoResolutionsForModel
} from "../src/core/video.js"
import { readInputImage, MAX_INPUT_BYTES, MAX_INPUT_IMAGES, MAX_VIDEO_INPUT_IMAGES } from "../src/infra/imagefile.js"
import { toPng, isPng, isJpeg } from "../src/core/png.js"
import { errorMessage } from "../src/infra/envelope.js"
import { trustSystemCAs } from "../src/infra/tls.js"
import { PNG_SIGNATURE, pngBytes, jpegBytes, useTmpDirs } from "./helpers.js"

/**  a hook letting a test replace readFileSync (the ESM namespace cannot be spied)  */
const fsHook = vi.hoisted(() => ({ read: undefined as (() => Buffer) | undefined }))

vi.mock("node:fs", async (importOriginal) => {
    const real = await importOriginal<typeof import("node:fs")>()
    const realRead = real.readFileSync as (...args: unknown[]) => unknown
    return { ...real, readFileSync: (...args: unknown[]) => fsHook.read?.() ?? realRead(...args) }
})

describe("parseCli", () => {
    it("parses string options and boolean switches", () => {
        const values = parseCli(["--prompt", "a cat", "--output", "c.png", "--list-models"])
        expect(values["prompt"]).toBe("a cat")
        expect(values["output"]).toBe("c.png")
        expect(values["list-models"]).toBe(true)
    })

    it("keeps a `--`-prefixed value via the `=` form ", () => {
        const values = parseCli(["--prompt=--dramatic lighting", "--output", "c.png"])
        expect(values["prompt"]).toBe("--dramatic lighting")
    })

    it("collects a repeated --input in order", () => {
        expect(parseCli(["--input", "a.png", "--input", "b.png"])["input"]).toEqual(["a.png", "b.png"])
    })

    it("rejects an unknown flag", () => {
        expect(() => parseCli(["--nope"])).toThrow(/Unknown option '--nope'/)
    })

    it("rejects a space-separated value that begins with `-`", () => {
        expect(() => parseCli(["--prompt", "--dramatic"])).toThrow()
    })

    it("rejects a positional argument", () => {
        expect(() => parseCli(["stray"])).toThrow()
    })
})

describe("aspectRatiosForModel", () => {
    it("gives 10 standard ratios to Pro and Lite, 14 to Nano Banana 2", () => {
        expect(aspectRatiosForModel("gemini-3-pro-image")).toHaveLength(10)
        expect(aspectRatiosForModel("gemini-3.1-flash-lite-image")).toHaveLength(10)
        expect(aspectRatiosForModel("gemini-3.1-flash-image")).toHaveLength(14)
    })

    it("offers the extreme ratios only on Nano Banana 2", () => {
        expect(aspectRatiosForModel("gemini-3-pro-image")).not.toContain("1:4")
        expect(aspectRatiosForModel("gemini-3.1-flash-image")).toContain("1:4")
    })

    it("treats a former -preview alias as an unknown id with the full set of 14", () => {
        for (const id of ["gemini-3-pro-image-preview", "gemini-3.1-flash-lite-image-preview", "gemini-2.5-flash-image"])
            expect(aspectRatiosForModel(id)).toHaveLength(14)
    })

    it("gives an unknown id the full set of 14", () => {
        expect(aspectRatiosForModel("gemini-9-image")).toHaveLength(14)
        expect(aspectRatiosForModel("gemini-9-image")).toContain("1:8")
    })
})

describe("imageSizesForModel", () => {
    it("gives 1K-only to Lite, 1K/2K/4K to Pro, +512 to Nano Banana 2", () => {
        expect(imageSizesForModel("gemini-3.1-flash-lite-image")).toEqual(["1K"])
        expect(imageSizesForModel("gemini-3-pro-image")).toEqual(["1K", "2K", "4K"])
        expect(imageSizesForModel("gemini-3.1-flash-image")).toEqual(["512", "1K", "2K", "4K"])
    })

    it("offers 512 only on Nano Banana 2", () => {
        expect(imageSizesForModel("gemini-3-pro-image")).not.toContain("512")
        expect(imageSizesForModel("gemini-3.1-flash-image")).toContain("512")
    })

    it("treats a former -preview alias as an unknown id with the full token set", () => {
        for (const id of ["gemini-3-pro-image-preview", "gemini-3.1-flash-lite-image-preview", "gemini-2.5-flash-image"])
            expect(imageSizesForModel(id)).toEqual(["512", "1K", "2K", "4K"])
    })

    it("gives an unknown id the full token set", () => {
        expect(imageSizesForModel("gemini-9-image")).toEqual(["512", "1K", "2K", "4K"])
    })
})

describe("model catalogs", () => {
    it("pins the defaults to a catalog entry", () => {
        expect(DEFAULT_MODEL).toBe("gemini-3-pro-image")
        expect(DEFAULT_VIDEO_MODEL).toBe("gemini-omni-1.1-flash")
        expect(MODELS.map((m) => m.id)).toContain(DEFAULT_MODEL)
        expect(VIDEO_MODELS.map((m) => m.id)).toContain(DEFAULT_VIDEO_MODEL)
    })
})

describe("imageModelInfo", () => {
    it("finds a tier by its exact id", () => {
        expect(imageModelInfo("gemini-3-pro-image")?.name).toBe("Nano Banana Pro")
        expect(imageModelInfo("gemini-3.1-flash-image")?.name).toBe("Nano Banana 2")
    })

    it("has no entry for an unknown id, a former alias, a video id or a shut-down model", () => {
        for (const id of ["gemini-9-image", "gemini-3-pro-image-preview", "gemini-2.5-flash-image", "gemini-omni-1.1-flash", "veo-3.1-generate-preview"])
            expect(imageModelInfo(id)).toBeUndefined()
    })

    it("lists exactly the three image tiers without sunset fields", () => {
        expect(MODELS.map((m) => m.id)).toEqual(["gemini-3.1-flash-lite-image", "gemini-3-pro-image", "gemini-3.1-flash-image"])
        for (const m of MODELS)
            expect(m).not.toHaveProperty("sunset")
    })
})

describe("videoModelInfo", () => {
    it("finds the Omni tier by its exact id", () => {
        expect(videoModelInfo("gemini-omni-1.1-flash")?.name).toBe("Gemini Omni Flash")
    })

    it("maps an unknown Omni id to the Omni tier", () => {
        expect(videoModelInfo("gemini-omni-9-pro")?.id).toBe("gemini-omni-1.1-flash")
    })

    it("has no entry for a Veo id or an image id", () => {
        expect(videoModelInfo("veo-3.1-generate-preview")).toBeUndefined()
        expect(videoModelInfo("gemini-3-pro-image")).toBeUndefined()
    })
})

describe("video model tables", () => {
    it("has only the Omni tier in the catalog", () => {
        expect(VIDEO_MODELS.map((m) => m.id)).toEqual(["gemini-omni-1.1-flash"])
    })

    it("gives Omni 16:9 + 9:16 and 360p-4k", () => {
        expect(videoAspectRatiosForModel("gemini-omni-1.1-flash")).toEqual(["16:9", "9:16"])
        expect(videoResolutionsForModel("gemini-omni-1.1-flash")).toEqual(["360p", "720p", "1080p", "4k"])
    })

    it("does not second-guess an unknown id", () => {
        expect(videoAspectRatiosForModel("veo-3.1-generate-preview")).toEqual(["16:9", "9:16"])
        expect(videoResolutionsForModel("veo-3.1-generate-preview")).toEqual(["360p", "720p", "1080p", "4k"])
    })

    it("gives an unknown Omni id the Omni tier", () => {
        expect(videoAspectRatiosForModel("gemini-omni-9-pro")).toEqual(["16:9", "9:16"])
        expect(videoResolutionsForModel("gemini-omni-9-pro")).toEqual(["360p", "720p", "1080p", "4k"])
    })
})

describe("isOmniModel", () => {
    it("recognizes the Omni id prefix only", () => {
        expect(isOmniModel("gemini-omni-1.1-flash")).toBe(true)
        expect(isOmniModel("gemini-omni-9-pro")).toBe(true)
        expect(isOmniModel("veo-3.1-generate-preview")).toBe(false)
        expect(isOmniModel("gemini-3-pro-image")).toBe(false)
        expect(isOmniModel("my-gemini-omni")).toBe(false)
        expect(isOmniModel("")).toBe(false)
    })
})

describe("isPng / isJpeg", () => {
    it("recognize their own signature only", () => {
        expect(isPng(pngBytes())).toBe(true)
        expect(isJpeg(pngBytes())).toBe(false)
        expect(isJpeg(jpegBytes())).toBe(true)
        expect(isPng(jpegBytes())).toBe(false)
    })

    it("reject empty, one-byte and truncated-signature input", () => {
        expect(isPng(Buffer.alloc(0))).toBe(false)
        expect(isJpeg(Buffer.alloc(0))).toBe(false)
        expect(isJpeg(Buffer.from([0xff]))).toBe(false)
        expect(isPng(PNG_SIGNATURE.subarray(0, 7))).toBe(false)
        expect(isPng(PNG_SIGNATURE)).toBe(true)
    })
})

describe("input image limits", () => {
    it("allows several images for image mode and exactly one for video", () => {
        expect(MAX_VIDEO_INPUT_IMAGES).toBe(1)
        expect(MAX_INPUT_IMAGES).toBe(14)
    })

    it("caps one input image at exactly 7 MiB", () => {
        expect(MAX_INPUT_BYTES).toBe(7 * 1024 * 1024)
    })
})

describe("toPng", () => {
    it("re-encodes JPEG bytes into a true PNG", () => {
        const jpg = jpegBytes()
        expect(jpg.subarray(0, 2)).toEqual(Buffer.from([0xff, 0xd8]))
        const out = toPng(jpg, "image/jpeg")
        expect(out.subarray(0, 8)).toEqual(PNG_SIGNATURE)
        const decoded = PNG.sync.read(out)
        expect([decoded.width, decoded.height]).toEqual([2, 2])
    })

    it("passes PNG bytes through untouched", () => {
        const bytes = pngBytes()
        const out = toPng(bytes, "image/png")
        expect(out).toBe(bytes)
    })

    it("converts JPEG bytes regardless of an undefined mimeType (bytes win)", () => {
        expect(toPng(jpegBytes(), undefined).subarray(0, 8)).toEqual(PNG_SIGNATURE)
    })

    it("rejects an unsupported format", () => {
        expect(() => toPng(Buffer.from([0x00, 0x01, 0x02, 0x03]), "image/gif"))
            .toThrow(/Unsupported image format/)
    })

    it("names an undefined mimeType as unknown in the error", () => {
        expect(() => toPng(Buffer.from([0x00, 0x01, 0x02, 0x03]), undefined))
            .toThrow("mimeType=unknown")
    })

    it("rejects empty and one-byte input", () => {
        expect(() => toPng(Buffer.alloc(0), undefined)).toThrow(/Unsupported image format/)
        expect(() => toPng(Buffer.from([0xff]), undefined)).toThrow(/Unsupported image format/)
    })

    it("throws on a truncated JPEG instead of writing a broken PNG", () => {
        expect(() => toPng(jpegBytes().subarray(0, 20), "image/jpeg")).toThrow()
    })
})

describe("readInputImage", () => {
    const tmp = useTmpDirs()

    /*  write `bytes` to a fresh file and return its path  */
    const file = (name: string, bytes: Buffer): string => {
        const path = join(tmp(), name)
        writeFileSync(path, bytes)
        return path
    }

    /*  a RIFF container of the given form type  */
    const riff = (form: string): Buffer =>
        Buffer.concat([Buffer.from("RIFF"), Buffer.from([0x10, 0, 0, 0]), Buffer.from(form), Buffer.alloc(8)])

    it("detects PNG and JPEG from magic bytes, base64-encoded", () => {
        const pngPath = file("in.png", pngBytes())
        const jpgPath = file("in.jpg", jpegBytes())
        expect(readInputImage(pngPath).mimeType).toBe("image/png")
        expect(readInputImage(jpgPath).mimeType).toBe("image/jpeg")
        expect(readInputImage(pngPath).data).toMatch(/^[A-Za-z0-9+/]+=*$/)
    })

    it("detects WEBP from the RIFF header and the WEBP form type", () => {
        const img = readInputImage(file("in.bin", riff("WEBP")))
        expect(img.mimeType).toBe("image/webp")
        expect(Buffer.from(img.data, "base64").equals(riff("WEBP"))).toBe(true)
    })

    it("rejects a RIFF container that is not WEBP", () => {
        expect(() => readInputImage(file("in.wav", riff("WAVE")))).toThrow(/unsupported input image format/)
    })

    it("types by magic bytes, not by extension", () => {
        expect(readInputImage(file("in.jpg", pngBytes())).mimeType).toBe("image/png")
    })

    it("rejects an unsupported format", () => {
        const path = file("in.bin", Buffer.from([0x00, 0x01, 0x02, 0x03, 0x04]))
        expect(() => readInputImage(path)).toThrow(/unsupported input image format/)
    })

    it("accepts a file of exactly the maximum size", () => {
        const bytes = Buffer.concat([PNG_SIGNATURE, Buffer.alloc(MAX_INPUT_BYTES - PNG_SIGNATURE.length)])
        expect(bytes.length).toBe(MAX_INPUT_BYTES)
        expect(readInputImage(file("max.png", bytes)).mimeType).toBe("image/png")
    })

    it("rejects a file one byte over the maximum size", () => {
        const bytes = Buffer.concat([PNG_SIGNATURE, Buffer.alloc(MAX_INPUT_BYTES + 1 - PNG_SIGNATURE.length)])
        expect(() => readInputImage(file("big.png", bytes))).toThrow(/input image too large/)
    })

    it("rejects an empty file", () => {
        expect(() => readInputImage(file("empty.png", Buffer.alloc(0)))).toThrow(/unsupported input image format/)
    })

    it("throws on a missing file", () => {
        const path = join(tmp(), "missing.png")
        expect(() => readInputImage(path)).toThrow(`cannot read input image: ${path}`)
    })

    it("rejects a directory as not a regular file", () => {
        const dir = join(tmp(), "dir.png")
        mkdirSync(dir)
        expect(() => readInputImage(dir)).toThrow(/not a regular file/)
    })

    describe("with a replaced readFileSync", () => {
        afterEach(() => {
            fsHook.read = undefined
        })

        it("wraps a read failure after a successful stat, keeping the cause", () => {
            const path = file("ok.png", pngBytes())
            fsHook.read = () => {
                throw new Error("EIO")
            }
            let caught: unknown
            try {
                readInputImage(path)
            }
            catch (err) {
                caught = err
            }
            expect((caught as Error).message).toBe(`cannot read input image: ${path}`)
            expect((caught as Error).cause).toBeDefined()
        })

        it("re-checks the size of the bytes actually read", () => {
            const path = file("small.png", pngBytes())
            fsHook.read = () => Buffer.alloc(MAX_INPUT_BYTES + 1)
            expect(() => readInputImage(path)).toThrow(/input image too large/)
        })
    })
})

describe("resolveApiKey", () => {
    const tmp = useTmpDirs()

    /*  the environment starts without any key variable  */
    const clearEnv = (): void => {
        for (const name of KEY_ENV_VARS)
            vi.stubEnv(name, undefined)
    }

    afterEach(() => {
        vi.unstubAllEnvs()
    })

    it.each([
        ["a newline", "abc\ndef"],
        ["a tab", "abc\tdef"],
        ["an inner space", "abc def"]
    ])("rejects an environment key with %s without echoing it", (_name, key) => {
        clearEnv()
        vi.stubEnv("GEMINI_API_KEY", key)
        let message = ""
        try {
            resolveApiKey()
        }
        catch (err) {
            message = (err as Error).message
        }
        expect(message).toContain("not valid in an HTTP header")
        expect(message).not.toContain("abc")
        expect(message).not.toContain("def")
    })

    it.each([
        ["a newline", "abc\ndef"],
        ["a tab", "abc\tdef"],
        ["an inner space", "abc def"]
    ])("rejects a key file with %s without echoing it", (_name, key) => {
        const path = join(tmp(), "key.txt")
        writeFileSync(path, key)
        let message = ""
        try {
            resolveApiKey(path)
        }
        catch (err) {
            message = (err as Error).message
        }
        expect(message).toContain("not valid in an HTTP header")
        expect(message).not.toContain("abc")
        expect(message).not.toContain("def")
    })

    it("accepts letters, digits, hyphen and underscore in an environment key and a key file", () => {
        clearEnv()
        vi.stubEnv("GEMINI_API_KEY", "AIza-Sy_09xZ")
        expect(resolveApiKey()).toBe("AIza-Sy_09xZ")
        const path = join(tmp(), "key.txt")
        writeFileSync(path, "AIza-Sy_09xZ\n")
        expect(resolveApiKey(path)).toBe("AIza-Sy_09xZ")
    })

    it("reads the key from the environment, trimmed", () => {
        clearEnv()
        vi.stubEnv("GEMINI_API_KEY", "  secret-key  ")
        expect(resolveApiKey()).toBe("secret-key")
    })

    it("falls back to GOOGLE_API_KEY", () => {
        clearEnv()
        vi.stubEnv("GOOGLE_API_KEY", "google-key")
        expect(resolveApiKey()).toBe("google-key")
    })

    it("prefers GEMINI_API_KEY over GOOGLE_API_KEY", () => {
        vi.stubEnv("GEMINI_API_KEY", "gemini-key")
        vi.stubEnv("GOOGLE_API_KEY", "google-key")
        expect(resolveApiKey()).toBe("gemini-key")
    })

    it("falls through a whitespace-only GEMINI_API_KEY", () => {
        vi.stubEnv("GEMINI_API_KEY", "   ")
        vi.stubEnv("GOOGLE_API_KEY", "google-key")
        expect(resolveApiKey()).toBe("google-key")
    })

    it("throws an actionable error when no key is present", () => {
        clearEnv()
        expect(() => resolveApiKey()).toThrow(/No API key found/)
    })

    it("throws when every variable is whitespace-only", () => {
        vi.stubEnv("GEMINI_API_KEY", " ")
        vi.stubEnv("GOOGLE_API_KEY", "\t")
        expect(() => resolveApiKey()).toThrow(/No API key found/)
    })

    it("reads a key file, trimmed, ahead of the environment", () => {
        vi.stubEnv("GEMINI_API_KEY", "env-key")
        const path = join(tmp(), "key.txt")
        writeFileSync(path, "  file-key\n")
        expect(resolveApiKey(path)).toBe("file-key")
    })

    it("rejects an empty or whitespace-only key file", () => {
        const path = join(tmp(), "key.txt")
        writeFileSync(path, " \n")
        expect(() => resolveApiKey(path)).toThrow(/API key file is empty/)
    })

    it("rejects a missing key file without falling back to the environment", () => {
        vi.stubEnv("GEMINI_API_KEY", "env-key")
        expect(() => resolveApiKey(join(tmp(), "missing.txt"))).toThrow(/cannot read API key file/)
    })
})

describe("errorMessage", () => {
    it("returns the message of an Error", () => {
        expect(errorMessage(new Error("boom"))).toBe("boom")
        expect(errorMessage(new TypeError("bad type"))).toBe("bad type")
    })

    it("returns the string form of a non-Error value", () => {
        expect(errorMessage("plain text")).toBe("plain text")
        expect(errorMessage(undefined)).toBe("undefined")
        expect(errorMessage(42)).toBe("42")
    })
})

describe("trustSystemCAs", () => {
    /*  the live node:tls object the module under test reads its members from  */
    const live = tls as unknown as Record<string, unknown>
    const names = ["getCACertificates", "setDefaultCACertificates"] as const
    const saved = names.map((name) => Object.getOwnPropertyDescriptor(live, name))
    let store: { default: string[], system: string[] }
    let setDefault: ReturnType<typeof vi.fn>
    let getCa: ReturnType<typeof vi.fn>

    beforeEach(() => {
        store = { default: ["bundled", "extra"], system: [] }
        setDefault = vi.fn()
        getCa = vi.fn((type: "default" | "system") => store[type])
        Object.defineProperty(live, "getCACertificates", { value: getCa, configurable: true, writable: true })
        Object.defineProperty(live, "setDefaultCACertificates", { value: setDefault, configurable: true, writable: true })
    })

    afterEach(() => {
        names.forEach((name, i) => {
            const descriptor = saved[i]
            if (descriptor !== undefined)
                Object.defineProperty(live, name, descriptor)
            else
                Reflect.deleteProperty(live, name)
        })
    })

    it("does not touch the default set when the system store is empty", () => {
        trustSystemCAs()
        expect(getCa).toHaveBeenCalledWith("system")
        expect(setDefault).not.toHaveBeenCalled()
    })

    it("sets the current defaults plus the system certificates, without duplicates", () => {
        store.system = ["extra", "zscaler", "zscaler"]
        trustSystemCAs()
        expect(setDefault).toHaveBeenCalledTimes(1)
        expect(setDefault).toHaveBeenCalledWith(["bundled", "extra", "zscaler"])
    })

    it("swallows a throwing getCACertificates and leaves the defaults alone", () => {
        getCa.mockImplementation(() => {
            throw new Error("keychain locked")
        })
        expect(() => trustSystemCAs()).not.toThrow()
        expect(setDefault).not.toHaveBeenCalled()
    })

    it("swallows a throwing setDefaultCACertificates", () => {
        store.system = ["zscaler"]
        setDefault.mockImplementation(() => {
            throw new Error("rejected")
        })
        expect(() => trustSystemCAs()).not.toThrow()
    })

    it.each([
        ["getCACertificates", "setDefaultCACertificates"],
        ["setDefaultCACertificates", "getCACertificates"]
    ] as const)("is a no-op without %s and leaves %s uncalled", (missing, other) => {
        /*  a non-empty system store, so a removed guard would reach setDefault or getCa  */
        store.system = ["zscaler"]
        const mocks = { getCACertificates: getCa, setDefaultCACertificates: setDefault }
        Reflect.deleteProperty(live, missing)
        expect(() => trustSystemCAs()).not.toThrow()
        expect(mocks[other]).not.toHaveBeenCalled()
    })
})
