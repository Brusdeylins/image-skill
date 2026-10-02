# image -- Claude Code plugin

Professional image and video generation for Claude Code, built on the bundled
[nano-banana](../README.md) CLI, **Google Nano Banana** (Gemini Image API) and
**Gemini Omni** (Gemini video). The plugin ships **one skill**:

- **`image`** -- crafts a prompt and generates a PNG image or an MP4 clip.

## What the skill does

- **Text-to-image and image-to-image**: generate from a prompt, or edit,
  restyle and compose with one or more reference images (`--input`).
- **Text-to-video and image-to-video**: `--video` writes an MP4 clip with
  native audio via Gemini Omni; one optional `--input` image animates a
  still.
- **Model-aware options**: `--aspect-ratio`, `--image-size` and `--resolution`
  are validated against the chosen model (`--list-models`).
- **Deterministic output**: every run emits one JSON envelope on stdout.

## Requirements

- **Node >= 20**.
- **API key** in the environment: `GEMINI_API_KEY` or `GOOGLE_API_KEY`. Never
  stored in the project. It must be visible ASCII (no whitespace or line
  break); otherwise the run exits 2.

## Corporate proxy (Zscaler)

TLS trust is automatic: on startup the CLI merges the OS trust store (macOS
keychain / Windows certificate store) into Node's default CA set, so no env
var and no bundled certificate are needed. See the [README](../README.md) for
the manual overrides.
