# nano-banana

Deterministic image-generation CLI for LLM agents, built on **Google Nano
Banana Pro** (Gemini Image API). It produces professional PNG images with
template-aware aspect ratios for the msg systems Research PowerPoint template,
and ships as a Claude Code plugin (`image` skill).

This is the Node.js successor of the former Python `image` skill.

## Layout

```
nano-banana-project/
  src/                         TypeScript source
    cli/main.ts                CLI entry point (arg parsing, JSON envelope)
    core/generate.ts           Gemini Image API call (@google/genai)
    core/layouts.ts            PowerPoint layout -> aspect ratio tables
    infra/apikey.ts            env-only API key resolution
    infra/args.ts              tiny --flag parser
    infra/version.ts           build-injected version facts
  scripts/
    build.mjs                  esbuild bundle -> dst/nano-banana.mjs
    sync-versions.mjs          propagate package.json version into derived files
    version-bump.mjs           bump version + CHANGELOG, print release steps
  plugin/                      Claude Code plugin
    .claude-plugin/plugin.json
    bin/nano-banana            PATH wrapper
    skills/image/
      SKILL.md
      VERSION
      references/prompt-guidelines.md
      scripts/nano-banana.mjs  bundled CLI (copied by plugin:sync)
  .claude-plugin/marketplace.json
```

## Build

```bash
npm install
npm run build          # bundle -> dst/nano-banana.mjs
npm run plugin:sync    # build + copy bundle into the skill + sync versions
```

## Usage

```bash
# API key comes from the environment -- never stored in the project
export GEMINI_API_KEY=...

node dst/nano-banana.mjs --prompt "a red sports car at dusk" --output car.png
node dst/nano-banana.mjs --prompt "..." --output slide0.png --layout 0
node dst/nano-banana.mjs --list-layouts
```

Every run prints one JSON envelope on stdout:

```json
{ "status": "ok", "file": "car.png", "aspect_ratio": "16:9", "model": "gemini-3-pro-image" }
```

## API key

Read from `GEMINI_API_KEY` or `GOOGLE_API_KEY`. **Never** committed to the
repository (`*.key` is git-ignored). `--key-file <path>` is an override for a
secret mounted outside the project (CI).

### Setting the variable

**macOS / Linux (bash, zsh)**

```bash
# current shell session only
export GEMINI_API_KEY="AIza..."

# persist (zsh): use ~/.zshenv -- it is loaded by EVERY zsh instance,
# including non-interactive ones (scripts, cron, CI, editor terminals).
# ~/.zshrc is only read by interactive shells, so a script may not see it.
echo 'export GEMINI_API_KEY="AIza..."' >> ~/.zshenv

# persist (bash): ~/.bashrc (interactive) or ~/.bash_profile (login shells)
echo 'export GEMINI_API_KEY="AIza..."' >> ~/.bashrc
```

**Windows (PowerShell)**

```powershell
# current session only
$env:GEMINI_API_KEY = "AIza..."

# persist for the current user (new sessions; reopen the terminal)
setx GEMINI_API_KEY "AIza..."
```

**Windows (cmd.exe)**

```bat
:: current session only
set GEMINI_API_KEY=AIza...

:: persist for the current user (new sessions; reopen the terminal)
setx GEMINI_API_KEY "AIza..."
```

Verify it is set: `echo $GEMINI_API_KEY` (macOS/Linux),
`echo $env:GEMINI_API_KEY` (PowerShell), `echo %GEMINI_API_KEY%` (cmd).

## Corporate proxy (Zscaler) TLS

The CLI talks to the Gemini API over HTTPS. Behind a Zscaler proxy, TLS is
intercepted and the client must trust the Zscaler root CA.

**This is automatic.** On startup the CLI merges the OS trust store (macOS
keychain / Windows certificate store) — where corporate IT installed the
Zscaler root — into Node's default CA set (`tls.setDefaultCACertificates`). No
env var, no shell prefix and **no bundled certificate** are needed; just run
the tool normally. The merge extends, never replaces, the bundled roots, so
public endpoints keep verifying. It is a no-op on Node < 22.15 (which lacks the
system-CA API).

Manual overrides remain available for unusual setups:

```bash
# A cert file outside the repo (also covers Node < 22.15)
NODE_EXTRA_CA_CERTS=$HOME/.certs/zscaler-root.crt node dst/nano-banana.mjs ...
```

```powershell
# Windows PowerShell
$env:NODE_EXTRA_CA_CERTS = "$env:USERPROFILE\.certs\zscaler-root.crt"
node dst/nano-banana.mjs ...
```

If a run still fails with a TLS / `unable to verify` error, the Zscaler root is
not in the OS trust store — import it there, or point `NODE_EXTRA_CA_CERTS` at
it. Outside the corporate network no certificate is needed.

## Release

```bash
node scripts/version-bump.mjs <major|minor|patch>
# fill in CHANGELOG, then:
npm run plugin:sync
git commit -am "update version to X.Y.Z" && git tag X.Y.Z
git push && git push --tags
npm publish --access public
gh release create X.Y.Z --verify-tag --notes-from-tag
```

## License

MIT © Matthias Brusdeylins
