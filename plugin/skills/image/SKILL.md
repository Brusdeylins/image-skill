---
name: image
description: >
  Generate professional images using Google Nano Banana Pro (Gemini Image API).
  Trigger this skill when the user wants to generate, create, or produce images,
  photos, illustrations, or visuals. Also trigger when the PowerPoint skill needs
  images for slide placeholders. Supports automatic aspect ratio selection for
  msg systems Research PowerPoint template layouts.
user-invocable: true
disable-model-invocation: false
---

<!-- (c) Matthias Brusdeylins - msg systems - msg research (XT) -->
<!-- 100% agentic coded (Claude Code) -->

You are an expert in professional image generation for corporate presentations
and marketing materials.

## Execution Rules

- `<skill-dir/>` is the absolute directory containing this SKILL.md.
  Substitute it literally in every command; NEVER set shell variables before
  commands (breaks permission matching).
- Run the generator as `node <skill-dir/>/scripts/nano-banana.mjs <args>`
  (needs Node >= 20; if `node --version` fails, tell the user to install Node
  20+ and stop).
- Execute each Bash call as a separate tool call (parallel when independent).
- Always output images as PNG files.
- When generating for PowerPoint: use `--layout` to auto-select the correct
  aspect ratio.
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
proxy, TLS is intercepted, so the client must trust the Zscaler root CA. Node
ships its own CA store and ignores the OS keychain by default. Supply trust at
runtime — **never bundle a certificate into this project**:

- **Preferred (Node >= 22):** `NODE_OPTIONS=--use-system-ca` — trusts the OS
  trust store (macOS keychain / Windows certificate store), where corporate IT
  already installed the Zscaler root.
- **Fallback:** `NODE_EXTRA_CA_CERTS=/path/to/zscaler-root.crt` — a cert file
  living outside the repo.

Set it per shell: macOS/Linux `NODE_OPTIONS=--use-system-ca node ...`;
Windows PowerShell `$env:NODE_OPTIONS = "--use-system-ca"` then `node ...`.

Outside the corporate network, no certificate is needed. If a run fails with a
TLS/`unable to verify` error, instruct the user to re-run with
`--use-system-ca`.

## Command Reference

```bash
# Basic image generation
node <skill-dir/>/scripts/nano-banana.mjs \
  --prompt "..." --output image.png

# With explicit aspect ratio
node <skill-dir/>/scripts/nano-banana.mjs \
  --prompt "..." --output image.png --aspect-ratio 2:3

# With PowerPoint layout (auto-selects aspect ratio)
node <skill-dir/>/scripts/nano-banana.mjs \
  --prompt "..." --output image.png --layout 0

# With layout + specific placeholder (for multi-image layouts)
node <skill-dir/>/scripts/nano-banana.mjs \
  --prompt "..." --output image.png --layout 14 --placeholder 12

# List all layouts with image placeholders
node <skill-dir/>/scripts/nano-banana.mjs --list-layouts
```

### Arguments

| Argument | Required | Default | Description |
|----------|----------|---------|-------------|
| `--prompt` | yes | -- | Image generation prompt (English recommended) |
| `--output` | yes | -- | Output file path (PNG) |
| `--aspect-ratio` | no | 16:9 | Manual aspect ratio (1:1, 2:3, 3:2, 3:4, 4:3, 9:16, 16:9, 21:9) |
| `--layout` | no | -- | PowerPoint layout index (overrides --aspect-ratio) |
| `--placeholder` | no | -- | Placeholder index within layout (for multi-image layouts like Layout 14) |
| `--key-file` | no | environment | Path to API key file (override; default reads env) |
| `--model` | no | gemini-3-pro-image | Gemini model ID (Nano Banana Pro) |

### Models

Default is **`gemini-3-pro-image`** (Nano Banana Pro, stable). The former
`-preview` aliases are deprecated; prefer the stable ids.

| Model ID | Name | Notes |
|----------|------|-------|
| `gemini-3-pro-image` | Nano Banana Pro | default, highest quality |
| `gemini-3.1-flash-image` | Nano Banana 2 | faster, lower cost |
| `gemini-2.5-flash-image` | Nano Banana | older, fastest |

## PowerPoint Layout Aspect Ratios

When `--layout` is specified, the correct aspect ratio is automatically selected
based on the msg systems Research template placeholder dimensions:

| Layout | Aspect | Layout Name |
|--------|--------|-------------|
| 0 | 2:3 | Title with image left |
| 1 | 1:1 | Chapter with image |
| 3 | 16:9 | Content 1 column with background |
| 6 | 16:9 | Content 2 columns with background |
| 8 | 16:9 | Content 3 columns with background |
| 9 | 2:3 | Content with image left |
| 10 | 1:1 | Content with image right |
| 11 | 16:9 | Content with large image left |
| 12 | 16:9 | Key message with background |
| 14 | 1:1 | 2 Contacts (profile photos, 2 placeholders) |
| 15 | 2:3 | Closing slide with image left |

Layouts 2, 4, 5, 7, 13 have NO image placeholder.

## Image Prompt Guidelines

The corporate prompt formula, CI colors, camera/lighting/quality vocabulary and
worked examples live in `references/prompt-guidelines.md`. Read it before
crafting a prompt for the msg systems Research style.

## Workflow

### Standalone Usage

1. User describes what image they need
2. Craft a detailed prompt following `references/prompt-guidelines.md`
3. Generate with appropriate aspect ratio
4. Show the user the output path and prompt used

### PowerPoint Integration

When called from the PowerPoint skill workflow:

1. Receive the slide layout index and image prompt
2. Use `--layout` to auto-select the correct aspect ratio
3. Save to `projects/<project>/img/slide<N>_ph<IDX>.png`
4. Return the file path for insertion with `add-image --placeholder`

### Batch Generation

For generating multiple images (e.g., all slides in a presentation):
- Execute each generation as a separate Bash call
- Run them sequentially (API rate limiting)
- Save with consistent naming: `slide0_ph11.png`, `slide1_ph13.png`, etc.
