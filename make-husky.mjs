import { writeFileSync, existsSync, mkdirSync } from "fs";

// ─── Husky pre-commit hook ───
const preCommit = `
#!/usr/bin/env sh
. "$(dirname -- "$0")/_/husky.sh"

npx lint-staged
`;

// ─── Husky commit-msg hook ───
const commitMsg = `
#!/usr/bin/env sh
. "$(dirname -- "$0")/_/husky.sh"

npx --no -- commitlint --edit "$1"
`;

// ─── Husky pre-push hook ───
const prePush = `
#!/usr/bin/env sh
. "$(dirname -- "$0")/_/husky.sh"

echo "🔍 Running type check before push..."
npx tsc --noEmit

echo "🧪 Running tests before push..."
npm test -- --passWithNoTests
`;

// ─── lint-staged config ───
const lintStagedConfig = `
{
  "*.{ts,tsx}": [
    "eslint --fix --max-warnings=0",
    "prettier --write"
  ],
  "*.{js,jsx,mjs,cjs}": [
    "eslint --fix --max-warnings=0",
    "prettier --write"
  ],
  "*.{json,jsonc}": [
    "prettier --write"
  ],
  "*.{css,scss,less}": [
    "prettier --write"
  ],
  "*.{yml,yaml}": [
    "prettier --write"
  ],
  "*.md": [
    "prettier --write"
  ],
  "*.{graphql,gql}": [
    "prettier --write"
  ],
  "*.sql": [
    "prettier --write"
  ],
  "Dockerfile*": [
    "hadolint --ignore DL3018 --ignore DL3008"
  ]
}
`;

// ─── commitlint config ───
const commitlintConfig = `
// @ts-check

/** @type {import('@commitlint/types').UserConfig} */
export default {
  extends: ['@commitlint/config-conventional'],

  rules: {
    // ─── Type ───
    'type-enum': [
      2,
      'always',
      [
        'feat',     // New feature
        'fix',      // Bug fix
        'docs',     // Documentation
        'style',    // Formatting, missing semicolons, etc
        'refactor', // Code restructuring without behavior change
        'perf',     // Performance improvement
        'test',     // Adding/updating tests
        'build',    // Build system or external dependencies
        'ci',       // CI/CD configuration
        'chore',    // Maintenance tasks
        'revert',   // Revert previous commit
        'wip',      // Work in progress (should not appear in main)
      ],
    ],
    'type-case': [2, 'always', 'lower-case'],
    'type-empty': [2, 'never'],

    // ─── Scope ───
    'scope-case': [2, 'always', 'lower-case'],
    'scope-enum': [
      1,
      'always',
      [
        'api',
        'auth',
        'config',
        'core',
        'db',
        'deps',
        'docker',
        'docs',
        'infra',
        'test',
        'ui',
      ],
    ],

    // ─── Subject ───
    'subject-case': [2, 'never', ['sentence-case', 'start-case', 'pascal-case', 'upper-case']],
    'subject-empty': [2, 'never'],
    'subject-full-stop': [2, 'never', '.'],
    'subject-max-length': [2, 'always', 72],

    // ─── Header ───
    'header-max-length': [2, 'always', 100],

    // ─── Body ───
    'body-leading-blank': [2, 'always'],
    'body-max-line-length': [2, 'always', 100],

    // ─── Footer ───
    'footer-leading-blank': [2, 'always'],
    'footer-max-line-length': [2, 'always', 100],
  },

  prompt: {
    questions: {
      type: {
        description: 'Select the type of change',
        enum: {
          feat:     { description: 'A new feature',                          title: 'Features' },
          fix:      { description: 'A bug fix',                              title: 'Bug Fixes' },
          docs:     { description: 'Documentation only changes',             title: 'Documentation' },
          style:    { description: 'Code style changes (formatting, etc)',   title: 'Styles' },
          refactor: { description: 'Code change that neither fixes nor adds', title: 'Refactors' },
          perf:     { description: 'Performance improvement',                title: 'Performance' },
          test:     { description: 'Adding or updating tests',               title: 'Tests' },
          build:    { description: 'Build system or dependencies',           title: 'Builds' },
          ci:       { description: 'CI/CD configuration',                    title: 'CI' },
          chore:    { description: 'Other changes (maintenance)',            title: 'Chores' },
          revert:   { description: 'Reverts a previous commit',              title: 'Reverts' },
        },
      },
    },
  },
};
`;

// ─── .czrc (Commitizen config) ───
const commitizenConfig = `
{
  "path": "cz-conventional-changelog"
}
`;

// ─── .versionrc (standard-version / release-please config) ───
const versionConfig = `
{
  "types": [
    { "type": "feat",     "section": "Features" },
    { "type": "fix",      "section": "Bug Fixes" },
    { "type": "perf",     "section": "Performance" },
    { "type": "refactor", "section": "Refactoring" },
    { "type": "docs",     "section": "Documentation" },
    { "type": "test",     "section": "Tests",         "hidden": true },
    { "type": "build",    "section": "Build",          "hidden": true },
    { "type": "ci",       "section": "CI",             "hidden": true },
    { "type": "chore",    "section": "Chores",         "hidden": true },
    { "type": "style",    "hidden": true },
    { "type": "revert",   "section": "Reverts" }
  ],
  "commitUrlFormat": "https://github.com/your-org/your-app/commit/{{hash}}",
  "compareUrlFormat": "https://github.com/your-org/your-app/compare/{{previousTag}}...{{currentTag}}",
  "issueUrlFormat": "https://github.com/your-org/your-app/issues/{{id}}",
  "releaseCommitMessageFormat": "chore(release): v{{currentTag}}"
}
`;

// ─── Write files ───
const dir = ".husky";

if (!existsSync(dir)) {
  mkdirSync(dir, { recursive: true });
  console.log("📁 Created .husky/");
}

const files = [
  { name: `${dir}/pre-commit`, content: preCommit },
  { name: `${dir}/commit-msg`, content: commitMsg },
  { name: `${dir}/pre-push`, content: prePush },
  { name: ".lintstagedrc", content: lintStagedConfig },
  { name: "commitlint.config.mjs", content: commitlintConfig },
  { name: ".czrc", content: commitizenConfig },
  { name: ".versionrc", content: versionConfig },
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
🚀 Husky + lint-staged + commitlint setup done!

Files:
  .husky/pre-commit        → Run lint-staged
  .husky/commit-msg        → Validate commit message (conventional commits)
  .husky/pre-push          → Type check + tests before push
  .lintstagedrc            → Lint-staged rules (TS, JS, CSS, JSON, YAML, MD, SQL, Dockerfile)
  commitlint.config.mjs    → Commitlint rules (type, scope, subject limits)
  .czrc                    → Commitizen config
  .versionrc               → Changelog generation config

Install:
  npm i -D husky lint-staged \\
    @commitlint/cli @commitlint/config-conventional \\
    commitizen cz-conventional-changelog

Setup:
  npx husky install
  npm pkg set scripts.prepare="husky install"
  npm pkg set scripts.commit="cz"

Commit format:
  feat(api): add user authentication
  fix(db): resolve connection pool leak
  docs: update API documentation
  chore(deps): bump eslint to v9
`);
