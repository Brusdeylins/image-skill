/*
**  nano-banana -- Deterministic Image-Generation CLI for LLM Agents
**  Copyright (c) 2026 Matthias Brusdeylins
**  Licensed under MIT license <https://spdx.org/licenses/MIT>
**
**  sync-versions.mjs: propagate the single source-of-truth version from
**  package.json into every DERIVED version source so a release never leaves
**  one of them stale (a missed plugin.json makes `/plugin` report the old
**  version). Run after `version-bump.mjs`, as part of `plugin:sync`.
**
**  Derived sources (3 files, 3 occurrences):
**    plugin/.claude-plugin/plugin.json   version (authoritative for /plugin)
**    .claude-plugin/marketplace.json     metadata.version + plugins[].version
**    plugin/skills/image/VERSION         skill self-report
**
**  The two JSON files are patched by REPLACING the version value only (never
**  re-serialized), so their hand-kept formatting stays byte-stable.
*/

import { readFileSync, writeFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const version = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8")).version

/*  replace every `"version": "..."` value in a JSON file, in place  */
const patchJson = (rel, expected) => {
    const file = path.join(root, rel)
    const before = readFileSync(file, "utf8")
    let hits = 0
    const after = before.replace(/("version"\s*:\s*")[^"]*(")/g, (_, pre, post) => {
        hits++
        return `${pre}${version}${post}`
    })
    if (hits !== expected)
        throw new Error(`${rel}: expected ${expected} version field(s), found ${hits}`)
    writeFileSync(file, after)
    return hits
}

/*  overwrite a plain-text VERSION sidecar  */
const writeVersionFile = rel =>
    writeFileSync(path.join(root, rel), `${version}\n`)

patchJson("plugin/.claude-plugin/plugin.json", 1)
patchJson(".claude-plugin/marketplace.json", 2)
writeVersionFile("plugin/skills/image/VERSION")

console.log(`synced version ${version} -> plugin.json, marketplace.json (x2), VERSION`)
