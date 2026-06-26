# Changelog

## 0.1.0

- Initial release. Node.js port of the former Python image-generation skill.
- Default model is the stable `gemini-3-pro-image` (Nano Banana Pro); the
  `-preview` alias is deprecated. `gemini-3.1-flash-image` (Nano Banana 2) and
  `gemini-2.5-flash-image` are documented alternatives.
- `nano-banana` CLI: generate images via Google Nano Banana Pro
  (Gemini Image API), bundled into a single ESM file with esbuild.
- Template-aware aspect ratios: `--layout` / `--placeholder` resolve the msg
  systems Research PowerPoint placeholder ratios; `--list-layouts` enumerates
  them.
- API key read from `GEMINI_API_KEY` / `GOOGLE_API_KEY` only -- never stored in
  the project.
- Corporate Zscaler TLS handled at runtime via `NODE_OPTIONS=--use-system-ca`
  or `NODE_EXTRA_CA_CERTS`; no certificate is bundled.
- Claude Code plugin `image` with the bundled skill and a `nano-banana` PATH
  wrapper.
