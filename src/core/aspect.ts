/*
**  nano-banana -- Deterministic Image-Generation CLI for LLM Agents
**  Copyright (c) 2026 Matthias Brusdeylins
**  Licensed under MIT license <https://spdx.org/licenses/MIT>
**
**  core/aspect: the aspect ratios the CLI knows (image and video); per-model
**  support lives in models.ts and video.ts.
*/

/**  the full set of 14 aspect ratios the CLI knows; per-model support lives in models.ts  */
export const ASPECT_RATIOS = [
    "1:1",
    "4:5", "5:4", "2:3", "3:2", "3:4", "4:3",
    "9:16", "16:9", "21:9",
    "1:4", "4:1", "1:8", "8:1"
] as const

/**  one accepted aspect ratio  */
export type AspectRatio = (typeof ASPECT_RATIOS)[number]
