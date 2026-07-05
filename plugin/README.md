# image -- Claude Code plugin

Professional image generation for Claude Code, built on the bundled
[nano-banana](../README.md) CLI and **Google Nano Banana Pro** (Gemini Image
API). The plugin ships **one skill**:

- **`image`** -- crafts a prompt and generates a PNG or MP4 via the Gemini
  Image and Veo APIs.

## What the skill does

- **Text-to-image / image-to-image**: generate a PNG from a prompt, or edit / compose
  from up to 14 reference images (`--input`), via Google Nano Banana (Gemini Image API).
- **Text/image-to-video**: generate an MP4 clip with native audio via Google Veo
  (`--video`).
- **Model-aware geometry**: `--aspect-ratio`, `--image-size`, `--resolution` and
  `--duration` are each validated against the chosen model's supported set.
- **Deterministic output**: every run emits exactly one JSON envelope on stdout.

## Requirements

- **Node >= 20** (>= 22 recommended for `--use-system-ca`).
- **API key** in the environment: `GEMINI_API_KEY` or `GOOGLE_API_KEY`. Never
  stored in the project.

## Corporate proxy (Zscaler)

The skill calls the Gemini API over HTTPS. Behind a Zscaler proxy, run with
`NODE_OPTIONS=--use-system-ca` (trusts the macOS keychain) or
`NODE_EXTRA_CA_CERTS=/path/to/zscaler-root.crt`. No certificate is bundled with
the plugin.
