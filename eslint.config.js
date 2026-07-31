import { defineConfig, globalIgnores } from "eslint/config";
import js from "@eslint/js";

export default defineConfig([
  globalIgnores(["**/dist/", "**/node_modules/", "**/generated/"]),
  js.configs.recommended,
]);
