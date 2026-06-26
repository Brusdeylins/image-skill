/*
**  nano-banana -- Deterministic Image-Generation CLI for LLM Agents
**  Copyright (c) 2026 Matthias Brusdeylins
**  Licensed under MIT license <https://spdx.org/licenses/MIT>
**
**  infra/args: a tiny `--flag value` / `--flag` parser. No dependency, no
**  abbreviation magic -- every option is spelled in full, which keeps the
**  permission matching of the calling agent stable.
*/

/**  the parsed command line: string options plus boolean switches  */
export interface ParsedArgs {
    /**  `--flag value` options, by flag name without the dashes  */
    options: Record<string, string>
    /**  `--flag` switches that were present  */
    flags: Set<string>
}

/**
 *  Parse `argv` (without node/script head) into options and flags. A token of
 *  the form `--name` consumes the next token as its value, unless that next
 *  token is itself a `--name` or absent, in which case `--name` is a flag.
 *
 *  @param argv - raw argument vector, e.g. `process.argv.slice(2)`
 *  @param switches - flag names that NEVER take a value (pure switches)
 *  @returns the parsed options and flags
 */
export const parseArgs = (argv: readonly string[], switches: readonly string[]): ParsedArgs => {
    const options: Record<string, string> = {}
    const flags = new Set<string>()
    const isSwitch = new Set(switches)
    for (let i = 0; i < argv.length; i++) {
        const token = argv[i]
        if (token === undefined || !token.startsWith("--"))
            continue
        const name = token.slice(2)
        const next = argv[i + 1]
        if (isSwitch.has(name) || next === undefined || next.startsWith("--"))
            flags.add(name)
        else {
            options[name] = next
            i++
        }
    }
    return { options, flags }
}
