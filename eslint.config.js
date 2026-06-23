import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";

const webGpuGlobals = {
  GPUBufferUsage: "readonly",
  GPUMapMode: "readonly",
  GPUShaderStage: "readonly",
  GPUTextureUsage: "readonly",
};

export default [
  {
    ignores: [
      "dist/**",
      "build/**",
      ".svelte-kit/**",
      "node_modules/**",
      "test-results/**",
      "playwright-report/**",
      ".tmp-chrome-capture-profile/**",
      "*.log",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["src/**/*.ts", "src/lib/server/**/*.js", "scripts/**/*.mjs", "*.config.js"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: {
        ...globals.browser,
        ...globals.node,
        ...webGpuGlobals,
      },
    },
    rules: {
      "no-console": "off",
      "no-unused-vars": "off",
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
    },
  },
  {
    files: ["src/**/*.test.ts"],
    languageOptions: {
      globals: {
        ...globals.vitest,
      },
    },
  },
];
