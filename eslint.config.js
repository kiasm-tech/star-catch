import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";

const io = {
  group: ["node:*", "fs", "fs/*", "path", "os", "child_process", "@octokit/*"],
  message: "The core and the contracts stay free of I/O: put it in an adapter.",
};

export default tseslint.config(
  { ignores: ["**/node_modules/", "**/dist/", "fixtures/", "docs/", "coverage/"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: { globals: globals.node },
    rules: {
      "@typescript-eslint/consistent-type-imports": "error",
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
    },
  },
  {
    files: ["packages/contracts/src/**/*.ts"],
    ignores: ["**/*.test.ts"],
    rules: {
      "no-restricted-imports": ["error", { patterns: [io, { group: ["@star-catch/*"], message: "Contracts depend on nothing in this repo." }] }],
    },
  },
);
