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
  Node without `tls.setDefaultCACertificates`, e.g. Node 22.x).
- Claude Code plugin `image` with the bundled skill and a `nano-banana` PATH
  wrapper.
- Removed the PowerPoint coupling: dropped `--layout` / `--placeholder` /
  `--list-layouts` and the hard-coded msg systems Research template layout ->
  aspect-ratio tables (`core/layouts.ts` -> neutral `core/aspect.ts`). The tool
  is now a generic, brand-neutral image generator; callers pass an explicit
  `--aspect-ratio`. The `ppt` skill never depended on this (it derives
  placeholder aspect ratios itself and does not call the image API). The prompt
  guidelines were de-branded to a generic Subject+Scene+Lighting+Camera+Quality
  formula.
- Model-aware aspect ratios: the 10 standard ratios (now incl. `4:5` / `5:4`)
  apply to every model; the 4 ultra-wide/ultra-tall ratios (`1:4`, `4:1`,
  `1:8`, `8:1`) are accepted only on `gemini-3.1-flash-image` (Nano Banana 2),
  per Google's documented per-model support. `--aspect-ratio` is validated
  against the chosen model; an unsupported ratio is a usage error.
- New `--image-size <512|1K|2K|4K>` option, validated against the chosen
  model's documented set (Nano Banana 1: `1K`; Pro: `1K`/`2K`/`4K`; Nano Banana
  2: `512`/`1K`/`2K`/`4K`). Without it the model uses its own default (~1K); the
  requested size is echoed back as `image_size` in the ok envelope.
- New `--list-models` command, now printing each model's full supported aspect
  ratios and resolutions (not just a count).
- `--help` and the README now document the full CLI: every option, the model
  matrix, aspect ratios, the JSON envelope and the exit codes.
- Hardened the CLI (analyzer findings P1-P6): every outcome is now exactly one
  JSON envelope on stdout (validation errors included) via a central
  `emitOk`/`fail` layer; argument parsing moved to `node:util.parseArgs`
  (supports `--flag=value` and `--`-prefixed values, rejects unknown flags);
  `--layout` / `--placeholder` are integer-validated and a lone `--placeholder`
  warns; the Gemini call has a request timeout; and a no-image result reports
  the `finishReason` / block reason / returned text instead of a generic
  message.
