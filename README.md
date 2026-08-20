# nano-banana

Deterministic image- and video-generation CLI for LLM agents. Images can use
**Google Nano Banana Pro** directly through Gemini or the optional **Atlas
Cloud** provider; videos use **Google Veo** through Gemini. It produces PNG
images and MP4 videos at a chosen, model-validated aspect ratio, and ships as a
Claude Code plugin (`image` skill).

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

The only prerequisites are **Node.js >= 20** and an API key for the selected
provider in the environment (next section).

## API key

Gemini reads `GEMINI_API_KEY` or `GOOGLE_API_KEY`; Atlas Cloud reads
`ATLASCLOUD_API_KEY` or `ATLAS_CLOUD_API_KEY`. Keys are **never** committed to
the repository (`*.key` is git-ignored). `--key-file <path>` overrides the
selected provider's environment variable with a secret mounted outside the
project (CI).

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
node dst/nano-banana.mjs --provider atlas --prompt "a red sports car at dusk" --output atlas-car.png
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
| `--provider <id>` | no | `gemini` | image API provider: `gemini` or `atlas` |
| `--prompt <text>` | yes | — | generation/edit prompt (English recommended) |
| `--output <path>` | yes | — | output path: PNG (image) or MP4 (`--video`) |
| `--input <path>` | no | — | reference image; **repeatable** (1–14) for image-to-image, exactly **1** for image-to-video (PNG/JPEG/WEBP, ≤7 MB each) |
| `--aspect-ratio <r>` | no | `16:9` | aspect ratio; the allowed set is **model-dependent** (see below) |
| `--image-size <s>` | no | model default | image output resolution (`512`/`1K`/`2K`/`4K`); the allowed set is **model-dependent** |
| `--video` | — | — | generate an MP4 video via Veo instead of a PNG image |
| `--resolution <r>` | no | model default (`720p`) | video resolution (`720p`/`1080p`); `--video` only |
| `--duration <s>` | no | model default | video clip duration in seconds; **model-dependent** (`--video` only) |
| `--negative-prompt <t>` | no | — | what the video must NOT contain; `--video` only |
| `--model <id>` | no | provider/mode-specific | provider model id (see Models) |
| `--key-file <path>` | no | environment | read the API key from a file (CI override; default reads the env) |
| `--list-models` | — | — | print the model → ratios/resolution table and exit |
| `--version` | — | — | print version and exit |
| `--help` | — | — | print the full reference and exit |

Both `--flag value` and `--flag=value` are accepted; the `=` form also lets a
value begin with `--` (e.g. `--prompt="--dramatic ..."`). Unknown flags are
rejected.

### Models

**Image models (Nano Banana tiers)**

| API id | Tier | Aspect ratios | Resolutions |
|--------|------|---------------|-------------|
| `gemini-2.5-flash-image` | Nano Banana 1 | 10 standard | `1K` |
| `gemini-3-pro-image` (default) | Nano Banana Pro | 10 standard | `1K`, `2K`, `4K` |
| `gemini-3.1-flash-image` | Nano Banana 2 | 14 (standard + 4) | `512`, `1K`, `2K`, `4K` |

- **Standard ratios (10)**: `1:1, 4:5, 5:4, 2:3, 3:2, 3:4, 4:3, 9:16, 16:9, 21:9`
- **Nano Banana 2 adds (4)**: `1:4, 4:1, 1:8, 8:1` (ultra-wide / ultra-tall)

**Video models (Veo tiers, `--video`)**

| API id | Tier | Aspect ratios | Resolutions | Durations |
|--------|------|---------------|-------------|-----------|
| `veo-3.0-generate-001` (default) | Veo 3 | `16:9` | `720p`, `1080p` | 8 s |
| `veo-3.0-fast-generate-001` | Veo 3 Fast | `16:9` | `720p`, `1080p` | 8 s |
| `veo-3.1-generate-preview` | Veo 3.1 | `16:9`, `9:16` | `720p`, `1080p` | 4/6/8 s |
| `veo-3.1-fast-generate-preview` | Veo 3.1 Fast | `16:9`, `9:16` | `720p`, `1080p` | 4/6/8 s |
| `veo-3.1-lite-generate-preview` | Veo 3.1 Lite | `16:9`, `9:16` | `720p`, `1080p` | 4/6/8 s |

The Veo 3.0 tiers are GA (stable); the Veo 3.1 tiers are previews adding
portrait `9:16` and the shorter durations. All Veo 3 tiers generate **native
audio** with the video.

**Atlas Cloud image models (`--provider atlas`)**

| Mode | API id | Aspect ratios | Resolution |
|------|--------|---------------|------------|
| text-to-image | `google/nano-banana-2-lite/text-to-image-developer` | 14 | `1K` |
| image editing | `google/nano-banana-2-lite/edit-developer` | 14 | `1K` |

The CLI selects the edit model when `--input` is present and uploads local
references before the generation request. Atlas generation is image-only: it
submits one generation POST and uses bounded GET polling for the prediction.

`--aspect-ratio`, `--image-size`, `--resolution` and `--duration` are each
validated against the chosen model's set: passing an unsupported value (e.g.
`1:4` or `512` to Pro, `2K` to Nano Banana 1, or `9:16` to Veo 3.0) is a usage
error (exit 2). Without `--image-size` / `--resolution` / `--duration` the
model uses its own default. `--list-models` prints the full per-model tables.

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

### Video generation (`--video`)

`--video` switches from the Nano Banana image models to the Veo video models
and writes an MP4 (with native audio) instead of a PNG. Veo runs as a
long-running operation: the CLI polls every 10 s (progress notes on stderr)
and gives up after 10 minutes; expect a generation to take 1–6 minutes.

```bash
# text-to-video (Veo 3, 16:9, 8 s)
node dst/nano-banana.mjs --video --prompt "a calico kitten sleeps in the sun, camera pans" \
  --output kitten.mp4

# image-to-video: animate a still (exactly one --input)
node dst/nano-banana.mjs --video --prompt "the scene comes to life, gentle wind" \
  --input scene.png --output scene.mp4

# portrait short with an explicit duration (Veo 3.1 preview)
node dst/nano-banana.mjs --video --prompt "..." --output short.mp4 \
  --model veo-3.1-generate-preview --aspect-ratio 9:16 --duration 6 --resolution 1080p

# steer away from unwanted content
node dst/nano-banana.mjs --video --prompt "..." --output clip.mp4 \
  --negative-prompt "text overlays, watermarks"
```

### Output

Every run prints **exactly one JSON envelope on stdout**; diagnostic notes go to
stderr.

```json
{ "status": "ok", "file": "car.png", "aspect_ratio": "16:9", "model": "gemini-3-pro-image", "provider": "gemini" }
{ "status": "ok", "file": "clip.mp4", "aspect_ratio": "16:9", "model": "veo-3.0-generate-001", "provider": "gemini", "resolution": "1080p" }
{ "status": "error", "message": "--prompt and --output are required (unless --list-models)" }
```

The image output file is always a true PNG (JPEG responses are re-encoded);
the video output file is an MP4. A requested `--image-size`, `--resolution` or
`--duration` is echoed back as `image_size` / `resolution` / `duration_seconds`.

### Exit codes

| Code | Meaning |
|------|---------|
| `0` | success |
| `2` | usage error (missing or invalid arguments) |
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

## Development

Everything below is for working ON the tool, not with it.

### Project structure

```
nano-banana-project/
  src/                         TypeScript source
    cli/main.ts                CLI entry point (arg parsing, JSON envelope)
    core/generate.ts           Gemini Image API call (@google/genai)
    core/atlas.ts              Atlas Cloud image upload/generation/polling
    core/video.ts              Veo video tiers + Gemini Video API call
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

### Build

```bash
npm install
npm run build          # bundle -> dst/nano-banana.mjs
npm run plugin:sync    # build + copy bundle into the skill + sync versions
npm run lint           # eslint + tsc --noEmit
npm test               # vitest (builds first)
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
