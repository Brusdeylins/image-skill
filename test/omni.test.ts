/*
**  nano-banana -- Deterministic Image-Generation CLI for LLM Agents
**  Copyright (c) 2026 Matthias Brusdeylins
**  Licensed under MIT license <https://spdx.org/licenses/MIT>
**
**  omni.test: cover the Gemini Omni video path (Interactions REST API) with a
**  stubbed global `fetch` and fake timers -- request shape, key handling,
**  polling, per-request signals and the shared deadline, manual redirect
**  handling, the host allowlist, the atomic streamed download and the failure
**  paths.
*/

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { existsSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { generateVideo, type VideoGenerateInput } from "../src/core/video.js"
import { PART_RE, partFiles, useTmpDirs } from "./helpers.js"

/**  a pass-through spy on the stream the download is written through  */
const fsSpy = vi.hoisted(() => ({ create: vi.fn() }))

vi.mock("node:fs", async (importOriginal) => {
    const real = await importOriginal<typeof import("node:fs")>()
    return {
        ...real,
        createWriteStream: (...args: Parameters<typeof real.createWriteStream>) => {
            fsSpy.create(...args)
            return real.createWriteStream(...args)
        }
    }
})

/**  the file URI the stubbed API names, with the `:download` suffix and a query  */
const FILE_URI = "https://generativelanguage.googleapis.com/v1beta/files/abc123:download?alt=media"

/**  the file resource URL the poll must hit  */
const FILE_URL = "https://generativelanguage.googleapis.com/v1beta/files/abc123"

/**  the secret used as API key  */
const KEY = "secret-key-123"

/**  a JSON response  */
const json = (body: unknown, status = 200): Response =>
    new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } })

/**  the interaction response naming one video part with `uri`  */
const interaction = (uri: string): Response =>
    json({ steps: [{ type: "model_output", content: [{ type: "video", uri }] }] })

/**  the stderr line written on every poll that finds the file not yet ACTIVE  */
const PROGRESS_NOTE = "video generation in progress...\n"

/**  a redirect response to `location`  */
const redirect = (location: string, status = 302): Response =>
    new Response(null, { status, headers: { location } })

/**  the recorded arguments of one stubbed fetch call  */
type FetchCall = [url: string, init: RequestInit]

/**  the API key a recorded request carried, if any  */
const keyOf = (init: RequestInit): string | null =>
    new Headers(init.headers).get("x-goog-api-key")

/**  the stubbed global fetch, recreated by each describe block's beforeEach  */
let fetchMock: ReturnType<typeof vi.fn>

/**  queue the given responses for consecutive fetch calls  */
const queue = (...responses: Response[]): void => {
    for (const r of responses)
        fetchMock.mockImplementationOnce(() => Promise.resolve(r))
}

/**  the recorded calls, with the URL as a string  */
const calls = (): FetchCall[] =>
    (fetchMock.mock.calls as [URL | string, RequestInit][]).map(([url, init]) => [String(url), init])

describe("generateOmniVideo", () => {
    const tmp = useTmpDirs()
    let stderr: ReturnType<typeof vi.spyOn>
    let out: string

    /*  the progress notes written to stderr so far  */
    const progressNotes = (): unknown[][] =>
        (stderr.mock.calls as unknown[][]).filter(([text]) => text === PROGRESS_NOTE)

    /*  queue the three responses of a successful run: interaction, ACTIVE file, `body` download  */
    const queueHappy = (body = "x", uri = FILE_URI): void =>
        queue(interaction(uri), json({ state: "ACTIVE" }), new Response(body))

    /*  the n-th recorded call  */
    const call = (n: number): FetchCall => {
        const c = calls()[n]
        if (c === undefined)
            throw new Error(`no fetch call #${n}`)
        return c
    }

    /*  the request inputs with the Omni defaults  */
    const input = (extra: Partial<VideoGenerateInput> = {}): VideoGenerateInput =>
        ({ apiKey: KEY, prompt: "a cat", outputPath: out, model: "gemini-omni-1.1-flash", aspectRatio: "16:9", ...extra })

    /*  the parsed JSON body of the POST request  */
    const postBody = (): { model: string, input: Record<string, unknown>[], response_format: Record<string, unknown> } =>
        JSON.parse(call(0)[1].body as string)

    beforeEach(() => {
        vi.useFakeTimers()
        fetchMock = vi.fn()
        vi.stubGlobal("fetch", fetchMock)
        stderr = vi.spyOn(process.stderr, "write").mockImplementation(() => true)
        fsSpy.create.mockReset()
        out = join(tmp(), "clip.mp4")
    })

    afterEach(() => {
        vi.useRealTimers()
        vi.unstubAllGlobals()
        vi.restoreAllMocks()
    })

    it("posts a uri-delivery request, polls, and streams the bytes to disk", async () => {
        const bytes = Buffer.from(Array.from({ length: 5000 }, (_, i) => i % 251))
        queue(interaction(FILE_URI), json({ state: "ACTIVE" }), new Response(bytes))
        const result = await generateVideo(input({ resolution: "1080p" }))
        expect(result).toEqual({ file: out, aspectRatio: "16:9", model: "gemini-omni-1.1-flash" })
        expect(readFileSync(out).equals(bytes)).toBe(true)
        expect(calls()).toHaveLength(3)
        expect(call(0)[0]).toBe("https://generativelanguage.googleapis.com/v1beta/interactions")
        expect(call(0)[1].method).toBe("POST")
        expect(postBody().response_format).toEqual({ type: "video", aspect_ratio: "16:9", delivery: "uri", resolution: "1080p" })
        expect(postBody().model).toBe("gemini-omni-1.1-flash")
    })

    it("omits the resolution from response_format when undefined", async () => {
        queueHappy()
        await generateVideo(input({ aspectRatio: "9:16" }))
        expect(postBody().response_format).toEqual({ type: "video", aspect_ratio: "9:16", delivery: "uri" })
        expect(Object.keys(postBody().response_format)).not.toContain("resolution")
    })

    it("sends the image part before the text part", async () => {
        queueHappy()
        await generateVideo(input({ inputImage: { mimeType: "image/png", data: "QUJD" } }))
        expect(postBody().input).toEqual([
            { type: "image", data: "QUJD", mime_type: "image/png" },
            { type: "text", text: "a cat" }
        ])
    })

    it("appends a negative prompt as \"Do not include: ...\"", async () => {
        queueHappy()
        await generateVideo(input({ negativePrompt: "blur" }))
        expect(postBody().input).toEqual([{ type: "text", text: "a cat\n\nDo not include: blur" }])
    })

    it("ignores an empty negative prompt", async () => {
        queueHappy()
        await generateVideo(input({ negativePrompt: "" }))
        expect(postBody().input).toEqual([{ type: "text", text: "a cat" }])
    })

    it("sends the key in x-goog-api-key on every request and never in a URL", async () => {
        queueHappy()
        await generateVideo(input())
        for (const [url, init] of calls()) {
            expect(keyOf(init)).toBe(KEY)
            expect(url).not.toContain(KEY)
        }
    })

    it("strips \":download\" and the query from the poll URL, and downloads the original URI", async () => {
        queueHappy()
        await generateVideo(input())
        expect(call(1)[0]).toBe(FILE_URL)
        expect(call(2)[0]).toBe(FILE_URI)
    })

    it("strips \":download\" from a URI without a query", async () => {
        queue(interaction(`${FILE_URL}:download`), json({ state: "ACTIVE" }), new Response("x"))
        await generateVideo(input())
        expect(call(1)[0]).toBe(FILE_URL)
    })

    it("polls PROCESSING until ACTIVE", async () => {
        queue(interaction(FILE_URI), json({ state: "PROCESSING" }), json({ state: "PROCESSING" }), json({ state: "ACTIVE" }), new Response("vid"))
        const done = generateVideo(input())
        await vi.advanceTimersByTimeAsync(9_999)
        expect(calls()).toHaveLength(2)
        await vi.advanceTimersByTimeAsync(1)
        expect(calls()).toHaveLength(3)
        await vi.advanceTimersByTimeAsync(10_000)
        await done
        expect(calls()).toHaveLength(5)
        expect(readFileSync(out, "utf8")).toBe("vid")
        /*  one progress note per PROCESSING poll  */
        expect(progressNotes()).toHaveLength(2)
    })

    it("fails when the file state is FAILED", async () => {
        queue(interaction(FILE_URI), json({ state: "FAILED" }))
        await expect(generateVideo(input())).rejects.toThrow("Video generation failed: file processing failed")
    })

    it("times out at 600 s when the file never turns ACTIVE", async () => {
        fetchMock.mockImplementation((url: URL) =>
            Promise.resolve(String(url).endsWith("/interactions") ? interaction(FILE_URI) : json({ state: "PROCESSING" })))
        const done = expect(generateVideo(input())).rejects.toThrow(/timed out after 600s \(file .*abc123 not ACTIVE\)/)
        await vi.advanceTimersByTimeAsync(600_000)
        await done
        /*  one POST plus a poll at every 10 s from 0 to 600 s inclusive; no progress note on the last  */
        expect(calls()).toHaveLength(1 + 61)
        expect(progressNotes()).toHaveLength(60)
    })

    it("reports the API error message of a non-ok POST", async () => {
        queue(json({ error: { message: "quota exceeded" } }, 429))
        await expect(generateVideo(input())).rejects.toThrow("Video generation failed: quota exceeded")
    })

    it("reports \"HTTP <status>\" for a non-JSON error body", async () => {
        queue(new Response("<html>bad gateway</html>", { status: 502 }))
        await expect(generateVideo(input())).rejects.toThrow("Video generation failed: HTTP 502")
    })

    it("reports a non-ok poll", async () => {
        queue(interaction(FILE_URI), json({ error: { message: "file gone" } }, 404))
        await expect(generateVideo(input())).rejects.toThrow("Video generation failed: file gone")
    })

    it.each([
        ["a foreign host", "https://evil.example.com/v1beta/files/abc:download", "evil.example.com"],
        ["a lookalike suffix", "https://generativelanguage.googleapis.com.evil.com/v1beta/files/abc:download", "generativelanguage.googleapis.com.evil.com"],
        ["userinfo naming the API host", "https://generativelanguage.googleapis.com@evil.com/v1beta/files/abc:download", "evil.com"],
        ["a non-default port", "https://generativelanguage.googleapis.com:8443/v1beta/files/abc:download", "generativelanguage.googleapis.com"],
        ["plain http", "http://generativelanguage.googleapis.com/v1beta/files/abc:download", "generativelanguage.googleapis.com"]
    ])("refuses a URI with %s and never contacts it", async (_name, uri, host) => {
        queue(interaction(uri))
        await expect(generateVideo(input())).rejects.toThrow(`Refusing to send the API key to unexpected host "${host}"`)
        expect(calls()).toHaveLength(1)
    })

    it("accepts an uppercase API host, which the URL parser lowercases", async () => {
        queueHappy("x", "https://GENERATIVELANGUAGE.GOOGLEAPIS.COM/v1beta/files/abc123:download")
        await generateVideo(input())
        expect(calls()).toHaveLength(3)
        expect(call(1)[0]).toBe(FILE_URL)
    })

    it("rejects a malformed file URI as invalid", async () => {
        queue(interaction("not a uri"))
        await expect(generateVideo(input())).rejects.toThrow("Video generation failed: invalid file URI")
        expect(calls()).toHaveLength(1)
    })

    it.each([
        ["no :download suffix", FILE_URL],
        ["a query but no :download suffix", `${FILE_URL}?alt=media`]
    ])("rejects a file URI with %s as unexpected", async (_name, uri) => {
        queue(interaction(uri))
        await expect(generateVideo(input())).rejects.toThrow("Video generation failed: unexpected file URI")
        expect(calls()).toHaveLength(1)
    })

    it("reports a non-ok download", async () => {
        queue(interaction(FILE_URI), json({ state: "ACTIVE" }), json({ error: { message: "expired" } }, 410))
        await expect(generateVideo(input())).rejects.toThrow("Video download failed: expired")
    })

    it("reports a download without a body", async () => {
        queue(interaction(FILE_URI), json({ state: "ACTIVE" }), new Response(null, { status: 200 }))
        await expect(generateVideo(input())).rejects.toThrow("Video download failed: empty body")
    })

    it("fails when the response has no video part", async () => {
        queue(json({ steps: [{ type: "model_output", content: [{ type: "text" }] }, { type: "thought" }] }))
        await expect(generateVideo(input())).rejects.toThrow("No video returned by API")
    })

    it("ignores a video part inside a step that is not model_output", async () => {
        queue(json({ steps: [{ type: "thought", content: [{ type: "video", uri: FILE_URI }] }] }))
        await expect(generateVideo(input())).rejects.toThrow("No video returned by API")
        expect(calls()).toHaveLength(1)
    })

    it("fails when the response has no steps at all", async () => {
        queue(json({}))
        await expect(generateVideo(input())).rejects.toThrow("No video returned by API")
    })

    it("fails without a request for the file when the video part has no uri", async () => {
        queue(json({ steps: [{ type: "model_output", content: [{ type: "video" }] }] }))
        await expect(generateVideo(input())).rejects.toThrow("No video returned by API")
        expect(calls()).toHaveLength(1)
    })

    it("polls and downloads the first of two video parts", async () => {
        const second = "https://generativelanguage.googleapis.com/v1beta/files/second:download?alt=media"
        queue(json({ steps: [{ type: "model_output", content: [{ type: "video", uri: FILE_URI }, { type: "video", uri: second }] }] }),
            json({ state: "ACTIVE" }), new Response("x"))
        await generateVideo(input())
        expect(call(1)[0]).toBe(FILE_URL)
        expect(call(2)[0]).toBe(FILE_URI)
        expect(calls()).toHaveLength(3)
    })

    it.each([
        ["an absent state", {}],
        ["an unknown state", { state: "STATE_UNSPECIFIED" }]
    ])("keeps polling on %s until the file is ACTIVE", async (_name, unknown) => {
        queue(interaction(FILE_URI), json(unknown), json({ state: "ACTIVE" }), new Response("vid"))
        const done = generateVideo(input())
        await vi.advanceTimersByTimeAsync(10_000)
        await done
        expect(calls()).toHaveLength(4)
        expect(progressNotes()).toHaveLength(1)
        expect(readFileSync(out, "utf8")).toBe("vid")
    })

    it.each([
        ["the POST", 0],
        ["the poll", 1]
    ])("rejects a 200 text/html answer to %s as an invalid API response", async (_name, inFlight) => {
        const html = new Response("<html>captive portal</html>", { status: 200, headers: { "Content-Type": "text/html" } })
        if (inFlight === 0)
            queue(html)
        else
            queue(interaction(FILE_URI), html)
        await expect(generateVideo(input())).rejects.toThrow("Video generation failed: invalid API response")
        expect(calls()).toHaveLength(inFlight + 1)
    })

    it("refuses a file URI carrying userinfo even when the host is the API host", async () => {
        queue(interaction("https://user:pw@generativelanguage.googleapis.com/v1beta/files/abc123:download?alt=media"))
        await expect(generateVideo(input())).rejects.toThrow("Video generation failed: unexpected file URI")
        expect(calls()).toHaveLength(1)
    })

    it("does not follow a redirect of the POST and reports its status", async () => {
        queue(redirect("https://generativelanguage.googleapis.com/v1beta/interactions2", 307))
        await expect(generateVideo(input())).rejects.toThrow("Video generation failed: HTTP 307")
        expect(calls()).toHaveLength(1)
    })

    it("reports a 3xx without a location on the download as its HTTP status", async () => {
        queue(interaction(FILE_URI), json({ state: "ACTIVE" }), new Response(null, { status: 302 }))
        await expect(generateVideo(input())).rejects.toThrow("Video download failed: HTTP 302")
        expect(calls()).toHaveLength(3)
    })

    it("follows exactly 5 redirects and accepts the 200 behind them", async () => {
        queue(interaction(FILE_URI), json({ state: "ACTIVE" }))
        for (let hop = 0; hop < 5; hop++)
            queue(redirect(`/v1beta/files/hop${hop}:download`))
        queue(new Response("MP4"))
        await generateVideo(input())
        expect(calls()).toHaveLength(2 + 6)
        expect(call(7)[0]).toBe("https://generativelanguage.googleapis.com/v1beta/files/hop4:download")
        expect(readFileSync(out, "utf8")).toBe("MP4")
    })

    it("removes the partial file when the download stream fails", async () => {
        const broken = new ReadableStream<Uint8Array>({
            start (controller) {
                controller.enqueue(new Uint8Array([1, 2, 3]))
            },
            pull () {
                throw new Error("connection reset")
            }
        })
        queue(interaction(FILE_URI), json({ state: "ACTIVE" }), new Response(broken))
        await expect(generateVideo(input())).rejects.toThrow("connection reset")
        expect(existsSync(out)).toBe(false)
        expect(partFiles(out)).toEqual([])
    })

    it("renames the .part file to the output on success", async () => {
        queueHappy("MP4")
        await generateVideo(input())
        expect(readFileSync(out, "utf8")).toBe("MP4")
        expect(partFiles(out)).toEqual([])
    })

    it("streams to a random-suffixed .part file opened exclusively with flags \"wx\"", async () => {
        queueHappy("A")
        await generateVideo(input())
        queueHappy("B")
        await generateVideo(input())
        const [first, second] = (fsSpy.create.mock.calls as [string, { flags?: string }][])
        expect(fsSpy.create).toHaveBeenCalledTimes(2)
        expect(first?.[0]).toMatch(PART_RE)
        expect(first?.[0].startsWith(`${out}.`)).toBe(true)
        expect(first?.[1]).toEqual({ flags: "wx" })
        expect(second?.[1]).toEqual({ flags: "wx" })
        expect(second?.[0]).not.toBe(first?.[0])
    })

    it("leaves a pre-existing output untouched and removes only the .part file when the stream fails", async () => {
        writeFileSync(out, "OLD")
        const broken = new ReadableStream<Uint8Array>({
            start (controller) {
                controller.enqueue(new Uint8Array([1, 2, 3]))
            },
            pull () {
                throw new Error("connection reset")
            }
        })
        queue(interaction(FILE_URI), json({ state: "ACTIVE" }), new Response(broken))
        await expect(generateVideo(input())).rejects.toThrow("connection reset")
        expect(readFileSync(out, "utf8")).toBe("OLD")
        expect(partFiles(out)).toEqual([])
    })

    it("leaves a pre-existing output untouched when the download is not ok", async () => {
        writeFileSync(out, "OLD")
        queue(interaction(FILE_URI), json({ state: "ACTIVE" }), json({ error: { message: "expired" } }, 410))
        await expect(generateVideo(input())).rejects.toThrow("Video download failed: expired")
        expect(readFileSync(out, "utf8")).toBe("OLD")
    })
})

describe("generateOmniVideo requests", () => {
    const tmp = useTmpDirs()
    let timeoutSpy: ReturnType<typeof vi.spyOn>
    let out: string

    /*  the request inputs with the Omni defaults  */
    const input = (): VideoGenerateInput =>
        ({ apiKey: KEY, prompt: "a cat", outputPath: out, model: "gemini-omni-1.1-flash", aspectRatio: "16:9" })

    /*  a fetch that never answers but rejects with the signal's reason once it aborts  */
    const hang = (_url: URL, init: RequestInit): Promise<Response> =>
        new Promise((_resolve, reject) => {
            init.signal?.addEventListener("abort", () => reject(init.signal?.reason))
        })

    beforeEach(() => {
        vi.useFakeTimers()
        fetchMock = vi.fn()
        vi.stubGlobal("fetch", fetchMock)
        vi.spyOn(process.stderr, "write").mockImplementation(() => true)
        timeoutSpy = vi.spyOn(AbortSignal, "timeout")
        out = join(tmp(), "clip.mp4")
    })

    afterEach(() => {
        vi.useRealTimers()
        vi.unstubAllGlobals()
        vi.restoreAllMocks()
    })

    it("gives every request its own AbortSignal sharing one 600 s deadline", async () => {
        queue(interaction(FILE_URI), json({ state: "PROCESSING" }), json({ state: "ACTIVE" }), new Response("x"))
        const done = generateVideo(input())
        await vi.advanceTimersByTimeAsync(10_000)
        await done
        expect(calls()).toHaveLength(4)
        const signals = calls().map(([, init]) => init.signal)
        for (const signal of signals)
            expect(signal).toBeInstanceOf(AbortSignal)
        expect(new Set(signals).size).toBe(4)
        /*  the budget shrinks by the 10 s slept: POST and first poll at 600 s, then 590 s  */
        expect((timeoutSpy.mock.calls as number[][]).map(([ms]) => ms)).toEqual([600_000, 600_000, 590_000, 590_000])
    })

    it("follows redirects manually", async () => {
        queue(interaction(FILE_URI), json({ state: "ACTIVE" }), new Response("x"))
        await generateVideo(input())
        for (const [, init] of calls())
            expect(init.redirect).toBe("manual")
    })

    it.each([
        ["the POST", 0],
        ["the poll", 1]
    ])("maps a deadline abort while %s is in flight to the friendly timeout message", async (_name, inFlight) => {
        const controllers: AbortController[] = []
        timeoutSpy.mockImplementation(() => {
            const controller = new AbortController()
            controllers.push(controller)
            return controller.signal
        })
        if (inFlight === 0)
            fetchMock.mockImplementation(hang)
        else
            fetchMock.mockImplementationOnce(() => Promise.resolve(interaction(FILE_URI))).mockImplementation(hang)
        const done = expect(generateVideo(input())).rejects.toThrow(/^Video generation timed out after 600s$/)
        await vi.advanceTimersByTimeAsync(0)
        expect(controllers).toHaveLength(inFlight + 1)
        controllers[inFlight]?.abort(new DOMException("The operation was aborted due to timeout", "TimeoutError"))
        await done
    })

    it("maps an AbortError at or after the deadline to the friendly timeout message", async () => {
        fetchMock.mockImplementation(() => {
            vi.setSystemTime(Date.now() + 600_000)
            return Promise.reject(new DOMException("aborted", "AbortError"))
        })
        await expect(generateVideo(input())).rejects.toThrow(/^Video generation timed out after 600s$/)
    })

    it("rethrows an AbortError before the deadline unmapped", async () => {
        const stray = new DOMException("aborted by something else", "AbortError")
        fetchMock.mockImplementation(() => Promise.reject(stray))
        await expect(generateVideo(input())).rejects.toBe(stray)
    })

    it("rethrows a plain error after the deadline unmapped", async () => {
        const plain = new Error("socket hang up")
        fetchMock.mockImplementation(() => {
            vi.setSystemTime(Date.now() + 600_000)
            return Promise.reject(plain)
        })
        await expect(generateVideo(input())).rejects.toBe(plain)
    })

    it("clamps the poll sleep so the deadline is not overshot", async () => {
        /*  the POST itself takes 5 s, so the polls fall at 5 s, 15 s, ..., 595 s and the last sleep is 5 s  */
        fetchMock.mockImplementationOnce(() => {
            vi.setSystemTime(Date.now() + 5_000)
            return Promise.resolve(interaction(FILE_URI))
        }).mockImplementation(() => Promise.resolve(json({ state: "PROCESSING" })))
        let outcome: unknown
        generateVideo(input()).catch((err: unknown) => {
            outcome = err
        })
        await vi.advanceTimersByTimeAsync(595_000)
        expect(outcome).toBeInstanceOf(Error)
        expect((outcome as Error).message).toMatch(/^Video generation timed out after 600s \(file .*abc123 not ACTIVE\)$/)
    })

    it("sends the key to the API origin only and drops it on a redirect to another origin", async () => {
        queue(interaction(FILE_URI), json({ state: "ACTIVE" }), redirect("https://storage.googleapis.com/blob/abc?x=1"), new Response("MP4"))
        await generateVideo(input())
        expect(calls()).toHaveLength(4)
        expect(keyOf(calls()[2]?.[1] ?? {})).toBe(KEY)
        expect(calls()[3]?.[0]).toBe("https://storage.googleapis.com/blob/abc?x=1")
        expect(keyOf(calls()[3]?.[1] ?? {})).toBeNull()
        expect(readFileSync(out, "utf8")).toBe("MP4")
    })

    it("keeps the key on a redirect to another URL on the API origin", async () => {
        queue(interaction(FILE_URI), json({ state: "ACTIVE" }), redirect("/v1beta/files/moved:download"), new Response("MP4"))
        await generateVideo(input())
        expect(calls()[3]?.[0]).toBe("https://generativelanguage.googleapis.com/v1beta/files/moved:download")
        expect(keyOf(calls()[3]?.[1] ?? {})).toBe(KEY)
    })

    it("follows at most 5 redirects", async () => {
        queue(interaction(FILE_URI), json({ state: "ACTIVE" }))
        fetchMock.mockImplementation(() => Promise.resolve(redirect("/v1beta/files/loop:download")))
        await expect(generateVideo(input())).rejects.toThrow("Video generation failed: too many redirects")
        /*  POST, poll, then the download request plus its 5 followed redirects  */
        expect(calls()).toHaveLength(2 + 6)
    })

    it("clamps the signal of the poll to 1 ms when the POST already used up the budget", async () => {
        fetchMock.mockImplementationOnce(() => {
            vi.setSystemTime(Date.now() + 600_000)
            return Promise.resolve(interaction(FILE_URI))
        }).mockImplementationOnce(() => Promise.resolve(json({ state: "ACTIVE" })))
            .mockImplementationOnce(() => Promise.resolve(new Response("x")))
        await generateVideo(input())
        expect((timeoutSpy.mock.calls as number[][]).map(([ms]) => ms)).toEqual([600_000, 1, 1])
    })

    it("clamps the signal of the download to 1 ms when the final poll used up the budget", async () => {
        queue(interaction(FILE_URI))
        fetchMock.mockImplementationOnce(() => {
            vi.setSystemTime(Date.now() + 600_000)
            return Promise.resolve(json({ state: "ACTIVE" }))
        }).mockImplementationOnce(() => Promise.resolve(new Response("x")))
        await generateVideo(input())
        expect((timeoutSpy.mock.calls as number[][]).map(([ms]) => ms)).toEqual([600_000, 600_000, 1])
    })

    it.each([
        ["a TimeoutError", "TimeoutError", /^Video generation timed out after 600s$/],
        ["an AbortError before the deadline", "AbortError", /^aborted early$/]
    ])("passes %s during the poll body read through instead of reporting an invalid API response", async (_name, errorName, message) => {
        const failing = Object.assign(json({ state: "ACTIVE" }), {
            json: () => Promise.reject(new DOMException("aborted early", errorName))
        })
        queue(interaction(FILE_URI), failing)
        const outcome = generateVideo(input())
        await expect(outcome).rejects.toThrow(message)
        await expect(outcome).rejects.not.toThrow("invalid API response")
    })

    it.each([
        ["a TimeoutError", "TimeoutError", /^Video generation timed out after 600s$/],
        ["an AbortError before the deadline", "AbortError", /^aborted early$/]
    ])("passes %s during the POST body read through instead of reporting an invalid API response", async (_name, errorName, message) => {
        const failing = Object.assign(interaction(FILE_URI), {
            json: () => Promise.reject(new DOMException("aborted early", errorName))
        })
        queue(failing)
        const outcome = generateVideo(input())
        await expect(outcome).rejects.toThrow(message)
        await expect(outcome).rejects.not.toThrow("invalid API response")
    })

    it("attaches the parse failure as the cause of an invalid API response", async () => {
        queue(new Response("<html>captive portal</html>"))
        const error = await generateVideo(input()).catch((err: unknown) => err) as Error
        expect(error.message).toBe("Video generation failed: invalid API response")
        expect(error.cause).toBeInstanceOf(SyntaxError)
    })

    it.each([
        ["an empty object", "{}"],
        ["an error object without a message", "{\"error\":{}}"],
        ["a string error", "{\"error\":\"x\"}"],
        ["a numeric message", "{\"error\":{\"message\":42}}"],
        ["a JSON null", "null"]
    ])("falls back to \"HTTP 500\" for %s as the error body", async (_name, body) => {
        queue(new Response(body, { status: 500 }))
        await expect(generateVideo(input())).rejects.toThrow(/^Video generation failed: HTTP 500$/)
    })

    it("refuses a redirect to a non-HTTPS URL", async () => {
        queue(interaction(FILE_URI), json({ state: "ACTIVE" }), redirect("http://storage.googleapis.com/blob"))
        await expect(generateVideo(input())).rejects.toThrow("redirect to a non-HTTPS URL")
        expect(calls()).toHaveLength(3)
    })
})
