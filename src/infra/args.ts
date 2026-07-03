/*
**  nano-banana -- Deterministic Image-Generation CLI for LLM Agents
**  Copyright (c) 2026 Matthias Brusdeylins
**  Licensed under MIT license <https://spdx.org/licenses/MIT>
**
**  infra/args: parse the command line via Node's built-in `util.parseArgs`.
**  Declaring every option up front yields both `--flag value` and `--flag=value`
**  forms, lets a value begin with `--`, and rejects unknown flags -- removing
**  the bespoke parsing edge cases a hand-rolled parser would carry.
*/

import { parseArgs as nodeParseArgs } from "node:util"

/**  the parsed option values, keyed by flag name without the dashes  */
export interface CliValues {
    /**  image generation prompt  */
    "prompt": string | undefined
    /**  output PNG path  */
    "output": string | undefined
    /**  reference/input image paths (repeatable)  */
    "input": string[] | undefined
    /**  explicit aspect ratio  */
    "aspect-ratio": string | undefined
    /**  output resolution  */
    "image-size": string | undefined
    /**  video mode switch (Veo)  */
    "video": boolean | undefined
    /**  video output resolution  */
    "resolution": string | undefined
    /**  video clip duration in seconds  */
    "duration": string | undefined
    /**  what the video must NOT contain  */
    "negative-prompt": string | undefined
    /**  Gemini model id  */
    "model": string | undefined
    /**  path to an API key file (override)  */
    "key-file": string | undefined
    /**  list models switch  */
    "list-models": boolean | undefined
    /**  print-version switch  */
    "version": boolean | undefined
    /**  print-help switch  */
    "help": boolean | undefined
}

/**
 *  Parse `argv` (without the node/script head) into typed option values.
 *  String options carry their value or `undefined`; boolean switches carry
 *  `true` when present. Unknown flags throw -- the caller turns that into an
 *  error envelope.
 *
 *  @param argv - raw argument vector, e.g. `process.argv.slice(2)`
 *  @returns the parsed option values
 */
export const parseCli = (argv: readonly string[]): CliValues =>
    nodeParseArgs({
        args: [...argv],
        strict: true,
        allowPositionals: false,
        options: {
            "prompt":        { type: "string" },
            "output":        { type: "string" },
            "input":         { type: "string", multiple: true },
            "aspect-ratio":  { type: "string" },
            "image-size":    { type: "string" },
            "video":         { type: "boolean" },
            "resolution":    { type: "string" },
            "duration":      { type: "string" },
            "negative-prompt": { type: "string" },
            "model":         { type: "string" },
            "key-file":      { type: "string" },
            "list-models":   { type: "boolean" },
            "version":       { type: "boolean" },
            "help":          { type: "boolean" }
        }
    }).values as CliValues
