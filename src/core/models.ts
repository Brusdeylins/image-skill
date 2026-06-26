/*
**  nano-banana -- Deterministic Image-Generation CLI for LLM Agents
**  Copyright (c) 2026 Matthias Brusdeylins
**  Licensed under MIT license <https://spdx.org/licenses/MIT>
**
**  core/models: the Nano Banana model tiers and their per-model support for
**  aspect ratios and output resolution. Google's API validator permissively
**  accepts all 14 ratios for every model, but per the documentation only Nano
**  Banana 2 officially supports the four ultra-wide/ultra-tall ratios; Pro and
**  the 2.5 flash tier support the 10 standard ratios. Resolution support is
**  enforced by the API (verified): 2.5 flash is 1K only, Pro is 1K/2K/4K, and
**  Nano Banana 2 adds 512. This module is the single source of truth.
*/

import { ASPECT_RATIOS, type AspectRatio } from "./aspect.js"

/**  the 10 aspect ratios every Gemini image model supports  */
export const STANDARD_RATIOS: readonly AspectRatio[] =
    ["1:1", "4:5", "5:4", "2:3", "3:2", "3:4", "4:3", "9:16", "16:9", "21:9"]

/**  the output resolution tokens the Gemini Image API accepts  */
export const IMAGE_SIZES = ["512", "1K", "2K", "4K"] as const

/**  one accepted output resolution  */
export type ImageSize = (typeof IMAGE_SIZES)[number]

/**  narrow an arbitrary string to a known resolution token  */
export const isImageSize = (value: string): value is ImageSize =>
    (IMAGE_SIZES as readonly string[]).includes(value)

/**  one known image-model tier  */
export interface ModelInfo {
    /**  the Gemini API model id  */
    id: string
    /**  the marketing tier name  */
    name: string
    /**  the output resolutions this tier supports  */
    imageSizes: readonly ImageSize[]
}

/**  the known Nano Banana tiers, in ascending capability  */
export const MODELS: readonly ModelInfo[] = [
    { id: "gemini-2.5-flash-image", name: "Nano Banana 1",   imageSizes: ["1K"] },
    { id: "gemini-3-pro-image",     name: "Nano Banana Pro", imageSizes: ["1K", "2K", "4K"] },
    { id: "gemini-3.1-flash-image", name: "Nano Banana 2",   imageSizes: ["512", "1K", "2K", "4K"] }
]

/**
 *  Whether `model` is the Nano Banana 2 tier -- the only one that officially
 *  supports the four ultra-wide/ultra-tall ratios. Matches the stable id and
 *  its `-preview` alias.
 *
 *  @param model - the Gemini model id
 *  @returns true for the Nano Banana 2 tier
 */
export const isNanoBanana2 = (model: string): boolean =>
    model.startsWith("gemini-3.1-flash-image")

/**
 *  The aspect ratios the given `model` officially supports: the extended set
 *  (all 14) for Nano Banana 2, the standard set (10) for every other model.
 *
 *  @param model - the Gemini model id
 *  @returns the supported aspect ratios
 */
export const aspectRatiosForModel = (model: string): readonly AspectRatio[] =>
    isNanoBanana2(model) ? ASPECT_RATIOS : STANDARD_RATIOS

/**
 *  The output resolutions the given `model` supports. Known tiers return their
 *  documented set; an unknown (custom) model id is not second-guessed and gets
 *  the full token set, leaving the final say to the API.
 *
 *  @param model - the Gemini model id
 *  @returns the supported resolution tokens
 */
export const imageSizesForModel = (model: string): readonly ImageSize[] =>
    MODELS.find((m) => m.id === model)?.imageSizes ?? IMAGE_SIZES
