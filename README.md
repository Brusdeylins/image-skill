# nano-banana

Deterministic image- and video-generation CLI for LLM agents, built on
**Google Nano Banana** (Gemini Image API) and **Gemini Omni** (Gemini
video). It produces professional PNG images and MP4 videos at a chosen,
model-validated aspect ratio, and ships as a Claude Code plugin (`image`
skill).

This is the Node.js successor of the former Python `image` skill.

## Install as a Claude Code plugin

The repository doubles as a Claude Code plugin marketplace, so the Git URL is
all you need as the source:

```
/plugin marketplace add https://github.com/Brusdeylins/image-skill.git
/plugin install image@nano-banana
```

The shorthand `owner/repo` form works too:

```
/plugin marketplace add Brusdeylins/image-skill
```

After the install, the `image` skill (text-to-image, image-to-image and
text/image-to-video) is available in every Claude Code session; update later
with `/plugin marketplace update nano-banana`.

The only prerequisites are **Node.js >= 20** and an API key in the
environment (next section).

## API key

Read from `GEMINI_API_KEY` or `GOOGLE_API_KEY`. **Never** committed to the
repository (`*.key` is git-ignored). `--key-file <path>` is an override for a
secret mounted outside the project (CI). The key must be visible ASCII; stray
whitespace or a line break is a usage error (exit 2) and is never echoed.

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

## Using the skill

Once installed, just ask Claude Code in plain language:

- *"Generate a 16:9 hero image of a red sports car at dusk"*
- *"Take photo.png and replace the background with a beach"*
- *"Make a short video of the car driving off into the rain"*

The skill crafts the prompt, picks a suitable model, aspect ratio and
resolution, runs the bundled CLI, and hands back the PNG/MP4 path. Images
arrive in seconds; a video is a long-running generation and takes **1-6
minutes**.

## Using the CLI directly

The same generator is a standalone CLI, e.g. from a repository checkout:

```bash
node dst/nano-banana.mjs --prompt "a red sports car at dusk" --output car.png
node dst/nano-banana.mjs --prompt "..." --output portrait.png --aspect-ratio 2:3
node dst/nano-banana.mjs --prompt "..." --output hi.png --image-size 4K
node dst/nano-banana.mjs --prompt "make the car blue" --input car.png --output blue.png
node dst/nano-banana.mjs --video --prompt "the car drives off into the rain" --output clip.mp4
node dst/nano-banana.mjs --video --prompt "..." --input car.png --output clip.mp4 --resolution 1080p
node dst/nano-banana.mjs --list-models
```

Run `nano-banana --help` for the same reference at the terminal.

### Options

| Option | Required | Default | Description |
|--------|----------|---------|-------------|
| `--prompt <text>` | yes | — | generation/edit prompt (English recommended); an empty or whitespace-only prompt is a usage error (exit 2) |
| `--output <path>` | yes | — | output file path: PNG (image) or MP4 (`--video`); its parent directory must exist, and an empty value or a directory is a usage error (exit 2); video downloads go to `<path>.<random>.part` (exclusive create), then rename |
| `--input <path>` | no | — | reference image; **repeatable** (1–14) for image-to-image, exactly **1** for image-to-video (PNG/JPEG/WEBP, ≤7 MiB each, ≤20 MB (decimal) in total with the prompt) |
| `--aspect-ratio <r>` | no | `16:9` | aspect ratio; the allowed set is **model-dependent** (see below) |
| `--image-size <s>` | no | model default | image output resolution (`512`/`1K`/`2K`/`4K`); the allowed set is **model-dependent** |
| `--video` | — | — | generate an MP4 video via Omni instead of a PNG image |
| `--resolution <r>` | no | model default | video resolution (`360p`/`720p`/`1080p`/`4k`); `--video` only |
| `--negative-prompt <t>` | no | — | what the video must NOT contain; `--video` only |
| `--model <id>` | no | `gemini-3-pro-image` / `gemini-omni-1.1-flash` | Gemini model id (see Models) |
| `--key-file <path>` | no | environment | read the API key from a file (CI override; default reads the env) |
| `--list-models` | — | — | print the models with their aspect ratios and resolutions, and exit |
| `--version` | — | — | print version and exit |
| `--help` | — | — | print the full reference and exit |

Both `--flag value` and `--flag=value` are accepted; the `=` form also lets a
value begin with `--` (e.g. `--prompt="--dramatic ..."`). Unknown flags are
rejected.

### Models

**Image models (Nano Banana tiers)**

| API id | Tier | Aspect ratios | Resolutions |
|--------|------|---------------|-------------|
| `gemini-3.1-flash-lite-image` | Nano Banana 2 Lite | 10 standard | `1K` |
| `gemini-3-pro-image` (default) | Nano Banana Pro | 10 standard | `1K`, `2K`, `4K` |
| `gemini-3.1-flash-image` | Nano Banana 2 | 14 (standard + 4) | `512`, `1K`, `2K`, `4K` |

- **Standard ratios (10)**: `1:1, 4:5, 5:4, 2:3, 3:2, 3:4, 4:3, 9:16, 16:9, 21:9`
- **Nano Banana 2 adds (4)**: `1:4, 4:1, 1:8, 8:1` (ultra-wide / ultra-tall).
  The API accepts them on `gemini-3.1-flash-image` (verified live
  2026-10-02); the docs excerpt checked does not list them.
- **Verified** against the image-generation docs: Lite offers `1K` only and
  the 10 standard ratios; Pro offers `1K`/`2K`/`4K` (no `512`). `512` on
  `gemini-3.1-flash-image` was also verified live on 2026-10-02.
  **UNVERIFIED** (the API validates): the ratio list of Pro.
- **Reference images**: the CLI caps `--input` at 14; per-model limits differ
  per Google (Pro 6 objects + 5 characters, Flash 10 + 4 + 3, Lite 14),
  enforcement UNVERIFIED.
- **Unknown ids**: an unknown model id gets the full ratio and size sets (the
  API decides); known ids match exactly and get their tier's set.

**Video model (Omni, `--video`)**

| API id | Tier | Aspect ratios | Resolutions | Duration |
|--------|------|---------------|-------------|----------|
| `gemini-omni-1.1-flash` (default) | Gemini Omni Flash | `16:9`, `9:16` | `360p`, `720p`, `1080p`, `4k` | not controllable |

`gemini-omni-1.1-flash` runs through the Gemini Interactions API. The clip
length cannot be controlled (there is no option); the CLI sends no duration and
appends `--negative-prompt` to the prompt as natural language. The Omni clip
length and the `task` setting are UNVERIFIED (not confirmed by the docs; the
CLI never sends them). The request blocks until the clip is ready; the CLI
always asks for URI delivery, polls the file until ACTIVE and streams the
download to disk. Omni generates **native audio**; `1080p`/`4k` are upscaled
per Google's docs. WEBP input for video is not documented (UNVERIFIED). An
unknown model id is sent to the Interactions API as is, with permissive ratios
and resolutions; the API decides.

`--aspect-ratio`, `--image-size` and `--resolution` are each validated against
the chosen model's set: passing an unsupported value (e.g. `1:4` or `512` to
Pro, or `8k` to Omni) is a usage error (exit 2). Without `--image-size` /
`--resolution` the model uses its own default. `--list-models` prints the full
per-model tables.

### Image-to-image (editing & composition)

Pass one or more reference images with `--input` (repeatable) to edit, restyle,
or compose instead of generating from text alone. Up to **14** images per call,
**PNG/JPEG/WEBP**, **≤7 MiB** each (a CLI cap, not a documented API limit).
The documented limit is 20 MB total inline request size, prompt included; the
CLI checks the sum and exits 2 above 20 MB (decimal). The mime type is
detected from the file's magic bytes, not its extension.

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

### Video generation (`--video`)

`--video` switches from the Nano Banana image models to the Omni video model
and writes an MP4 (with native audio) instead of a PNG. Omni is one blocking
Interactions API request followed by file polling. The CLI polls every 10 s
(progress notes on stderr) and gives up after 10 minutes; expect a generation
to take 1–6 minutes.

```bash
# text-to-video (Omni, 16:9)
node dst/nano-banana.mjs --video --prompt "a calico kitten sleeps in the sun, camera pans" \
  --output kitten.mp4

# image-to-video: animate a still (exactly one --input)
node dst/nano-banana.mjs --video --prompt "the scene comes to life, gentle wind" \
  --input scene.png --output scene.mp4

# portrait short in 1080p
node dst/nano-banana.mjs --video --prompt "..." --output short.mp4 \
  --aspect-ratio 9:16 --resolution 1080p

# steer away from unwanted content
node dst/nano-banana.mjs --video --prompt "..." --output clip.mp4 \
  --negative-prompt "text overlays, watermarks"
```

### Output

Every run prints **exactly one JSON envelope on stdout**; diagnostic notes go to
stderr.

```json
{ "status": "ok", "file": "car.png", "aspect_ratio": "16:9", "model": "gemini-3-pro-image" }
{ "status": "ok", "file": "clip.mp4", "aspect_ratio": "16:9", "model": "gemini-omni-1.1-flash", "resolution": "1080p" }
{ "status": "error", "message": "--prompt and --output are required (unless --list-models)" }
```

The image output file is always a true PNG (JPEG responses are re-encoded);
the video output file is an MP4. A requested `--image-size` or `--resolution`
is echoed back as `image_size` / `resolution`.

### Exit codes

| Code | Meaning |
|------|---------|
| `0` | success |
| `2` | usage error (missing or invalid arguments or credentials) |
| `1` | runtime error (API, network, or no image/video returned) |

## Corporate proxy (Zscaler) TLS

The CLI talks to the Gemini API over HTTPS. Behind a Zscaler proxy, TLS is
intercepted and the client must trust the Zscaler root CA.

**This is automatic.** On startup the CLI merges the OS trust store (macOS
keychain / Windows certificate store) — where corporate IT installed the
Zscaler root — into Node's default CA set (`tls.setDefaultCACertificates`). No
env var, no shell prefix and **no bundled certificate** are needed; just run
the tool normally. The merge extends, never replaces, the bundled roots, so
public endpoints keep verifying. It is a no-op on Node versions without
`tls.setDefaultCACertificates`, which fall back to the manual override
below.

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

## Development

Everything below is for working ON the tool, not with it.

### Project structure

```
nano-banana-project/
  src/                         TypeScript source
    cli/main.ts                CLI entry point (arg parsing, JSON envelope)
    core/generate.ts           Gemini Image API call (@google/genai)
    core/video.ts              Omni video model + Interactions API call
    core/types.ts              shared InputImage / GenerateResult types
    core/aspect.ts             aspect ratios the CLI knows
    core/models.ts             image model tiers + per-model ratio/size support
    core/png.ts                PNG/JPEG magic-byte checks, PNG re-encoding
    infra/apikey.ts            API key resolution (env or --key-file)
    infra/imagefile.ts         read/validate reference input images
    infra/args.ts              --flag parsing (util.parseArgs)
    infra/envelope.ts          JSON envelope output + error message helper
    infra/tls.ts               merge the OS trust store into Node's CA set
    infra/version.ts           build-injected version facts
  test/                        vitest suites
    cli.test.ts                built-bundle CLI smoke tests
    generate.test.ts           image generation (mocked SDK)
    main.test.ts               CLI entry point wiring
    omni.test.ts               Omni video path (mocked fetch)
    unit.test.ts               pure helpers (models, args, files)
    global-setup.ts            rebuilds the dst bundle when stale
    helpers.ts                 shared test helpers
  vitest.config.mjs            vitest configuration (registers the global setup)
  scripts/
    build.mjs                  esbuild bundle -> dst/nano-banana.mjs
    sync-versions.mjs          propagate package.json version into derived files
    version-bump.mjs           bump version + CHANGELOG, print release steps
  plugin/                      Claude Code plugin
    .claude-plugin/plugin.json
    README.md
    bin/nano-banana            PATH wrapper
    skills/image/
      SKILL.md
      VERSION
      references/prompt-guidelines.md
      scripts/nano-banana.mjs  bundled CLI (copied by plugin:sync)
  .claude-plugin/marketplace.json
```

### Build

```bash
npm install
npm run build          # bundle -> dst/nano-banana.mjs
npm run plugin:sync    # build + copy bundle into the skill + sync versions
npm run lint           # eslint + tsc --noEmit
npm test               # vitest (globalSetup rebuilds a stale bundle)
```

### Release

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
