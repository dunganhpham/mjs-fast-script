import { writeFileSync, existsSync } from "fs";
import { resolve } from "path";
if (process.argv[2]) process.chdir(resolve(process.argv[2]));

// ─── ESLint Flat Config (eslint.config.mjs) ───
const eslintConfig = `
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import prettier from "eslint-config-prettier";
import importPlugin from "eslint-plugin-import";
import unicorn from "eslint-plugin-unicorn";
import sonarjs from "eslint-plugin-sonarjs";
import security from "eslint-plugin-security";
import jsdoc from "eslint-plugin-jsdoc";

export default tseslint.config(
  // ─── Global ignores ───
  {
    ignores: [
      "dist/**",
      "build/**",
      "coverage/**",
      "node_modules/**",
      "*.config.{js,cjs,mjs}",
      "**/*.d.ts",
    ],
  },

  // ─── Base configs ───
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,

  // ─── TypeScript parser options ───
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },

  // ─── Import plugin ───
  {
    plugins: { import: importPlugin },
    rules: {
      "import/order": [
        "error",
        {
          groups: [
            "builtin",
            "external",
            "internal",
            ["parent", "sibling"],
            "index",
            "type",
          ],
          "newlines-between": "always",
          alphabetize: { order: "asc", caseInsensitive: true },
        },
      ],
      "import/no-duplicates": "error",
      "import/no-unresolved": "off", // TS handles this
      "import/first": "error",
      "import/newline-after-import": "error",
      "import/no-mutable-exports": "error",
    },
  },

  // ─── Unicorn plugin ───
  {
    plugins: { unicorn },
    rules: {
      "unicorn/prefer-node-protocol": "error",
      "unicorn/prefer-module": "error",
      "unicorn/prefer-top-level-await": "error",
      "unicorn/no-array-reduce": "warn",
      "unicorn/no-null": "off",
      "unicorn/prevent-abbreviations": "off",
      "unicorn/filename-case": [
        "error",
        { cases: { camelCase: true, pascalCase: true, kebabCase: true } },
      ],
    },
  },

  // ─── SonarJS (code quality) ───
  {
    plugins: { sonarjs },
    rules: {
      "sonarjs/cognitive-complexity": ["warn", 15],
      "sonarjs/no-duplicate-string": ["warn", { threshold: 3 }],
      "sonarjs/no-identical-functions": "warn",
      "sonarjs/no-collapsible-if": "warn",
      "sonarjs/prefer-single-boolean-return": "warn",
    },
  },

  // ─── Security plugin ───
  {
    plugins: { security },
    rules: {
      "security/detect-object-injection": "off",
      "security/detect-non-literal-regexp": "warn",
      "security/detect-unsafe-regex": "error",
      "security/detect-buffer-noassert": "error",
      "security/detect-eval-with-expression": "error",
      "security/detect-no-csrf-before-method-override": "error",
      "security/detect-possible-timing-attacks": "warn",
    },
  },

  // ─── JSDoc ───
  {
    plugins: { jsdoc },
    rules: {
      "jsdoc/require-jsdoc": "off",
      "jsdoc/check-alignment": "warn",
      "jsdoc/check-param-names": "warn",
      "jsdoc/check-tag-names": "warn",
    },
  },

  // ─── Custom rules ───
  {
    rules: {
      // TypeScript
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/consistent-type-imports": [
        "error",
        { prefer: "type-imports" },
      ],
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/no-misused-promises": "error",
      "@typescript-eslint/await-thenable": "error",
      "@typescript-eslint/require-await": "warn",
      "@typescript-eslint/no-unnecessary-condition": "warn",
      "@typescript-eslint/strict-boolean-expressions": "off",
      "@typescript-eslint/no-unsafe-assignment": "warn",
      "@typescript-eslint/no-unsafe-member-access": "warn",
      "@typescript-eslint/no-unsafe-call": "warn",

      // General
      "no-console": ["warn", { allow: ["warn", "error", "info"] }],
      "no-debugger": "error",
      "no-alert": "error",
      "no-var": "error",
      "prefer-const": "error",
      "prefer-template": "error",
      "object-shorthand": "error",
      "no-nested-ternary": "warn",
      eqeqeq: ["error", "always"],
      curly: ["error", "multi-line"],
      "no-throw-literal": "error",
      "prefer-promise-reject-errors": "error",
      "no-return-await": "off",
      "@typescript-eslint/return-await": ["error", "in-try-catch"],
    },
  },

  // ─── Test files (relaxed rules) ───
  {
    files: ["**/*.test.ts", "**/*.spec.ts", "**/__tests__/**"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unsafe-assignment": "off",
      "@typescript-eslint/no-unsafe-member-access": "off",
      "@typescript-eslint/no-unsafe-call": "off",
      "@typescript-eslint/no-floating-promises": "off",
      "no-console": "off",
      "sonarjs/no-duplicate-string": "off",
      "security/detect-non-literal-regexp": "off",
    },
  },

  // ─── Prettier must be last ───
  prettier,
);
`;

// ─── Prettier config ───
const prettierConfig = `
{
  "semi": true,
  "singleQuote": true,
  "trailingComma": "all",
  "printWidth": 100,
  "tabWidth": 2,
  "useTabs": false,
  "bracketSpacing": true,
  "arrowParens": "always",
  "endOfLine": "lf",
  "quoteProps": "as-needed",
  "jsxSingleQuote": false,
  "bracketSameLine": false,
  "proseWrap": "preserve",
  "htmlWhitespaceSensitivity": "css",
  "embeddedLanguageFormatting": "auto",
  "singleAttributePerLine": false,
  "overrides": [
    {
      "files": ["*.json", "*.jsonc"],
      "options": { "printWidth": 80, "tabWidth": 2 }
    },
    {
      "files": ["*.yml", "*.yaml"],
      "options": { "singleQuote": false, "tabWidth": 2 }
    },
    {
      "files": ["*.md"],
      "options": { "proseWrap": "always", "printWidth": 80 }
    }
  ]
}
`;

// ─── .prettierignore ───
const prettierIgnore = `
dist
build
coverage
node_modules
.next
.nuxt
*.min.js
*.min.css
package-lock.json
yarn.lock
pnpm-lock.yaml
`;

// ─── .editorconfig ───
const editorconfig = `
root = true

[*]
charset = utf-8
end_of_line = lf
indent_style = space
indent_size = 2
insert_final_newline = true
trim_trailing_whitespace = true
max_line_length = 100

[*.md]
trim_trailing_whitespace = false
max_line_length = 80

[*.{yml,yaml}]
indent_size = 2

[*.{json,jsonc}]
indent_size = 2

[Makefile]
indent_style = tab

[*.go]
indent_style = tab
indent_size = 4

[*.py]
indent_size = 4

[*.{sh,bash}]
indent_size = 2
shell_variant = bash

[Dockerfile*]
indent_size = 2

[*.tf]
indent_size = 2
`;

const files = [
  { name: "eslint.config.mjs", content: eslintConfig },
  { name: ".prettierrc", content: prettierConfig },
  { name: ".prettierignore", content: prettierIgnore },
  { name: ".editorconfig", content: editorconfig },
];

for (const file of files) {
  if (!existsSync(file.name)) {
    writeFileSync(file.name, file.content.trim());
    console.log(`✅ ${file.name} created`);
  } else {
    console.log(`⚠️ ${file.name} already exists`);
  }
}

console.log(`
🚀 ESLint + Prettier setup done!

Files:
  eslint.config.mjs   → Flat config (TS, import order, unicorn, sonarjs, security, jsdoc)
  .prettierrc          → Prettier config (single quotes, trailing commas, 100 width)
  .prettierignore      → Prettier ignore patterns
  .editorconfig        → Editor settings (UTF-8, LF, 2 spaces)

Install:
  npm i -D eslint typescript-eslint @eslint/js \\
    eslint-config-prettier eslint-plugin-import \\
    eslint-plugin-unicorn eslint-plugin-sonarjs \\
    eslint-plugin-security eslint-plugin-jsdoc \\
    prettier

Scripts (add to package.json):
  "lint": "eslint src/",
  "lint:fix": "eslint src/ --fix",
  "format": "prettier --write 'src/**/*.{ts,tsx,js,jsx,json,css,md}'",
  "format:check": "prettier --check 'src/**/*.{ts,tsx,js,jsx,json,css,md}'"
`);
