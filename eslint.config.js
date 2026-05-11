import js from "@eslint/js";
import globals from "globals";

const webGpuGlobals = {
  GPUBufferUsage: "readonly",
  GPUMapMode: "readonly",
  GPUShaderStage: "readonly",
  GPUTextureUsage: "readonly",
};

export default [
  {
    ignores: ["dist/**", "node_modules/**", ".tmp-chrome-capture-profile/**", "*.log"],
  },
  js.configs.recommended,
  {
    files: ["src/**/*.js", "server.mjs", "scripts/**/*.mjs", "*.config.js"],
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
      "no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
    },
  },
  {
    files: ["src/**/*.test.js"],
    languageOptions: {
      globals: {
        ...globals.vitest,
      },
    },
  },
];
