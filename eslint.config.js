import { defineConfig, globalIgnores } from "eslint/config";
import js from "@eslint/js";

export default defineConfig([
  globalIgnores(["**/dist/", "**/node_modules/", "**/generated/"]),
  js.configs.recommended,
  {
    // Dev/verification scripts run directly under Node, in any workspace.
    // The pattern must be `**/scripts/…`; a bare `scripts/…` only matches the repo root.
    files: ["**/scripts/**/*.mjs"],
    languageOptions: {
      globals: {
        console: "readonly",
        process: "readonly",
        fetch: "readonly",
        setTimeout: "readonly",
        clearTimeout: "readonly",
        setInterval: "readonly",
        clearInterval: "readonly",
      },
    },
  },
]);
