# Changelog

## 0.10.0

- Video generation via Google Veo (Gemini Video API): new `--video` switch
  writes an MP4 clip (with native audio) instead of a PNG. Veo runs as a
  long-running operation; the CLI polls every 10 s (progress notes on stderr)
  and times out after 10 minutes.
- Video models: `veo-3.0-generate-001` (Veo 3, GA, default) and
  `veo-3.0-fast-generate-001` (16:9, 8 s), plus the `veo-3.1-generate-preview`
  / `-fast` / `-lite` preview tiers adding portrait `9:16` and 4/6 s
  durations. All tiers offer `720p`/`1080p`.
- New video options, each validated against the chosen model's set:
  `--resolution <720p|1080p>`, `--duration <4|6|8>` and `--negative-prompt`;
  they are usage errors without `--video`, as is `--image-size` with it. The
  requested values are echoed back as `resolution` / `duration_seconds` in the
  ok envelope.
- Image-to-video: exactly one `--input` image seeds the clip (the existing
  PNG/JPEG/WEBP reader with magic-byte detection is reused).
- `--list-models` and `--help` now cover both the Nano Banana image tiers and
  the Veo video tiers.
- Image model ids verified against the current Gemini API docs: the tiers
  (`gemini-2.5-flash-image`, `gemini-3-pro-image`, `gemini-3.1-flash-image`)
  are unchanged; no renames needed.
- README: new "Install as a Claude Code plugin" section -- the repository is a
  plugin marketplace, so the Git URL serves as the marketplace source
  (`/plugin marketplace add https://github.com/Brusdeylins/image-skill.git`,
  then `/plugin install image@nano-banana`).

## 0.9.0

- Image-to-image: new repeatable `--input <path>` attaches reference images
  (1-14, PNG/JPEG/WEBP, <=7 MB each; mime type detected from magic bytes) for
  editing, restyling, background replacement, composition and character
  consistency. The prompt and the images are sent together as one request.
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
