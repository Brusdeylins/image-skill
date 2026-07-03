---
name: image
description: >
  Generate professional images using Google Nano Banana Pro (Gemini Image API)
  and videos using Google Veo (Gemini Video API). Trigger this skill when the
  user wants to generate, create, or produce images, photos, illustrations,
  visuals, videos, clips, or animations, or when another skill needs an image
  or video for a given aspect ratio.
user-invocable: true
disable-model-invocation: false
---

<!-- (c) Matthias Brusdeylins -->
<!-- 100% agentic coded (Claude Code) -->

You are an expert in professional photographic image generation and editing,
and in cinematic video generation.

## Capabilities

- **Text-to-image**: generate an image from a prompt (`--prompt` + `--output`).
- **Image-to-image / editing**: pass one or more reference images with `--input`
  (repeatable, 1-14) to edit, restyle, or compose. The model keeps subjects
  consistent across edits. Examples: recolor/retouch, background replacement,
  style transfer, merging a product into a scene, character consistency.
- **Text-to-video / image-to-video**: `--video` generates an MP4 clip (with
  native audio) via the Veo models; one optional `--input` image animates a
  still. Options: `--resolution` (`720p`/`1080p`), `--duration` (seconds,
  model-dependent), `--negative-prompt`.
- **Aspect ratio**: `--aspect-ratio` (model-dependent set).
- **Resolution**: `--image-size` (`512`/`1K`/`2K`/`4K`, model-dependent).
- **Model choice**: `--model` across the Nano Banana and Veo tiers
  (`--list-models`).

Output is a PNG (image) or an MP4 (`--video`); every run prints one JSON
envelope on stdout.

## Execution Rules

- `<skill-dir/>` is the absolute directory containing this SKILL.md.
  Substitute it literally in every command; NEVER set shell variables before
  commands (breaks permission matching).
- Run the generator as `node <skill-dir/>/scripts/nano-banana.mjs <args>`
  (needs Node >= 20; if `node --version` fails, tell the user to install Node
  20+ and stop).
- Execute each Bash call as a separate tool call (parallel when independent).
- Output is a PNG file, or an MP4 file with `--video`.
- Pick the aspect ratio with `--aspect-ratio` (default 16:9); it is validated
  against the chosen model's supported set.
- A `--video` run is a long-running operation: the CLI polls the API and can
  take 1-6 minutes; give the Bash call a timeout of at least 10 minutes and do
  not kill it early.
- Every run emits exactly one JSON envelope on stdout (`{"status":"ok",...}` or
  `{"status":"error",...}`); parse it, react to errors, do not retry blindly.

## API Key (environment only)

The API key is **never stored in this project**. It is read from the
environment at call time, from `GEMINI_API_KEY` (or `GOOGLE_API_KEY`).
`--key-file <path>` exists only as an override for a secret mounted OUTSIDE the
project tree (CI).

If the key is missing, the run fails with an actionable error. Tell the user to
set the variable for their shell and stop:

- **macOS / Linux (bash, zsh):** `export GEMINI_API_KEY="AIza..."`
- **Windows (PowerShell):** `$env:GEMINI_API_KEY = "AIza..."` (session) or
  `setx GEMINI_API_KEY "AIza..."` (persistent, reopen the terminal)
- **Windows (cmd):** `set GEMINI_API_KEY=AIza...` (session) or
  `setx GEMINI_API_KEY "AIza..."` (persistent)

The README's "Setting the variable" section lists these in full.

## Corporate Proxy (Zscaler) TLS

The generator calls the Gemini API over HTTPS. Behind a corporate Zscaler
proxy, TLS is intercepted, so the client must trust the Zscaler root CA.

**This is handled automatically.** On startup the CLI merges the OS trust
store (macOS keychain / Windows certificate store), where corporate IT
installed the Zscaler root, into Node's default CA set — so no env var, no
shell prefix and **no bundled certificate** are needed. Just run it normally.

Manual overrides remain for unusual setups (Node without
`tls.setDefaultCACertificates`, e.g. Node 22.x, or a cert not in the OS store):

- `NODE_EXTRA_CA_CERTS=/path/to/zscaler-root.crt` — a cert file outside the repo.
- `NODE_OPTIONS=--use-system-ca` — the equivalent Node flag.

If a run still fails with a TLS/`unable to verify` error, the Zscaler root is
not in the user's OS trust store; tell the user to import it there (or set
`NODE_EXTRA_CA_CERTS`).

## Command Reference

```bash
# Basic image generation
node <skill-dir/>/scripts/nano-banana.mjs \
  --prompt "..." --output image.png

# With explicit aspect ratio
node <skill-dir/>/scripts/nano-banana.mjs \
  --prompt "..." --output image.png --aspect-ratio 2:3

# Image-to-image: edit a reference image (repeat --input for up to 14)
node <skill-dir/>/scripts/nano-banana.mjs \
  --prompt "change the jacket to crimson red, keep everything else" \
  --input ref.png --output edited.png

# Compose from several reference images
node <skill-dir/>/scripts/nano-banana.mjs \
  --prompt "place the product from image 1 onto the desk in image 2" \
  --input product.png --input desk.png --output scene.png

# With a higher output resolution
node <skill-dir/>/scripts/nano-banana.mjs \
  --prompt "..." --output image.png --image-size 4K

# With a specific model + an extreme ratio (Nano Banana 2 only)
node <skill-dir/>/scripts/nano-banana.mjs \
  --prompt "..." --output image.png --model gemini-3.1-flash-image --aspect-ratio 1:4

# Text-to-video (Veo 3, 16:9, 8 s, native audio; takes 1-6 minutes)
node <skill-dir/>/scripts/nano-banana.mjs \
  --video --prompt "..." --output clip.mp4

# Image-to-video: animate a still (exactly one --input)
node <skill-dir/>/scripts/nano-banana.mjs \
  --video --prompt "the scene comes to life, gentle wind" \
  --input scene.png --output scene.mp4

# Portrait short with explicit duration/resolution (Veo 3.1 preview)
node <skill-dir/>/scripts/nano-banana.mjs \
  --video --prompt "..." --output short.mp4 \
  --model veo-3.1-generate-preview --aspect-ratio 9:16 --duration 6 --resolution 1080p

# List all models with their supported ratios and resolutions
node <skill-dir/>/scripts/nano-banana.mjs --list-models
```

### Arguments

| Argument | Required | Default | Description |
|----------|----------|---------|-------------|
| `--prompt` | yes | -- | Generation/edit prompt (English recommended) |
| `--output` | yes | -- | Output file path: PNG (image) or MP4 (`--video`) |
| `--input` | no | -- | Reference image; **repeatable** (1-14) for image-to-image, exactly **1** for image-to-video (PNG/JPEG/WEBP, <=7 MB each) |
| `--aspect-ratio` | no | 16:9 | Aspect ratio; **model-dependent** set (see Models) |
| `--image-size` | no | model default | Image output resolution (`512`/`1K`/`2K`/`4K`); **model-dependent** |
| `--video` | -- | -- | Generate an MP4 video via Veo instead of a PNG image |
| `--resolution` | no | model default (720p) | Video resolution (`720p`/`1080p`); `--video` only |
| `--duration` | no | model default | Video clip duration in seconds; **model-dependent** (`--video` only) |
| `--negative-prompt` | no | -- | What the video must NOT contain; `--video` only |
| `--model` | no | gemini-3-pro-image / veo-3.0-generate-001 | Gemini model ID (see Models) |
| `--key-file` | no | environment | Path to API key file (override; default reads env) |
| `--list-models` | -- | -- | List models with supported ratios/resolutions and exit |

Both `--flag value` and `--flag=value` are accepted; unknown flags are rejected.

### Models

Image default is **`gemini-3-pro-image`** (Nano Banana Pro, stable); video
default is **`veo-3.0-generate-001`** (Veo 3, GA). The former image `-preview`
aliases are deprecated; prefer the stable ids.

| Model ID | Tier | Aspect ratios | Resolutions |
|----------|------|---------------|-------------|
| `gemini-2.5-flash-image` | Nano Banana 1 | 10 standard | `1K` |
| `gemini-3-pro-image` (default) | Nano Banana Pro | 10 standard | `1K`, `2K`, `4K` |
| `gemini-3.1-flash-image` | Nano Banana 2 | 14 (standard + 4) | `512`, `1K`, `2K`, `4K` |

- **Standard ratios (10):** `1:1, 4:5, 5:4, 2:3, 3:2, 3:4, 4:3, 9:16, 16:9, 21:9`
- **Nano Banana 2 adds (4):** `1:4, 4:1, 1:8, 8:1` (ultra-wide / ultra-tall)

| Video model ID | Tier | Aspect ratios | Resolutions | Durations |
|----------------|------|---------------|-------------|-----------|
| `veo-3.0-generate-001` (default) | Veo 3 | `16:9` | `720p`, `1080p` | 8 s |
| `veo-3.0-fast-generate-001` | Veo 3 Fast | `16:9` | `720p`, `1080p` | 8 s |
| `veo-3.1-generate-preview` | Veo 3.1 | `16:9`, `9:16` | `720p`, `1080p` | 4/6/8 s |
| `veo-3.1-fast-generate-preview` | Veo 3.1 Fast | `16:9`, `9:16` | `720p`, `1080p` | 4/6/8 s |
| `veo-3.1-lite-generate-preview` | Veo 3.1 Lite | `16:9`, `9:16` | `720p`, `1080p` | 4/6/8 s |

All Veo 3 tiers generate native audio. Pick a Veo 3.1 preview tier when the
user needs portrait `9:16` or a 4/6 s clip; otherwise stay on the GA default.

`--aspect-ratio`, `--image-size`, `--resolution` and `--duration` are each
validated against the chosen model's set; an unsupported value (e.g. `1:4` or
`512` on Pro, `2K` on Nano Banana 1, `9:16` on Veo 3.0) is a usage error
(exit 2). Without them the model uses its own default. Run `--list-models`
for the full per-model lists.

### Output and exit codes

Every run prints exactly one JSON envelope on stdout (notes go to stderr):
`{"status":"ok","file":...,"aspect_ratio":...,"model":...}` or
`{"status":"error","message":...}`. Exit codes: `0` ok, `2` usage error
(missing/invalid args), `1` runtime error (API/network/no image or video).

## Image Prompt Guidelines

A generic prompt formula (Subject + Scene + Lighting + Camera + Quality) and
worked examples live in `references/prompt-guidelines.md`. Read it before
crafting a prompt.

## Workflow

### Standalone Usage

1. User describes what image or video they need
2. Craft a detailed prompt following `references/prompt-guidelines.md`
3. Generate with an appropriate `--aspect-ratio` (add `--video` for a clip)
4. Show the user the output path and prompt used

### Called by another skill

When another skill needs an image or video, it passes the prompt and the
desired `--aspect-ratio` (the caller knows the target geometry). Save to the
path the caller specifies and return it from the JSON envelope.

### Batch Generation

For generating multiple images or videos:
- Execute each generation as a separate Bash call
- Run them sequentially (API rate limiting)
- Save with consistent, caller-defined names
