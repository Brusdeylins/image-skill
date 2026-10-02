---
name: image
description: >
  Generate professional images using Google Nano Banana (Gemini Image API)
  and videos using Gemini Omni (Gemini video). Trigger this skill
  when the user wants to generate, create, or produce images, photos,
  illustrations, visuals, videos, clips, or animations, or when another skill
  needs an image or video for a given aspect ratio.
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
  native audio) via the Omni model; one optional `--input` image animates a
  still. Options: `--resolution` (`360p`/`720p`/`1080p`/`4k`) and
  `--negative-prompt`. The clip length is not controllable.
- **Aspect ratio**: `--aspect-ratio` (model-dependent set).
- **Resolution**: `--image-size` (`512`/`1K`/`2K`/`4K`, model-dependent).
- **Model choice**: `--model` across the Nano Banana tiers and Omni
  (`--list-models`).

Every run prints one JSON envelope on stdout.

## Execution Rules

- `<skill-dir/>` is the absolute directory containing this SKILL.md.
  Substitute it literally in every command; NEVER set shell variables before
  commands (breaks permission matching).
- Run the generator as `node <skill-dir/>/scripts/nano-banana.mjs <args>`
  (needs Node >= 20; if `node --version` fails, tell the user to install Node
  20+ and stop).
- Execute each Bash call as a separate tool call; for several generations see
  Batch Generation (sequential).
- Pick the aspect ratio with `--aspect-ratio` (default 16:9); it is validated
  against the chosen model's supported set.
- A `--video` run is a long-running operation (one blocking request plus file
  polling) and can take 1-6 minutes; give the Bash call a timeout of at least 10 minutes and do not kill it early.
- Only pass `--output`, `--input` and `--key-file` paths inside the working
  directory; the CLI writes and reads wherever it is told.
- Every run emits exactly one JSON envelope on stdout (`{"status":"ok",...}` or
  `{"status":"error",...}`); parse it, react to errors, do not retry blindly.

## API Key (environment only)

The API key is **never stored in this project**. It is read from the
environment at call time, from `GEMINI_API_KEY` (or `GOOGLE_API_KEY`).
`--key-file <path>` exists only as an override for a secret mounted OUTSIDE the
project tree (CI). The key must be visible ASCII; stray whitespace or a line
break is a usage error (exit 2) that never echoes the value.

If the key is missing, the run fails with an actionable error. Tell the user to
set the variable for their shell and stop:

- **macOS / Linux (bash, zsh):** `export GEMINI_API_KEY="AIza..."`
- **Windows (PowerShell):** `$env:GEMINI_API_KEY = "AIza..."` (session) or
  `setx GEMINI_API_KEY "AIza..."` (persistent, reopen the terminal)
- **Windows (cmd):** `set GEMINI_API_KEY=AIza...` (session) or
  `setx GEMINI_API_KEY "AIza..."` (persistent)

## Corporate Proxy (Zscaler) TLS

The generator calls the Gemini API over HTTPS. Behind a corporate Zscaler
proxy, TLS is intercepted, so the client must trust the Zscaler root CA.

**This is handled automatically.** On startup the CLI merges the OS trust
store (macOS keychain / Windows certificate store), where corporate IT
installed the Zscaler root, into Node's default CA set — so no env var, no
shell prefix and **no bundled certificate** are needed. Just run it normally.

Manual overrides remain for unusual setups (Node versions
without `tls.setDefaultCACertificates`, or a cert not in the OS store):

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

# With a specific model + an extreme ratio (Nano Banana 2 only; the API accepts it, verified live 2026-10-02)
node <skill-dir/>/scripts/nano-banana.mjs \
  --prompt "..." --output image.png --model gemini-3.1-flash-image --aspect-ratio 1:4

# Text-to-video (Omni, 16:9, native audio; takes 1-6 minutes)
node <skill-dir/>/scripts/nano-banana.mjs \
  --video --prompt "..." --output clip.mp4

# Image-to-video: animate a still (exactly one --input)
node <skill-dir/>/scripts/nano-banana.mjs \
  --video --prompt "the scene comes to life, gentle wind" \
  --input scene.png --output scene.mp4

# Portrait short on Omni (clip length is not controllable)
node <skill-dir/>/scripts/nano-banana.mjs \
  --video --prompt "..." --output short.mp4 \
  --aspect-ratio 9:16 --resolution 1080p

# List all models with their supported ratios and resolutions
node <skill-dir/>/scripts/nano-banana.mjs --list-models
```

### Arguments

| Argument | Required | Default | Description |
|----------|----------|---------|-------------|
| `--prompt` | yes | -- | Generation/edit prompt (English recommended); an empty or whitespace-only prompt is a usage error (exit 2) |
| `--output` | yes | -- | Output file path: PNG (image) or MP4 (`--video`); its parent directory must exist; an empty value or a directory is a usage error (exit 2) |
| `--input` | no | -- | Reference image; **repeatable** (1-14) for image-to-image, exactly **1** for image-to-video (PNG/JPEG/WEBP, <=7 MiB each, <=20 MB (decimal) in total with the prompt; exit 2 above) |
| `--aspect-ratio` | no | 16:9 | Aspect ratio; **model-dependent** set (see Models) |
| `--image-size` | no | model default | Image output resolution (`512`/`1K`/`2K`/`4K`); **model-dependent** |
| `--video` | -- | -- | Generate an MP4 video via Omni instead of a PNG image |
| `--resolution` | no | model default | Video resolution (`360p`/`720p`/`1080p`/`4k`), **model-dependent**; `--video` only |
| `--negative-prompt` | no | -- | What the video must NOT contain; `--video` only |
| `--model` | no | gemini-3-pro-image / gemini-omni-1.1-flash | Gemini model ID (see Models) |
| `--key-file` | no | environment | Path to API key file (override; default reads env) |
| `--list-models` | -- | -- | List models with their aspect ratios and resolutions, and exit |

Both `--flag value` and `--flag=value` are accepted; unknown flags are rejected.

### Models

Image default is **`gemini-3-pro-image`** (Nano Banana Pro, stable); video
default is **`gemini-omni-1.1-flash`** (Gemini Omni Flash). Model ids match
exactly; an unknown id (e.g. a former `-preview` alias, which the API rejects)
gets the full ratio and size sets and the API decides.

| Model ID | Tier | Aspect ratios | Resolutions |
|----------|------|---------------|-------------|
| `gemini-3.1-flash-lite-image` | Nano Banana 2 Lite | 10 standard | `1K` |
| `gemini-3-pro-image` (default) | Nano Banana Pro | 10 standard | `1K`, `2K`, `4K` |
| `gemini-3.1-flash-image` | Nano Banana 2 | 14 (standard + 4) | `512`, `1K`, `2K`, `4K` |

- **Standard ratios (10):** `1:1, 4:5, 5:4, 2:3, 3:2, 3:4, 4:3, 9:16, 16:9, 21:9`
- **Nano Banana 2 adds (4):** `1:4, 4:1, 1:8, 8:1` (ultra-wide / ultra-tall),
  accepted by the API on `gemini-3.1-flash-image` only
- **Unverified:** the Pro ratio list (the API validates); the README has the
  evidence.
- **Reference images:** the CLI caps `--input` at 14; per-model limits differ
  per Google, enforcement UNVERIFIED.

| Video model ID | Tier | Aspect ratios | Resolutions | Duration |
|----------------|------|---------------|-------------|----------|
| `gemini-omni-1.1-flash` (default) | Gemini Omni Flash | `16:9`, `9:16` | `360p`, `720p`, `1080p`, `4k` | not controllable |

Omni generates native audio and runs through the Interactions API (always URI
delivery, file polled until ACTIVE, streamed download). The clip length cannot
be controlled (there is no option); the CLI sends no duration and appends
`--negative-prompt` to the prompt as natural language. UNVERIFIED: the Omni
clip length and the `task` setting are not confirmed by the docs (the CLI never
sends them); `1080p`/`4k` are upscaled; WEBP input for video is not documented.
An unknown model id is sent to the Interactions API as is.

`--aspect-ratio`, `--image-size` and `--resolution` are each validated against
the chosen model's set; an unsupported value (e.g. `1:4` or `512` on Pro) is a
usage error (exit 2). Without them the model uses its own default. Run
`--list-models` for the full per-model lists.

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
