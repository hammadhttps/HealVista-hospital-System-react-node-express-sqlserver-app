import { defineConfig, globalIgnores } from "eslint/config";
import js from "@eslint/js";

export default defineConfig([
  globalIgnores(["back_end/", "front_end/", "**/dist/", "**/node_modules/"]),
  js.configs.recommended,
]);
