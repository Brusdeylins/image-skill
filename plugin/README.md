# image -- Claude Code plugin

Professional image generation for Claude Code, built on the bundled
[nano-banana](../README.md) CLI and **Google Nano Banana Pro** (Gemini Image
API). The plugin ships **one skill**:

- **`image`** -- crafts a prompt and generates a PNG, with template-aware
  aspect ratios for the msg systems Research PowerPoint layouts.

## What the skill does

- **Corporate-style prompts**: a fixed formula (CI accent #A01441, camera,
  lighting, quality) yields on-brand, editorial-quality images.
- **Template-aware aspect ratios**: `--layout` / `--placeholder` resolve the
  real placeholder ratios of the PowerPoint template, so a slide image fills
  its frame without distortion.
- **Deterministic output**: every run emits one JSON envelope on stdout.
- **PowerPoint integration**: triggered by the `ppt` skill to fill picture
  placeholders.

## Requirements

- **Node >= 20** (>= 22 recommended for `--use-system-ca`).
- **API key** in the environment: `GEMINI_API_KEY` or `GOOGLE_API_KEY`. Never
  stored in the project.

## Corporate proxy (Zscaler)

The skill calls the Gemini API over HTTPS. Behind a Zscaler proxy, run with
`NODE_OPTIONS=--use-system-ca` (trusts the macOS keychain) or
`NODE_EXTRA_CA_CERTS=/path/to/zscaler-root.crt`. No certificate is bundled with
the plugin.
