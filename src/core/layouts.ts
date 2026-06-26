/*
**  nano-banana -- Deterministic Image-Generation CLI for LLM Agents
**  Copyright (c) 2026 Matthias Brusdeylins
**  Licensed under MIT license <https://spdx.org/licenses/MIT>
**
**  core/layouts: the msg systems Research PowerPoint template -- image
**  placeholder aspect ratios. Mapped from the actual placeholder dimensions
**  in the .potx template, so a slide's generated image fills its frame
**  without distortion. Used to resolve `--layout`/`--placeholder` into an
**  aspect ratio.
*/

/**  the aspect ratios the Gemini Image API accepts  */
export const ASPECT_RATIOS = ["1:1", "2:3", "3:2", "3:4", "4:3", "9:16", "16:9", "21:9"] as const

/**  one accepted aspect ratio  */
export type AspectRatio = (typeof ASPECT_RATIOS)[number]

/**  narrow an arbitrary string to a known aspect ratio  */
export const isAspectRatio = (value: string): value is AspectRatio =>
    (ASPECT_RATIOS as readonly string[]).includes(value)

/**
 *  Per-placeholder ratios keyed by `"<layout>:<placeholder>"`. Needed for
 *  layouts that carry more than one image placeholder (e.g. layout 14, the
 *  two-contacts slide with two profile photos).
 */
export const LAYOUT_PLACEHOLDER_RATIOS: Record<string, AspectRatio> = {
    "0:11":  "2:3",   /*  Titel-mit-Bild: portrait image left  */
    "1:13":  "1:1",   /*  Kapitel-mit-Bild: square-ish image right  */
    "3:14":  "16:9",  /*  Inhalt 1 Spalte mit Hintergrundbild: fullscreen  */
    "6:14":  "16:9",  /*  Inhalt 2 Spalten mit Hintergrundbild: fullscreen  */
    "8:14":  "16:9",  /*  Inhalt 3 Spalten mit Hintergrundbild: fullscreen  */
    "9:14":  "2:3",   /*  Inhalt mit Bild links: portrait image left  */
    "10:14": "1:1",   /*  Inhalt mit Bild rechts: square-ish image right  */
    "11:14": "16:9",  /*  Inhalt mit grossem Bild links: wide image left  */
    "12:14": "16:9",  /*  Keymessage mit Hintergrundbild: fullscreen  */
    "14:12": "1:1",   /*  2 Kontakte: profile photo 1  */
    "14:13": "1:1",   /*  2 Kontakte: profile photo 2  */
    "15:10": "2:3"    /*  Schlussfolie mit Bild: portrait image left  */
}

/**  primary image-placeholder ratio per layout index  */
export const LAYOUT_RATIOS: Record<number, AspectRatio> = {
    0:  "2:3",   /*  Titel-mit-Bild  */
    1:  "1:1",   /*  Kapitel-mit-Bild  */
    3:  "16:9",  /*  Inhalt 1 Spalte mit Hintergrundbild  */
    6:  "16:9",  /*  Inhalt 2 Spalten mit Hintergrundbild  */
    8:  "16:9",  /*  Inhalt 3 Spalten mit Hintergrundbild  */
    9:  "2:3",   /*  Inhalt mit Bild links  */
    10: "1:1",   /*  Inhalt mit Bild rechts  */
    11: "16:9",  /*  Inhalt mit grossem Bild  */
    12: "16:9",  /*  Keymessage mit Hintergrundbild  */
    14: "1:1",   /*  2 Kontakte (profile photos)  */
    15: "2:3"    /*  Schlussfolie mit Bild  */
}

/**  human-readable layout names for `--layout` and `--list-layouts`  */
export const LAYOUT_NAMES: Record<number, string> = {
    0:  "Title with image left",
    1:  "Chapter with image",
    3:  "Content 1 column with background",
    6:  "Content 2 columns with background",
    8:  "Content 3 columns with background",
    9:  "Content with image left",
    10: "Content with image right",
    11: "Content with large image left",
    12: "Key message with background",
    14: "2 Contacts (profile photos)",
    15: "Closing slide with image left"
}
