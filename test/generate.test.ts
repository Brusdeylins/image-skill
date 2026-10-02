/*
**  nano-banana -- Deterministic Image-Generation CLI for LLM Agents
**  Copyright (c) 2026 Matthias Brusdeylins
**  Licensed under MIT license <https://spdx.org/licenses/MIT>
**
**  generate.test: cover generateImage with a mocked `@google/genai` -- the
**  request contents and config, the part selection and the error texts.
*/

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { generateImage, type GenerateInput } from "../src/core/generate.js"
import { PNG_SIGNATURE, pngBytes, useTmpDirs } from "./helpers.js"

/**  the SDK surface the code under test touches  */
const sdk = vi.hoisted(() => ({
    ctor: vi.fn(),
    generateContent: vi.fn()
}))

vi.mock("@google/genai", () => ({
    GoogleGenAI: function (this: unknown, opts: unknown) {
        sdk.ctor(opts)
        return { models: { generateContent: sdk.generateContent } }
    }
}))

/**  real PNG bytes, base64-encoded as the API returns them  */
const pngBase64 = (): string => pngBytes().toString("base64")

/**  a response whose first candidate carries `parts`  */
const withParts = (parts: unknown[], finishReason?: string): Record<string, unknown> =>
    ({ candidates: [{ content: { parts }, ...(finishReason !== undefined ? { finishReason } : {}) }] })

describe("generateImage", () => {
    const tmp = useTmpDirs()
    let out: string

    /*  the request inputs with the defaults  */
    const input = (extra: Partial<GenerateInput> = {}): GenerateInput =>
        ({ apiKey: "k", prompt: "a cat", outputPath: out, model: "gemini-3-pro-image", aspectRatio: "16:9", ...extra })

    /*  the single request object handed to generateContent  */
    const request = (): { model: string, contents: unknown, config: { responseModalities: string[], imageConfig: Record<string, unknown>, abortSignal: unknown } } =>
        sdk.generateContent.mock.lastCall?.[0]

    beforeEach(() => {
        sdk.ctor.mockReset()
        sdk.generateContent.mockReset()
        out = join(tmp(), "img.png")
    })

    afterEach(() => {
        vi.restoreAllMocks()
    })

    it("sends the bare prompt string and omits imageSize when unset", async () => {
        sdk.generateContent.mockResolvedValue(withParts([{ inlineData: { data: pngBase64(), mimeType: "image/png" } }]))
        const result = await generateImage(input())
        expect(sdk.ctor).toHaveBeenCalledWith({ apiKey: "k" })
        expect(request().model).toBe("gemini-3-pro-image")
        expect(request().contents).toBe("a cat")
        expect(request().config.responseModalities).toEqual(["IMAGE"])
        expect(request().config.imageConfig).toEqual({ aspectRatio: "16:9" })
        expect(request().config.abortSignal).toBeInstanceOf(AbortSignal)
        expect(result).toEqual({ file: out, aspectRatio: "16:9", model: "gemini-3-pro-image" })
        expect(readFileSync(out).subarray(0, 8)).toEqual(PNG_SIGNATURE)
    })

    it("passes imageSize when given", async () => {
        sdk.generateContent.mockResolvedValue(withParts([{ inlineData: { data: pngBase64() } }]))
        await generateImage(input({ imageSize: "2K" }))
        expect(request().config.imageConfig).toEqual({ aspectRatio: "16:9", imageSize: "2K" })
    })

    it("sends the prompt part followed by inline image parts for reference images", async () => {
        sdk.generateContent.mockResolvedValue(withParts([{ inlineData: { data: pngBase64() } }]))
        await generateImage(input({ inputImages: [{ mimeType: "image/png", data: "QQ==" }, { mimeType: "image/jpeg", data: "Qg==" }] }))
        expect(request().contents).toEqual([
            { text: "a cat" },
            { inlineData: { mimeType: "image/png", data: "QQ==" } },
            { inlineData: { mimeType: "image/jpeg", data: "Qg==" } }
        ])
    })

    it("treats an empty inputImages array as a bare prompt", async () => {
        sdk.generateContent.mockResolvedValue(withParts([{ inlineData: { data: pngBase64() } }]))
        await generateImage(input({ inputImages: [] }))
        expect(request().contents).toBe("a cat")
    })

    it("skips parts with empty inlineData and thought images, taking the next real one", async () => {
        sdk.generateContent.mockResolvedValue(withParts([
            { inlineData: { data: "" } },
            { thought: true, inlineData: { data: "AAAA", mimeType: "image/png" } },
            { text: "note" },
            { inlineData: { data: pngBase64(), mimeType: "image/png" } }
        ]))
        await generateImage(input())
        expect(readFileSync(out).subarray(0, 8)).toEqual(PNG_SIGNATURE)
    })

    it("reports a thought-only response as no image", async () => {
        sdk.generateContent.mockResolvedValue(withParts([{ thought: true, inlineData: { data: pngBase64() } }]))
        await expect(generateImage(input())).rejects.toThrow("No image returned by API")
        expect(existsSync(out)).toBe(false)
    })

    it("reports promptFeedback.blockReason, preferring it over the finishReason", async () => {
        sdk.generateContent.mockResolvedValue({ promptFeedback: { blockReason: "SAFETY" }, candidates: [{ finishReason: "STOP" }] })
        await expect(generateImage(input())).rejects.toThrow("No image returned (SAFETY)")
    })

    it("reports the finishReason together with the returned text", async () => {
        sdk.generateContent.mockResolvedValue(withParts([{ text: "I cannot" }, { text: "" }, { text: "draw that" }], "IMAGE_SAFETY"))
        await expect(generateImage(input())).rejects.toThrow("No image returned (IMAGE_SAFETY: I cannot draw that)")
    })

    it("leaves thought text out of the error detail", async () => {
        sdk.generateContent.mockResolvedValue(withParts([
            { thought: true, text: "internal reasoning" }, { text: "visible" }
        ], "IMAGE_SAFETY"))
        const error = await generateImage(input()).catch((err: unknown) => err) as Error
        expect(error.message).toBe("No image returned (IMAGE_SAFETY: visible)")
        expect(error.message).not.toContain("internal reasoning")
    })

    it("reports a bare error when only thought text came back", async () => {
        sdk.generateContent.mockResolvedValue(withParts([{ thought: true, text: "internal reasoning" }]))
        await expect(generateImage(input())).rejects.toThrow(/^No image returned by API$/)
    })

    it("reports a bare error when the API offered nothing", async () => {
        sdk.generateContent.mockResolvedValue({})
        await expect(generateImage(input())).rejects.toThrow("No image returned by API")
    })

    it("rejects unsupported image bytes instead of writing them", async () => {
        sdk.generateContent.mockResolvedValue(withParts([{ inlineData: { data: Buffer.from("GIF89a").toString("base64"), mimeType: "image/gif" } }]))
        await expect(generateImage(input())).rejects.toThrow(/Unsupported image format from API \(mimeType=image\/gif\)/)
        expect(existsSync(out)).toBe(false)
    })

    it("bounds the request with a 120 s AbortSignal.timeout", async () => {
        const timeout = vi.spyOn(AbortSignal, "timeout")
        sdk.generateContent.mockResolvedValue(withParts([{ inlineData: { data: pngBase64() } }]))
        await generateImage(input())
        expect(timeout).toHaveBeenCalledTimes(1)
        expect(timeout).toHaveBeenCalledWith(120_000)
    })

    it("maps a TimeoutError to the friendly timeout message", async () => {
        sdk.generateContent.mockRejectedValue(new DOMException("The operation timed out", "TimeoutError"))
        await expect(generateImage(input())).rejects.toThrow(/^Image generation timed out after 120s$/)
    })

    it("maps an AbortError after the signal aborted to the friendly timeout message", async () => {
        sdk.generateContent.mockImplementation((req: { config: { abortSignal: AbortSignal } }) => {
            const signal = req.config.abortSignal
            return new Promise((_resolve, reject) => {
                signal.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")))
            })
        })
        const controller = new AbortController()
        vi.spyOn(AbortSignal, "timeout").mockReturnValue(controller.signal)
        const run = expect(generateImage(input())).rejects.toThrow(/^Image generation timed out after 120s$/)
        controller.abort()
        await run
    })

    it("rethrows an AbortError whose signal did not abort, and any other error, unmapped", async () => {
        const stray = new DOMException("stray", "AbortError")
        sdk.generateContent.mockRejectedValueOnce(stray)
        await expect(generateImage(input())).rejects.toBe(stray)
        const plain = new Error("quota exceeded")
        sdk.generateContent.mockRejectedValueOnce(plain)
        await expect(generateImage(input())).rejects.toBe(plain)
    })
})
