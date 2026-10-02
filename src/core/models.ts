/*
**  nano-banana -- Deterministic Image-Generation CLI for LLM Agents
**  Copyright (c) 2026 Matthias Brusdeylins
**  Licensed under MIT license <https://spdx.org/licenses/MIT>
**
**  core/models: the Nano Banana model tiers with their aspect ratios and output
**  resolutions; single source of truth. The four ultra ratios stay on
**  gemini-3.1-flash-image only: the API accepts them there (verified live
**  2026-10-02, 1:4 gave a 512x2064 PNG); the docs excerpt checked does not list
**  them. Verified against the image-generation docs: Lite supports only 1K and
**  the 10 standard ratios, Pro 1K/2K/4K (no 512). Size 512 was verified live on
**  gemini-3.1-flash-image. UNVERIFIED: the Pro ratio list (the API validates).
*/

import { ASPECT_RATIOS, type AspectRatio } from "./aspect.js"

/**  the default Gemini image model (Nano Banana Pro)  */
export const DEFAULT_MODEL = "gemini-3-pro-image"

/**  the 10 standard aspect ratios of the Gemini image tiers  */
const STANDARD_RATIOS: readonly AspectRatio[] =
    ["1:1", "4:5", "5:4", "2:3", "3:2", "3:4", "4:3", "9:16", "16:9", "21:9"]

/**  the output resolution tokens the Gemini Image API accepts  */
const IMAGE_SIZES = ["512", "1K", "2K", "4K"] as const

/**  one accepted output resolution  */
export type ImageSize = (typeof IMAGE_SIZES)[number]

/**  one known image-model tier  */
interface ModelInfo {
    /**  the Gemini API model id  */
    id: string
    /**  the marketing tier name  */
    name: string
    /**  the aspect ratios this tier supports  */
    aspectRatios: readonly AspectRatio[]
    /**  the output resolutions this tier supports  */
    imageSizes: readonly ImageSize[]
}

/**  the known Nano Banana tiers, in ascending capability  */
export const MODELS: readonly ModelInfo[] = [
    { id: "gemini-3.1-flash-lite-image", name: "Nano Banana 2 Lite", aspectRatios: STANDARD_RATIOS, imageSizes: ["1K"] },
    { id: "gemini-3-pro-image",          name: "Nano Banana Pro",    aspectRatios: STANDARD_RATIOS, imageSizes: ["1K", "2K", "4K"] },
    { id: "gemini-3.1-flash-image",      name: "Nano Banana 2",      aspectRatios: ASPECT_RATIOS,   imageSizes: IMAGE_SIZES }
]

/**
 *  Find the tier for a model id (exact match).
 *
 *  @param model - the Gemini model id
 *  @returns the matching tier, or undefined for an unknown id
 */
export const imageModelInfo = (model: string): ModelInfo | undefined =>
    MODELS.find((m) => m.id === model)

/**
 *  The aspect ratios the given `model` supports. Known tiers return their
 *  set; an unknown id is not second-guessed and gets all 14, leaving the
 *  final say to the API.
 *
 *  @param model - the Gemini model id
 *  @returns the supported aspect ratios
 */
export const aspectRatiosForModel = (model: string): readonly AspectRatio[] =>
    imageModelInfo(model)?.aspectRatios ?? ASPECT_RATIOS

/**
 *  The output resolutions the given `model` supports. Known tiers return
 *  their set; an unknown id is not second-guessed and gets the full token
 *  set, leaving the final say to the API.
 *
 *  @param model - the Gemini model id
 *  @returns the supported resolution tokens
 */
export const imageSizesForModel = (model: string): readonly ImageSize[] =>
    imageModelInfo(model)?.imageSizes ?? IMAGE_SIZES
