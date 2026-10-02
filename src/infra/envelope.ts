/*
**  nano-banana -- Deterministic Image-Generation CLI for LLM Agents
**  Copyright (c) 2026 Matthias Brusdeylins
**  Licensed under MIT license <https://spdx.org/licenses/MIT>
**
**  infra/envelope: the single output contract. Every terminal outcome of the
**  CLI is exactly one JSON envelope on stdout -- a success via `emitOk` or an
**  error via `fail` -- so a calling agent parses the result deterministically
**  regardless of which path (validation, API error, success) produced it.
*/

/**  the success envelope mirrored onto stdout  */
export interface OkEnvelope {
    /**  fixed discriminator  */
    status: "ok"
    /**  written file path  */
    file: string
    /**  the aspect ratio actually requested  */
    aspect_ratio: string
    /**  the model used  */
    model: string
    /**  the requested output resolution; echoed only when passed explicitly  */
    image_size?: string
    /**  the requested video resolution; echoed only when passed explicitly  */
    resolution?: string
}

/**
 *  Write the success envelope as one JSON line to stdout.
 *
 *  @param env - the success facts to report
 */
export const emitOk = (env: OkEnvelope): void => {
    process.stdout.write(`${JSON.stringify(env)}\n`)
}

/**
 *  Write a single `{status:"error"}` JSON envelope to stdout and exit. This is
 *  the one error exit of the CLI, so validation faults and thrown failures
 *  alike surface as a parseable envelope rather than plain text.
 *
 *  @param message - the human-readable failure reason
 *  @param code - the process exit code: 2 = usage or credential error, 1 = runtime error (default)
 *  @returns never -- the process terminates
 */
export const fail = (message: string, code = 1): never => {
    process.stdout.write(`${JSON.stringify({ status: "error", message })}\n`)
    process.exit(code)
}

/**
 *  Extract a human-readable message from a thrown value.
 *
 *  @param err - the caught value
 *  @returns the error's message, or its string form when it is not an Error
 */
export const errorMessage = (err: unknown): string =>
    err instanceof Error ? err.message : String(err)
