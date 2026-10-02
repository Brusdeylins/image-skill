/*
**  nano-banana -- Deterministic Image-Generation CLI for LLM Agents
**  Copyright (c) 2026 Matthias Brusdeylins
**  Licensed under MIT license <https://spdx.org/licenses/MIT>
**
**  main.test: run cli/main in-process with the generation calls mocked and
**  assert the success envelope and the inputs handed to the core modules.
*/

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { mkdirSync, writeFileSync } from "node:fs"
import { join, sep } from "node:path"
import { pngBytes, useTmpDirs } from "./helpers.js"

/**  the generation calls, replaced by mocks  */
const core = vi.hoisted(() => ({
    generateImage: vi.fn(),
    generateVideo: vi.fn()
}))

/**  the OS trust store is never touched by the tests  */
const tlsMock = vi.hoisted(() => ({ trustSystemCAs: vi.fn() }))

/**  an optional stand-in for the input-image reader; the real reader runs when unset  */
const imageFile = vi.hoisted(() => ({ stub: undefined as ((path: string) => { mimeType: string, data: string }) | undefined }))

vi.mock("../src/infra/imagefile.js", async (importOriginal) => {
    const real = await importOriginal<typeof import("../src/infra/imagefile.js")>()
    return { ...real, readInputImage: (path: string) => imageFile.stub?.(path) ?? real.readInputImage(path) }
})
vi.mock("../src/infra/tls.js", () => ({ trustSystemCAs: tlsMock.trustSystemCAs }))
vi.mock("../src/core/generate.js", () => ({ generateImage: core.generateImage }))
vi.mock("../src/core/video.js", async (importOriginal) => ({
    ...await importOriginal<typeof import("../src/core/video.js")>(),
    generateVideo: core.generateVideo
}))

describe("main", () => {
    const tmp = useTmpDirs()
    const lines: string[] = []
    let exit: ReturnType<typeof vi.spyOn>

    /*  write a valid PNG into a fresh temporary directory and return its path  */
    const pngFile = (name: string): string => {
        const path = join(tmp(), name)
        writeFileSync(path, pngBytes())
        return path
    }

    const argv = process.argv

    /*  import main with the given CLI args and wait until it printed one envelope  */
    const run = async (...args: string[]): Promise<Record<string, unknown>> => {
        process.argv = ["node", "nano-banana", ...args]
        await import("../src/cli/main.js")
        await vi.waitFor(() => expect(lines.length).toBeGreaterThan(0))
        return JSON.parse(lines.join("").trim()) as Record<string, unknown>
    }

    beforeEach(() => {
        lines.length = 0
        vi.resetModules()
        core.generateImage.mockReset()
        core.generateVideo.mockReset()
        tlsMock.trustSystemCAs.mockReset()
        imageFile.stub = undefined
        vi.stubEnv("GEMINI_API_KEY", "k-test")
        vi.spyOn(console, "error").mockImplementation(() => undefined)
        vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
            lines.push(String(chunk))
            return true
        })
        exit = vi.spyOn(process, "exit").mockImplementation((() => undefined) as never)
    })

    afterEach(() => {
        process.argv = argv
        vi.unstubAllEnvs()
        vi.restoreAllMocks()
    })

    it("emits the image envelope with image_size and passes the resolved inputs", async () => {
        core.generateImage.mockResolvedValue({ file: "o.png", aspectRatio: "4:3", model: "gemini-3-pro-image" })
        const env = await run("--prompt", "a cat", "--output", "o.png", "--aspect-ratio", "4:3", "--image-size", "2K")
        expect(env).toEqual({ status: "ok", file: "o.png", aspect_ratio: "4:3", model: "gemini-3-pro-image", image_size: "2K" })
        expect(core.generateImage).toHaveBeenCalledWith({
            apiKey: "k-test", prompt: "a cat", outputPath: "o.png", model: "gemini-3-pro-image", aspectRatio: "4:3", imageSize: "2K"
        })
        expect(exit).not.toHaveBeenCalled()
        expect(tlsMock.trustSystemCAs).toHaveBeenCalledTimes(1)
    })

    it("omits image_size from the envelope and the input when not requested", async () => {
        core.generateImage.mockResolvedValue({ file: "o.png", aspectRatio: "16:9", model: "gemini-3-pro-image" })
        const env = await run("--prompt", "a cat", "--output", "o.png")
        expect(env).toEqual({ status: "ok", file: "o.png", aspect_ratio: "16:9", model: "gemini-3-pro-image" })
        expect(core.generateImage.mock.lastCall?.[0]).not.toHaveProperty("imageSize")
        expect(core.generateImage.mock.lastCall?.[0]).not.toHaveProperty("inputImages")
    })

    it("emits the video envelope with resolution and passes resolution and negative prompt", async () => {
        core.generateVideo.mockResolvedValue({ file: "o.mp4", aspectRatio: "9:16", model: "gemini-omni-1.1-flash" })
        const env = await run("--video", "--prompt", "a cat", "--output", "o.mp4", "--aspect-ratio", "9:16",
            "--resolution", "1080p", "--negative-prompt", "blur")
        expect(env).toEqual({ status: "ok", file: "o.mp4", aspect_ratio: "9:16", model: "gemini-omni-1.1-flash", resolution: "1080p" })
        expect(core.generateVideo).toHaveBeenCalledWith({
            apiKey: "k-test", prompt: "a cat", outputPath: "o.mp4", model: "gemini-omni-1.1-flash", aspectRatio: "9:16",
            resolution: "1080p", negativePrompt: "blur"
        })
    })

    it("treats an unknown video model id as permissive: any resolution and orientation pass the CLI validation", async () => {
        core.generateVideo.mockResolvedValue({ file: "o.mp4", aspectRatio: "9:16", model: "future-video-9" })
        const env = await run("--video", "--prompt", "a cat", "--output", "o.mp4", "--model", "future-video-9",
            "--aspect-ratio", "9:16", "--resolution", "4k")
        expect(env).toMatchObject({ status: "ok", aspect_ratio: "9:16", resolution: "4k", model: "future-video-9" })
        expect(exit).not.toHaveBeenCalled()
        expect(core.generateVideo.mock.lastCall?.[0]).toMatchObject({ model: "future-video-9", aspectRatio: "9:16", resolution: "4k" })
    })

    it("treats a former -preview alias as an unknown image id with the full ratio and size sets", async () => {
        core.generateImage.mockResolvedValue({ file: "o.png", aspectRatio: "1:4", model: "gemini-3-pro-image-preview" })
        const env = await run("--prompt", "a cat", "--output", "o.png", "--model", "gemini-3-pro-image-preview",
            "--aspect-ratio", "1:4", "--image-size", "512")
        expect(env).toMatchObject({ status: "ok", aspect_ratio: "1:4", image_size: "512" })
        expect(exit).not.toHaveBeenCalled()
    })

    it("rejects --duration as an unknown option with exit code 2", async () => {
        const env = await run("--video", "--prompt", "a cat", "--output", "o.mp4", "--duration", "8")
        expect(env["status"]).toBe("error")
        expect(String(env["message"])).toContain("--duration")
        expect(exit).toHaveBeenCalledWith(2)
        expect(core.generateVideo).not.toHaveBeenCalled()
    })

    it("defaults to Omni in video mode and emits no optional fields", async () => {
        core.generateVideo.mockResolvedValue({ file: "o.mp4", aspectRatio: "16:9", model: "gemini-omni-1.1-flash" })
        const env = await run("--video", "--prompt", "a cat", "--output", "o.mp4")
        expect(env).toEqual({ status: "ok", file: "o.mp4", aspect_ratio: "16:9", model: "gemini-omni-1.1-flash" })
        expect(core.generateVideo).toHaveBeenCalledWith({
            apiKey: "k-test", prompt: "a cat", outputPath: "o.mp4", model: "gemini-omni-1.1-flash", aspectRatio: "16:9"
        })
    })

    it("turns a rejected generation into an error envelope with exit code 1", async () => {
        core.generateImage.mockRejectedValue(new Error("No image returned by API"))
        const env = await run("--prompt", "a cat", "--output", "o.png")
        expect(env).toEqual({ status: "error", message: "No image returned by API" })
        expect(exit).toHaveBeenCalledWith(1)
    })

    it("hands two --input PNGs to the image generation as inputImages", async () => {
        core.generateImage.mockResolvedValue({ file: "o.png", aspectRatio: "16:9", model: "gemini-3-pro-image" })
        await run("--prompt", "edit", "--output", "o.png", "--input", pngFile("a.png"), "--input", pngFile("b.png"))
        const images = (core.generateImage.mock.lastCall?.[0] as { inputImages: { mimeType: string, data: string }[] }).inputImages
        expect(images).toHaveLength(2)
        expect(images.map((i) => i.mimeType)).toEqual(["image/png", "image/png"])
        expect(images[0]?.data).toBe(pngBytes().toString("base64"))
    })

    it("hands one --input to the video generation as inputImage, not inputImages", async () => {
        core.generateVideo.mockResolvedValue({ file: "o.mp4", aspectRatio: "16:9", model: "gemini-omni-1.1-flash" })
        await run("--video", "--prompt", "a cat", "--output", "o.mp4", "--input", pngFile("a.png"))
        const input = core.generateVideo.mock.lastCall?.[0] as Record<string, unknown>
        expect(input["inputImage"]).toEqual({ mimeType: "image/png", data: pngBytes().toString("base64") })
        expect(input).not.toHaveProperty("inputImages")
    })

    it("does not forward an empty --negative-prompt", async () => {
        core.generateVideo.mockResolvedValue({ file: "o.mp4", aspectRatio: "16:9", model: "gemini-omni-1.1-flash" })
        await run("--video", "--prompt", "a cat", "--output", "o.mp4", "--negative-prompt", "")
        expect(core.generateVideo.mock.lastCall?.[0]).not.toHaveProperty("negativePrompt")
    })

    /*  stub the reader so each image carries `length` base64 characters  */
    const bigImages = (length: number): void => {
        imageFile.stub = () => ({ mimeType: "image/png", data: "A".repeat(length) })
    }

    it("accepts an aggregate inline input of exactly 20,000,000 bytes (images plus prompt)", async () => {
        core.generateImage.mockResolvedValue({ file: "o.png", aspectRatio: "16:9", model: "gemini-3-pro-image" })
        /*  two images of 9,999,998 characters plus the 4-byte prompt make exactly the limit  */
        bigImages(9_999_998)
        const env = await run("--prompt", "abcd", "--output", "o.png", "--input", "a.png", "--input", "b.png")
        expect(env["status"]).toBe("ok")
        expect(core.generateImage).toHaveBeenCalledTimes(1)
        expect(exit).not.toHaveBeenCalled()
    })

    it("rejects an aggregate inline input of 20,000,001 bytes with exit code 2", async () => {
        bigImages(9_999_999)
        const env = await run("--prompt", "abcd", "--output", "o.png", "--input", "a.png", "--input", "b.png")
        expect(env["status"]).toBe("error")
        expect(String(env["message"])).toMatch(/^inline input too large: 20\.0 MB exceeds the 20 MB request limit/)
        expect(exit).toHaveBeenCalledWith(2)
        expect(core.generateImage).not.toHaveBeenCalled()
    })

    it("counts the prompt bytes, not its characters, toward the aggregate limit", async () => {
        /*  one image of 19,999,998 characters plus a 2-character prompt of 4 bytes is 20,000,002  */
        bigImages(19_999_998)
        const env = await run("--prompt", "\u00e4\u00e4", "--output", "o.png", "--input", "a.png")
        expect(String(env["message"])).toMatch(/^inline input too large:/)
        expect(exit).toHaveBeenCalledWith(2)
    })

    it.each([
        ["an empty prompt", ""],
        ["a whitespace-only prompt", " \t\n "]
    ])("rejects %s with exit code 2 before generating", async (_name, prompt) => {
        const env = await run("--prompt", prompt, "--output", "o.png")
        expect(env).toEqual({ status: "error", message: "--prompt must not be empty" })
        expect(exit).toHaveBeenCalledWith(2)
        expect(core.generateImage).not.toHaveBeenCalled()
        expect(tlsMock.trustSystemCAs).not.toHaveBeenCalled()
    })

    it("rejects an empty --output as a usage error", async () => {
        const env = await run("--prompt", "a cat", "--output", "")
        expect(env).toEqual({ status: "error", message: "--output must not be empty" })
        expect(exit).toHaveBeenCalledWith(2)
        expect(core.generateImage).not.toHaveBeenCalled()
    })

    it("rejects an --output with a trailing separator as a directory", async () => {
        const output = `${tmp()}${sep}`
        const env = await run("--prompt", "a cat", "--output", output)
        expect(env).toEqual({ status: "error", message: `output path is a directory: ${output}` })
        expect(exit).toHaveBeenCalledWith(2)
        expect(core.generateImage).not.toHaveBeenCalled()
    })

    it("rejects an --output naming an existing directory", async () => {
        const output = join(tmp(), "existing")
        mkdirSync(output)
        const env = await run("--prompt", "a cat", "--output", output)
        expect(env).toEqual({ status: "error", message: `output path is a directory: ${output}` })
        expect(exit).toHaveBeenCalledWith(2)
        expect(core.generateImage).not.toHaveBeenCalled()
    })
})
