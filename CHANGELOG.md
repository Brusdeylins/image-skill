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
- Corporate Zscaler TLS handled automatically: on startup the CLI merges the OS
  trust store (macOS keychain / Windows certificate store) into Node's default
  CA set, so HTTPS works behind a TLS-intercepting proxy with no env var, no
  shell prefix and no bundled certificate. `NODE_EXTRA_CA_CERTS` /
  `NODE_OPTIONS=--use-system-ca` remain manual overrides (and the fallback on
  Node < 22.15).
- Claude Code plugin `image` with the bundled skill and a `nano-banana` PATH
  wrapper.
