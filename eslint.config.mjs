/*
**  nano-banana -- Deterministic Image-Generation CLI for LLM Agents
**  Copyright (c) 2026 Matthias Brusdeylins
**  Licensed under MIT license <https://spdx.org/licenses/MIT>
*/

import eslint from "@eslint/js"
import tseslint from "typescript-eslint"
import tsdoc from "eslint-plugin-tsdoc"

export default tseslint.config(
    eslint.configs.recommended,
    ...tseslint.configs.strict,
    {
        files: ["src/**/*.ts", "test/**/*.ts"],
        plugins: { tsdoc },
        rules: {
            "tsdoc/syntax": "warn",
            "@typescript-eslint/explicit-module-boundary-types": "error",
            "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
            "no-console": "error",
            "semi": ["error", "never"],
            "quotes": ["error", "double", { avoidEscape: true }]
        }
    },
    {
        /*  main renders the CLI envelope on stdout/stderr  */
        files: ["src/cli/main.ts"],
        rules: { "no-console": "off" }
    },
    {
        files: ["**/*.mjs"],
        languageOptions: { globals: { console: "readonly", process: "readonly" } },
        rules: { "no-console": "off" }
    }
)
