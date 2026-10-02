/*
**  nano-banana -- Deterministic Image-Generation CLI for LLM Agents
**  Copyright (c) 2026 Matthias Brusdeylins
**  Licensed under MIT license <https://spdx.org/licenses/MIT>
**
**  infra/args: parse the command line via Node's built-in `util.parseArgs`.
**  Declaring every option up front yields both `--flag value` and `--flag=value`
**  forms and rejects unknown flags. With strict parsing a space-separated value
**  cannot begin with `-`; only the `--flag=value` form carries such a value.
*/

import { parseArgs as nodeParseArgs } from "node:util"

/**  the option declarations: one source for parsing and for the values type  */
const OPTIONS = {
    /**  generation prompt  */
    "prompt":          { type: "string" },
    /**  PNG or MP4 output path  */
    "output":          { type: "string" },
    /**  reference/input image paths (repeatable)  */
    "input":           { type: "string", multiple: true },
    /**  explicit aspect ratio  */
    "aspect-ratio":    { type: "string" },
    /**  image output resolution  */
    "image-size":      { type: "string" },
    /**  video mode switch (Omni)  */
    "video":           { type: "boolean" },
    /**  video output resolution  */
    "resolution":      { type: "string" },
    /**  what the video must NOT contain  */
    "negative-prompt": { type: "string" },
    /**  Gemini model id  */
    "model":           { type: "string" },
    /**  path to an API key file (override)  */
    "key-file":        { type: "string" },
    /**  list models switch  */
    "list-models":     { type: "boolean" },
    /**  print-version switch  */
    "version":         { type: "boolean" },
    /**  print-help switch  */
    "help":            { type: "boolean" }
} as const

/**  run `util.parseArgs` strictly over the declared options  */
const parse = (args: string[]) => nodeParseArgs({
    args,
    strict: true,
    allowPositionals: false,
    options: OPTIONS
})

/**  the parsed option values, keyed by flag name without the dashes  */
export type CliValues = ReturnType<typeof parse>["values"]

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
    parse([...argv]).values
