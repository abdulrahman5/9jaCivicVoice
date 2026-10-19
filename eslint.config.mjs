// Root ESLint config shared by every workspace package.
// The import-boundary rules here are a security control (see the architecture
// doc, "Codebase structure"): police code must never touch the civic database,
// and only the admin area may touch the police vault.
import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";

const civicDbImports = {
  group: ["@civicvoice/db", "@civicvoice/db/*"],
  message: "Police intake must never import the civic database client.",
};

const vaultDbImports = {
  group: ["@civicvoice/vault-db", "@civicvoice/vault-db/*"],
  message: "Only the admin area (app/(admin), modules/vault) may import the police vault client.",
};

export default tseslint.config(
  {
    ignores: [
      "**/node_modules/**",
      "**/.next/**",
      "**/dist/**",
      "**/.wrangler/**",
      "**/next-env.d.ts",
      "**/database.types.ts",
      "db/**/functions/**",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      globals: { ...globals.node, ...globals.browser },
    },
    rules: {
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
      "@typescript-eslint/consistent-type-imports": "error",
    },
  },
  {
    // Everything in the web app except the admin area and the vault module.
    files: ["apps/web/**/*.{ts,tsx}"],
    ignores: ["apps/web/app/(admin)/**", "apps/web/modules/vault/**"],
    rules: {
      "no-restricted-imports": ["error", { patterns: [vaultDbImports] }],
    },
  },
  {
    files: ["apps/police-intake/**/*.ts"],
    rules: {
      "no-restricted-imports": ["error", { patterns: [civicDbImports, vaultDbImports] }],
    },
  },
);
