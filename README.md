# nano-banana

Deterministic image-generation CLI for LLM agents, built on **Google Nano
Banana Pro** (Gemini Image API). It produces professional PNG images at a
chosen, model-validated aspect ratio, and ships as a Claude Code plugin
(`image` skill).

This is the Node.js successor of the former Python `image` skill.

## Project structure

```
nano-banana-project/
  src/                         TypeScript source
    cli/main.ts                CLI entry point (arg parsing, JSON envelope)
    core/generate.ts           Gemini Image API call (@google/genai)
    core/aspect.ts             accepted aspect ratios + guard
    core/models.ts             model tiers + per-model ratio/resolution support
    infra/apikey.ts            env-only API key resolution
    infra/imagefile.ts         read/validate reference input images
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
node dst/nano-banana.mjs --prompt "..." --output portrait.png --aspect-ratio 2:3
node dst/nano-banana.mjs --prompt "..." --output hi.png --image-size 4K
node dst/nano-banana.mjs --prompt "make the car blue" --input car.png --output blue.png
node dst/nano-banana.mjs --list-models
```

## CLI reference

Run `nano-banana --help` for the same reference at the terminal.

### Options

| Option | Required | Default | Description |
|--------|----------|---------|-------------|
| `--prompt <text>` | yes | — | image generation/edit prompt (English recommended) |
| `--output <path>` | yes | — | output PNG path |
| `--input <path>` | no | — | reference image for image-to-image; **repeatable** (1–14, PNG/JPEG/WEBP, ≤7 MB each) |
| `--aspect-ratio <r>` | no | `16:9` | aspect ratio; the allowed set is **model-dependent** (see below) |
| `--image-size <s>` | no | model default | output resolution (`512`/`1K`/`2K`/`4K`); the allowed set is **model-dependent** |
| `--model <id>` | no | `gemini-3-pro-image` | Gemini model id (see Models) |
| `--key-file <path>` | no | environment | read the API key from a file (CI override; default reads the env) |
| `--list-models` | — | — | print the model → ratios/resolution table and exit |
| `--version` | — | — | print version and exit |
| `--help` | — | — | print the full reference and exit |

Both `--flag value` and `--flag=value` are accepted; the `=` form also lets a
value begin with `--` (e.g. `--prompt="--dramatic ..."`). Unknown flags are
rejected.

### Models

| API id | Tier | Aspect ratios | Resolutions |
|--------|------|---------------|-------------|
| `gemini-2.5-flash-image` | Nano Banana 1 | 10 standard | `1K` |
| `gemini-3-pro-image` (default) | Nano Banana Pro | 10 standard | `1K`, `2K`, `4K` |
| `gemini-3.1-flash-image` | Nano Banana 2 | 14 (standard + 4) | `512`, `1K`, `2K`, `4K` |

- **Standard ratios (10)**: `1:1, 4:5, 5:4, 2:3, 3:2, 3:4, 4:3, 9:16, 16:9, 21:9`
- **Nano Banana 2 adds (4)**: `1:4, 4:1, 1:8, 8:1` (ultra-wide / ultra-tall)

`--aspect-ratio` and `--image-size` are each validated against the chosen
model's set: passing an unsupported value (e.g. `1:4` or `512` to Pro, or `2K`
to Nano Banana 1) is a usage error (exit 2). Without `--image-size` the model
uses its own default (~1K). `--list-models` prints the full per-model ratios and
resolutions.

### Image-to-image (editing & composition)

Pass one or more reference images with `--input` (repeatable) to edit, restyle,
or compose instead of generating from text alone. Up to **14** images per call,
**PNG/JPEG/WEBP**, **≤7 MB** each (the mime type is detected from the file's
magic bytes, not its extension).

```bash
# recolor / retouch a single image
node dst/nano-banana.mjs --prompt "change the jacket to crimson red, keep the rest" \
  --input person.png --output recolored.png

# compose from several references
node dst/nano-banana.mjs --prompt "put the product from image 1 on the desk in image 2" \
  --input product.png --input desk.png --output scene.png
```

The prompt drives the edit (background replacement, style transfer, merging,
character consistency, …). The output is still a true PNG.

### Output

Every run prints **exactly one JSON envelope on stdout**; diagnostic notes go to
stderr.

```json
{ "status": "ok", "file": "car.png", "aspect_ratio": "16:9", "model": "gemini-3-pro-image" }
{ "status": "error", "message": "--prompt and --output are required (unless --list-models)" }
```

The output file is always a true PNG (JPEG responses are re-encoded).

### Exit codes

| Code | Meaning |
|------|---------|
| `0` | success |
| `2` | usage error (missing or invalid arguments) |
| `1` | runtime error (API, network, or no image returned) |

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
public endpoints keep verifying. It is a no-op on Node versions without
`tls.setDefaultCACertificates` (Node 22.x and earlier), which fall back to the
manual override below.

Manual overrides remain available for unusual setups:

```bash
# A cert file outside the repo (also covers Node without setDefaultCACertificates)
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
