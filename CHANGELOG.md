# Changelog

## 0.11.2

- `SKILL.md`: removed the pointer to a README section ("Setting the variable")
  that is not part of the installed plugin; the key-setting commands are
  listed right above it. Reported by @Milofax in #1.

## 0.11.1

- Dependencies updated; `npm audit` now reports 0 vulnerabilities (before: 7,
  among them `protobufjs`, `postcss`, `nanoid`, `brace-expansion`, `fast-uri`
  and `vitest`'s `@vitest/mocker`). None of the vulnerable packages is part of
  the shipped bundle.
- `@google/genai` 1.52 -> 2.26 (major). The image call (`generateContent` with
  `responseModalities`, `imageConfig`, `abortSignal`, inline reference
  images) is unchanged; verified live for text-to-image and image-to-image.
  The bundle grows from 1.71 to 1.94 MB.
- `vitest` 4 -> 5 (major). Running the tests now needs Node 22.12, 24 or 26;
  the CLI itself still runs on Node >= 20.
- In-range updates: `eslint`, `typescript-eslint`, `esbuild`, `@types/node`,
  `eslint-plugin-tsdoc`.
- `typescript` stays on 6.0.x: no `typescript-eslint` release accepts
  TypeScript 7 yet (peer range `<6.1.0`).
- `package-lock.json` now carries the real package version.

## 0.11.0

- Image models verified against the current Gemini API docs: new
  `gemini-3.1-flash-lite-image` (Nano Banana 2 Lite, 10 standard ratios, `1K`
  only). The stable `gemini-3-pro-image` default is unchanged. Image responses skip `thought`
  parts.
- Extreme ratios `1:4`, `4:1`, `1:8`, `8:1` on `gemini-3.1-flash-image` and
  size `512` are accepted by the API (verified live 2026-10-02); the docs
  excerpt checked does not list the ratios. Unknown model ids get the full
  ratio and size sets; known ids match exactly and get their tier's set.
- Video: new default `gemini-omni-1.1-flash` (Gemini Omni Flash), the
  successor of Veo, via the Gemini Interactions API (`POST /v1beta/interactions`):
  16:9/9:16, `360p`/`720p`/`1080p`/`4k`, native audio, image-to-video. The CLI
  always requests URI delivery (the file is polled until ACTIVE, then streamed
  to disk) and sends no duration (clip length is not controllable);
  `--negative-prompt` is appended to the prompt as text. The Omni clip length
  and the `task` setting are UNVERIFIED (not confirmed by the docs).
- Omni hardening: the API key is only sent to the
  `generativelanguage.googleapis.com` origin over https (redirects are
  followed manually, never forwarding the key to another origin); one shared
  deadline covers POST, polling and download, with a per-request timeout and
  a friendly "timed out" message; `res.ok` is checked before parsing JSON, and
  a non-JSON 200 body is reported as `Video generation failed: invalid API
  response`; a file URI carrying a username or password is refused.
- Video downloads are written to `<output>.<random>.part`
  (created exclusively with flag `wx`) and renamed on success, so a failure
  never destroys an existing output file.
- Verified live on 2026-10-02: an Omni 9:16 `720p` clip with the final code
  and a `1080p` clip with the same URI flow before the final hardening
  (text-to-video only; image-to-video and `4k` were not run live).
- Removed models that are ending: Veo 3.0 was shut down by Google on
  2026-06-30 and the Veo 3.1 previews end no earlier than 2026-10-22, so the
  whole Veo path (and its Google SDK video code) is gone; Omni is the only
  video model. `--duration` and the `duration_seconds` envelope field are
  removed because Omni has no clip length. `gemini-2.5-flash-image` is removed
  because Google shuts it down on 2026-10-02, together with the stderr
  shutdown note and the shutdown dates in `--list-models`. The `-preview`
  image aliases are no longer recognised (all are shut down); they are treated
  as unknown ids. WEBP input for video is not documented (UNVERIFIED).
- Usage errors (exit 2): `--video` with an image model id (or image mode with
  a video model id; unknown `gemini-omni*` ids count as Omni); a missing, unreadable or invalid API key (whitespace or
  a line break; the value is never echoed); an empty or whitespace-only
  `--prompt`; an empty `--output` or one that is a directory; an `--output`
  directory that does not exist (checked before generating, so a paid
  generation is never lost to a bad path); inline input above 20 MB in total
  (Google's documented request limit; the 7 MiB per-image limit is a CLI cap).
- An image request that hits the deadline reports `Image generation timed out
  after 120s` instead of the raw SDK abort error.
- `--help` no longer carries static model tables; it points to `--list-models`.

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
