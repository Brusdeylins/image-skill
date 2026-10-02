/*
**  nano-banana -- Deterministic Image-Generation CLI for LLM Agents
**  Copyright (c) 2026 Matthias Brusdeylins
**  Licensed under MIT license <https://spdx.org/licenses/MIT>
**
**  cli.test: drive the built CLI bundle as a subprocess and assert the exit
**  code (exactly 2 for a usage error) and the JSON envelope of every
**  validation path, plus --list-models, --version and --help.
*/

import { describe, it, expect } from "vitest"
import { execFileSync, spawnSync } from "node:child_process"
import { fileURLToPath } from "node:url"
import { join } from "node:path"
import { existsSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { MODELS, DEFAULT_MODEL } from "../src/core/models.js"
import { VIDEO_MODELS, DEFAULT_VIDEO_MODEL } from "../src/core/video.js"
import { MAX_INPUT_IMAGES } from "../src/infra/imagefile.js"
import { pngBytes, useTmpDirs } from "./helpers.js"

/**  absolute path to the built CLI bundle (cwd-independent)  */
const CLI_BUNDLE = fileURLToPath(new URL("../dst/nano-banana.mjs", import.meta.url))

/**  the exit code of a usage error  */
const USAGE = 2

/**  output paths in an existing directory that no test run may ever create  */
const NEVER_PNG = join(tmpdir(), "nb-never.png")
const NEVER_MP4 = join(tmpdir(), "nb-never.mp4")

/**  the JSON error envelope  */
interface ErrorEnvelope {
    status: string
    message: string
}

/*  the arguments of a minimal image run writing to a path that must never be created  */
const imageArgs = (...extra: string[]): string[] =>
    ["--prompt", "x", "--output", NEVER_PNG, ...extra]

/*  the arguments of a minimal video run writing to a path that must never be created  */
const videoArgs = (...extra: string[]): string[] =>
    ["--video", "--prompt", "x", "--output", NEVER_MP4, ...extra]

/*  run the built bundle with no API key in the environment; a null status maps to -1  */
const runCli = (args: readonly string[]): { out: string, code: number } => {
    const env = { ...process.env, GEMINI_API_KEY: "", GOOGLE_API_KEY: "" }
    try {
        return { out: execFileSync(process.execPath, [CLI_BUNDLE, ...args], { encoding: "utf8", env, stdio: ["ignore", "pipe", "pipe"] }), code: 0 }
    }
    catch (err) {
        const e = err as { stdout?: string, status?: number | null }
        return { out: e.stdout ?? "", code: e.status ?? -1 }
    }
}

/*  assert a usage error: exit code exactly 2 and an error envelope containing `fragment`  */
const expectUsageError = (args: readonly string[], fragment: string): void => {
    const { out, code } = runCli(args)
    const env = JSON.parse(out.trim()) as ErrorEnvelope
    expect(env.status).toBe("error")
    expect(env.message).toContain(fragment)
    expect(code).toBe(USAGE)
}

describe("cli usage errors (exit code 2)", () => {
    const tmp = useTmpDirs()

    it("rejects a nonexistent output directory before any other work, without network", () => {
        const dir = join(tmp(), "missing")
        const target = join(dir, "o.png")
        /*  the key is absent and the ratio invalid, yet the directory check comes first  */
        expectUsageError(["--prompt", "x", "--output", target, "--aspect-ratio", "bogus"],
            `output directory does not exist: ${dir}`)
        expect(existsSync(dir)).toBe(false)
    })

    it("rejects an output directory that is a regular file", () => {
        const file = join(tmp(), "afile")
        writeFileSync(file, "x")
        expectUsageError(["--prompt", "x", "--output", join(file, "o.png")], `output directory does not exist: ${file}`)
    })

    it("emits a JSON error envelope on missing args", () => {
        expectUsageError([], "--prompt and --output are required")
    })

    it("rejects an empty --output", () => {
        expectUsageError(["--prompt", "x", "--output", ""], "--output must not be empty")
    })

    it("rejects an API key with a line break without leaking it", () => {
        const env = { ...process.env, GEMINI_API_KEY: "SECRETKEY\nx", GOOGLE_API_KEY: "" }
        const res = spawnSync(process.execPath, [CLI_BUNDLE, ...imageArgs()], { encoding: "utf8", env })
        const out = res.stdout
        const code = res.status
        expect(code).toBe(USAGE)
        expect(out).not.toContain("SECRETKEY")
        expect(res.stderr).not.toContain("SECRETKEY")
        expect((JSON.parse(out.trim()) as ErrorEnvelope).status).toBe("error")
    })

    it("requires --output as well as --prompt", () => {
        expectUsageError(["--prompt", "x"], "--prompt and --output are required")
    })

    it("rejects an extreme ratio on a model that does not support it", () => {
        expectUsageError(imageArgs("--model", "gemini-3-pro-image", "--aspect-ratio", "1:4"),
            "not supported by gemini-3-pro-image")
    })

    it("rejects a resolution the model does not support (Pro + 512)", () => {
        expectUsageError(imageArgs("--model", "gemini-3-pro-image", "--image-size", "512"),
            "--image-size \"512\" not supported by gemini-3-pro-image")
    })

    it("rejects 2K and 4K on Nano Banana 2 Lite", () => {
        for (const size of ["2K", "4K"])
            expectUsageError(imageArgs("--model", "gemini-3.1-flash-lite-image", "--image-size", size),
                `--image-size "${size}" not supported by gemini-3.1-flash-lite-image`)
    })

    it("rejects more than the maximum number of --input images", () => {
        const args = imageArgs()
        for (let i = 0; i < MAX_INPUT_IMAGES + 1; i++)
            args.push("--input", "/nonexistent-dir/nb-ref.png")
        expectUsageError(args, `too many --input images: ${MAX_INPUT_IMAGES + 1} (max ${MAX_INPUT_IMAGES})`)
    })

    it("rejects the video-only options in image mode", () => {
        expectUsageError(imageArgs("--resolution", "1080p"), "--resolution requires --video")
        expectUsageError(imageArgs("--negative-prompt", "blur"), "--negative-prompt requires --video")
    })

    it("rejects --image-size in video mode", () => {
        expectUsageError(videoArgs("--image-size", "2K"), "use --resolution with --video")
    })

    it("rejects --duration as an unknown option, in image and video mode alike", () => {
        expectUsageError(imageArgs("--duration", "6"), "Unknown option '--duration'")
        expectUsageError(videoArgs("--duration", "6"), "Unknown option '--duration'")
    })

    it("rejects more than one --input image in video mode", () => {
        expectUsageError(videoArgs("--input", "/nonexistent-dir/nb-ref.png", "--input", "/nonexistent-dir/nb-ref.png"),
            "too many --input images: 2 (max 1 with --video)")
    })

    it("rejects --video with an image model id", () => {
        expectUsageError(videoArgs("--model", "gemini-3-pro-image"),
            "--model \"gemini-3-pro-image\" is an image model")
    })

    it("rejects image mode with an unknown gemini-omni-* id", () => {
        expectUsageError(imageArgs("--model", "gemini-omni-9-pro"),
            "--model \"gemini-omni-9-pro\" is a video model")
    })

    it("rejects image mode with the Omni video model id", () => {
        expectUsageError(imageArgs("--model", "gemini-omni-1.1-flash"),
            "is a video model")
    })

    it("treats a former -preview alias as an unknown id: full ratio and size sets", () => {
        /*  1:4 and 512 are rejected on the Pro id but pass for its former alias (the key error comes after validation)  */
        expectUsageError(imageArgs("--model", "gemini-3-pro-image", "--aspect-ratio", "1:4"), "not supported by gemini-3-pro-image")
        expectUsageError(imageArgs("--model", "gemini-3-pro-image-preview", "--aspect-ratio", "1:4", "--image-size", "512"), "No API key found")
    })

    it("lets --video pass validation for an unknown model id with the permissive orientations and resolutions", () => {
        for (const id of ["gemini-3-pro-image-preview", "veo-3.1-generate-preview"])
            expectUsageError(videoArgs("--model", id, "--aspect-ratio", "9:16", "--resolution", "4k"), "No API key found")
        expectUsageError(videoArgs("--model", "veo-3.1-generate-preview", "--aspect-ratio", "1:1"),
            "--aspect-ratio \"1:1\" not supported by veo-3.1-generate-preview (allowed: 16:9, 9:16)")
    })

    it("rejects --video with an aspect ratio other than 16:9 or 9:16", () => {
        expectUsageError(videoArgs("--aspect-ratio", "1:1"),
            "--aspect-ratio \"1:1\" not supported by gemini-omni-1.1-flash")
    })

    it("rejects a nonexistent --input file", () => {
        const missing = join(tmp(), "missing.png")
        expectUsageError(imageArgs("--input", missing), `cannot read input image: ${missing}`)
    })

    it("rejects a non-image --input file", () => {
        const path = join(tmp(), "notes.png")
        writeFileSync(path, "just text")
        expectUsageError(imageArgs("--input", path), "unsupported input image format")
    })

    it("rejects a directory as --input", () => {
        expectUsageError(imageArgs("--input", tmp()), "not a regular file")
    })
})

describe("cli accepted boundaries", () => {
    const tmp = useTmpDirs()

    /*  with a missing key file, validation passing shows as the key error (usage error, exit 2)  */
    const expectPastValidation = (args: readonly string[]): void => {
        expectUsageError([...args, "--key-file", join(tmp(), "missing-key.txt")], "cannot read API key file")
    }

    /*  a valid PNG input file  */
    const pngFile = (): string => {
        const path = join(tmp(), "ref.png")
        writeFileSync(path, pngBytes())
        return path
    }

    it("accepts exactly the maximum number of image --input files", () => {
        const path = pngFile()
        const args = imageArgs()
        for (let i = 0; i < MAX_INPUT_IMAGES; i++)
            args.push("--input", path)
        expectPastValidation(args)
    })

    it("accepts exactly one --input image with --video", () => {
        expectPastValidation(videoArgs("--input", pngFile()))
    })

    it("accepts every Omni resolution on the default video model", () => {
        for (const resolution of ["360p", "720p", "1080p", "4k"])
            expectPastValidation(videoArgs("--resolution", resolution))
    })

    it("reports a missing --key-file as a usage error", () => {
        expectPastValidation(imageArgs())
    })

    it("reports an empty --key-file", () => {
        const path = join(tmp(), "empty-key.txt")
        writeFileSync(path, "\n")
        expectUsageError(imageArgs("--key-file", path), "API key file is empty")
    })

    it("reports a missing API key when neither environment nor key file provide one", () => {
        expectUsageError(imageArgs(), "No API key found")
    })

    it("reports an unknown flag as a usage error", () => {
        expectUsageError(["--nope"], "Unknown option '--nope'")
    })

    it("reports a missing option value as a usage error", () => {
        expectUsageError(["--prompt"], "--prompt")
    })
})

describe("cli informational output", () => {
    it("prints the version and exits 0", () => {
        const { out, code } = runCli(["--version"])
        /*  the bundle embeds the version of package.json at build time  */
        const pkg = JSON.parse(readFileSync(fileURLToPath(new URL("../package.json", import.meta.url)), "utf8")) as { name: string, version: string }
        expect(out.trim()).toBe(`${pkg.name} ${pkg.version}`)
        expect(code).toBe(0)
    })

    it("prints the help and exits 0, without embedding model tables", () => {
        const { out, code } = runCli(["--help"])
        expect(code).toBe(0)
        expect(out).toContain("Usage:")
        expect(out).toContain("--list-models")
        expect(out).toContain(`image ${DEFAULT_MODEL}`)
        expect(out).toContain(`video ${DEFAULT_VIDEO_MODEL}`)
        expect(out).toContain("Exit codes:")
        for (const m of [...MODELS, ...VIDEO_MODELS].filter((x) => x.id !== DEFAULT_MODEL && x.id !== DEFAULT_VIDEO_MODEL))
            expect(out).not.toContain(m.id)
    })

    it("lists one block per catalog entry with the default marked once per section", () => {
        const { out, code } = runCli(["--list-models"])
        expect(code).toBe(0)
        const [images, videos] = out.split("Video models (Omni tiers, use with --video):") as [string, string]
        expect(videos).toBeDefined()
        for (const [text, catalog] of [[images, MODELS], [videos, VIDEO_MODELS]] as const) {
            for (const m of catalog)
                expect(text.split("\n").filter((l) => l.startsWith(`${m.id}  (${m.name})`))).toHaveLength(1)
            expect(text.match(/\(default\)/g)).toHaveLength(1)
            expect(text.match(/^[a-z0-9.-]+ {2}\(/gm)).toHaveLength(catalog.length)
        }
        expect(out).toContain(`${DEFAULT_MODEL}  (Nano Banana Pro)  (default)`)
        expect(out).toContain(`${DEFAULT_VIDEO_MODEL}  (Gemini Omni Flash)  (default)`)
    })

    it("lists exactly the catalog: 3 image and 1 video model, no Veo, 2.5-flash, duration or shutdown lines", () => {
        const { out } = runCli(["--list-models"])
        expect(MODELS).toHaveLength(3)
        expect(VIDEO_MODELS).toHaveLength(1)
        expect(out.match(/^[a-z0-9.-]+ {2}\(/gm)).toHaveLength(4)
        expect(out).not.toMatch(/veo|2\.5-flash|shutdown|duration|sunset/i)
    })
})
