/*
**  nano-banana -- Deterministic Image-Generation CLI for LLM Agents
**  Copyright (c) 2026 Matthias Brusdeylins
**  Licensed under MIT license <https://spdx.org/licenses/MIT>
**
**  version-bump.mjs: bump the version in package.json and prepend the new
**  CHANGELOG section, then print the release commands.
**
**      node scripts/version-bump.mjs <major|minor|patch>
*/

import { readFileSync, writeFileSync } from "node:fs"

const kind = process.argv[2]
if (!["major", "minor", "patch"].includes(kind ?? "")) {
    console.error("usage: node scripts/version-bump.mjs <major|minor|patch>")
    process.exit(2)
}

const pkgPath = new URL("../package.json", import.meta.url)
const pkg = JSON.parse(readFileSync(pkgPath, "utf8"))
const [major, minor, patch] = pkg.version.split(".").map(Number)
const next =
    kind === "major" ? `${major + 1}.0.0` :
    kind === "minor" ? `${major}.${minor + 1}.0` :
    `${major}.${minor}.${patch + 1}`

pkg.version = next
writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`)

const clPath = new URL("../CHANGELOG.md", import.meta.url)
const changelog = readFileSync(clPath, "utf8")
if (!changelog.includes("# Changelog\n"))
    throw new Error("CHANGELOG.md: missing \"# Changelog\" heading")
writeFileSync(clPath, changelog.replace("# Changelog\n",
    `# Changelog\n\n## ${next}\n\n- (describe the changes)\n`))

console.log(`version bumped to ${next} -- now:`)
console.log("  1. fill in the CHANGELOG section")
console.log("  2. npm run plugin:sync   (build + copy bundle + sync versions)")
console.log(`  3. git commit -am "update version to ${next}" && git tag ${next}`)
console.log("  4. git push && git push --tags")
console.log("  5. npm publish --access public")
console.log(`  6. gh release create ${next} --verify-tag --notes-from-tag`)
