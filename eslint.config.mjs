import js from "@eslint/js";
import ts from "typescript-eslint";
export default ts.config(
  {
    ignores: [
      "**/node_modules/**",
      "**/.next/**",
      "**/.next-test/**",
      "test-results/**",
      "playwright-report/**",
      "apps/mobile/ios/**",
      "apps/mobile/android/**",
      "**/dist/**",
      "**/.expo/**",
      "work/**",
      "outputs/**",
      "**/next-env.d.ts",
      "**/expo-env.d.ts",
    ],
  },
  js.configs.recommended,
  ...ts.configs.recommended,
  {
    files: ["**/*.{ts,tsx}"],
    rules: { "@typescript-eslint/no-explicit-any": "error" },
  },
  {
    files: ["**/*.mjs"],
    languageOptions: {
      globals: { process: "readonly", console: "readonly", URL: "readonly" },
    },
  },
);
