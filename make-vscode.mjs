import { writeFileSync, existsSync, mkdirSync } from "fs";

// ─── .vscode/settings.json ───
const settings = `
{
  // ─── Editor ───
  "editor.defaultFormatter": "esbenp.prettier-vscode",
  "editor.formatOnSave": true,
  "editor.formatOnPaste": false,
  "editor.codeActionsOnSave": {
    "source.fixAll.eslint": "explicit",
    "source.organizeImports": "never",
    "source.removeUnusedImports": "explicit"
  },
  "editor.rulers": [100],
  "editor.tabSize": 2,
  "editor.insertSpaces": true,
  "editor.bracketPairColorization.enabled": true,
  "editor.guides.bracketPairs": "active",
  "editor.linkedEditing": true,
  "editor.suggestSelection": "first",
  "editor.inlineSuggest.enabled": true,
  "editor.quickSuggestions": {
    "strings": "on"
  },

  // ─── Files ───
  "files.eol": "\\n",
  "files.trimTrailingWhitespace": true,
  "files.insertFinalNewline": true,
  "files.trimFinalNewlines": true,
  "files.exclude": {
    "**/.git": true,
    "**/node_modules": true,
    "**/dist": true,
    "**/coverage": true,
    "**/.DS_Store": true,
    "**/*.js.map": true
  },
  "files.watcherExclude": {
    "**/node_modules/**": true,
    "**/dist/**": true,
    "**/coverage/**": true,
    "**/.git/objects/**": true
  },

  // ─── Search ───
  "search.exclude": {
    "**/node_modules": true,
    "**/dist": true,
    "**/coverage": true,
    "**/*.lock": true,
    "**/package-lock.json": true
  },

  // ─── TypeScript ───
  "typescript.tsdk": "node_modules/typescript/lib",
  "typescript.enablePromptUseWorkspaceTsdk": true,
  "typescript.preferences.importModuleSpecifier": "non-relative",
  "typescript.preferences.preferTypeOnlyAutoImports": true,
  "typescript.suggest.autoImports": true,
  "typescript.updateImportsOnFileMove.enabled": "always",
  "typescript.inlayHints.parameterNames.enabled": "literals",
  "typescript.inlayHints.functionLikeReturnTypes.enabled": true,

  // ─── ESLint ───
  "eslint.validate": [
    "javascript",
    "javascriptreact",
    "typescript",
    "typescriptreact"
  ],
  "eslint.useFlatConfig": true,

  // ─── Prettier ───
  "[typescript]": {
    "editor.defaultFormatter": "esbenp.prettier-vscode"
  },
  "[typescriptreact]": {
    "editor.defaultFormatter": "esbenp.prettier-vscode"
  },
  "[javascript]": {
    "editor.defaultFormatter": "esbenp.prettier-vscode"
  },
  "[json]": {
    "editor.defaultFormatter": "esbenp.prettier-vscode"
  },
  "[jsonc]": {
    "editor.defaultFormatter": "esbenp.prettier-vscode"
  },
  "[yaml]": {
    "editor.defaultFormatter": "esbenp.prettier-vscode"
  },
  "[markdown]": {
    "editor.defaultFormatter": "esbenp.prettier-vscode",
    "editor.wordWrap": "on"
  },
  "[dockerfile]": {
    "editor.defaultFormatter": "ms-azuretools.vscode-docker"
  },

  // ─── Git ───
  "git.autofetch": true,
  "git.confirmSync": false,
  "git.enableSmartCommit": true,

  // ─── Terminal ───
  "terminal.integrated.defaultProfile.linux": "bash",
  "terminal.integrated.env.linux": {
    "NODE_ENV": "development"
  },

  // ─── Docker ───
  "docker.defaultRegistryPath": "ghcr.io/your-org",

  // ─── Testing ───
  "testing.automaticallyOpenPeekView": "failureAnywhere",

  // ─── Misc ───
  "explorer.confirmDelete": false,
  "explorer.confirmDragAndDrop": false,
  "debug.javascript.autoAttachFilter": "smart"
}
`;

// ─── .vscode/extensions.json ───
const extensions = `
{
  "recommendations": [
    // ─── Essential ───
    "esbenp.prettier-vscode",
    "dbaeumer.vscode-eslint",
    "ms-vscode.vscode-typescript-next",

    // ─── Git ───
    "eamodio.gitlens",
    "mhutchie.git-graph",

    // ─── Docker & K8s ───
    "ms-azuretools.vscode-docker",
    "ms-kubernetes-tools.vscode-kubernetes-tools",

    // ─── Testing ───
    "vitest.explorer",

    // ─── Productivity ───
    "christian-kohler.path-intellisense",
    "christian-kohler.npm-intellisense",
    "mikestead.dotenv",
    "usernamehw.errorlens",
    "streetsidesoftware.code-spell-checker",
    "gruntfuggly.todo-tree",
    "aaron-bond.better-comments",
    "formulahendry.auto-rename-tag",

    // ─── Database ───
    "cweijan.vscode-database-client2",

    // ─── API ───
    "humao.rest-client",
    "42Crunch.vscode-openapi",

    // ─── Misc ───
    "editorconfig.editorconfig",
    "redhat.vscode-yaml",
    "tamasfe.even-better-toml",
    "HashiCorp.terraform",
    "ms-vscode-remote.remote-containers",
    "GitHub.copilot"
  ],
  "unwantedRecommendations": []
}
`;

// ─── .vscode/launch.json ───
const launchConfig = `
{
  "version": "0.2.0",
  "configurations": [
    {
      "name": "Debug: App",
      "type": "node",
      "request": "launch",
      "runtimeExecutable": "npx",
      "runtimeArgs": ["tsx", "src/index.ts"],
      "restart": true,
      "console": "integratedTerminal",
      "internalConsoleOptions": "neverOpen",
      "env": {
        "NODE_ENV": "development",
        "LOG_LEVEL": "debug"
      },
      "skipFiles": ["<node_internals>/**", "node_modules/**"]
    },
    {
      "name": "Debug: Current File",
      "type": "node",
      "request": "launch",
      "runtimeExecutable": "npx",
      "runtimeArgs": ["tsx", "\${file}"],
      "console": "integratedTerminal",
      "skipFiles": ["<node_internals>/**", "node_modules/**"]
    },
    {
      "name": "Debug: Tests",
      "type": "node",
      "request": "launch",
      "runtimeExecutable": "npx",
      "runtimeArgs": ["vitest", "run", "--reporter=verbose"],
      "console": "integratedTerminal",
      "skipFiles": ["<node_internals>/**", "node_modules/**"]
    },
    {
      "name": "Debug: Current Test File",
      "type": "node",
      "request": "launch",
      "runtimeExecutable": "npx",
      "runtimeArgs": ["vitest", "run", "\${relativeFile}", "--reporter=verbose"],
      "console": "integratedTerminal",
      "skipFiles": ["<node_internals>/**", "node_modules/**"]
    },
    {
      "name": "Attach: Docker",
      "type": "node",
      "request": "attach",
      "port": 9229,
      "address": "localhost",
      "localRoot": "\${workspaceFolder}",
      "remoteRoot": "/app",
      "restart": true,
      "skipFiles": ["<node_internals>/**", "node_modules/**"]
    }
  ],
  "compounds": [
    {
      "name": "Full Stack",
      "configurations": ["Debug: App"]
    }
  ]
}
`;

// ─── .vscode/tasks.json ───
const tasksConfig = `
{
  "version": "2.0.0",
  "tasks": [
    {
      "label": "Build",
      "type": "npm",
      "script": "build",
      "group": { "kind": "build", "isDefault": true },
      "problemMatcher": ["$tsc"],
      "presentation": { "reveal": "silent", "panel": "shared" }
    },
    {
      "label": "Dev Server",
      "type": "npm",
      "script": "dev",
      "isBackground": true,
      "group": "build",
      "problemMatcher": [],
      "presentation": { "reveal": "always", "panel": "dedicated" }
    },
    {
      "label": "Test",
      "type": "npm",
      "script": "test",
      "group": { "kind": "test", "isDefault": true },
      "problemMatcher": [],
      "presentation": { "reveal": "always", "panel": "shared" }
    },
    {
      "label": "Test: Watch",
      "type": "npm",
      "script": "test:watch",
      "isBackground": true,
      "group": "test",
      "problemMatcher": [],
      "presentation": { "reveal": "always", "panel": "dedicated" }
    },
    {
      "label": "Lint",
      "type": "npm",
      "script": "lint",
      "group": "build",
      "problemMatcher": ["$eslint-stylish"],
      "presentation": { "reveal": "silent", "panel": "shared" }
    },
    {
      "label": "Lint Fix",
      "type": "npm",
      "script": "lint:fix",
      "group": "build",
      "problemMatcher": ["$eslint-stylish"],
      "presentation": { "reveal": "silent", "panel": "shared" }
    },
    {
      "label": "Type Check",
      "type": "npm",
      "script": "typecheck",
      "group": "build",
      "problemMatcher": ["$tsc"],
      "presentation": { "reveal": "silent", "panel": "shared" }
    },
    {
      "label": "Docker: Up",
      "type": "shell",
      "command": "docker compose up -d",
      "group": "build",
      "presentation": { "reveal": "always", "panel": "shared" }
    },
    {
      "label": "Docker: Down",
      "type": "shell",
      "command": "docker compose down",
      "group": "build",
      "presentation": { "reveal": "always", "panel": "shared" }
    },
    {
      "label": "Docker: Logs",
      "type": "shell",
      "command": "docker compose logs -f app",
      "isBackground": true,
      "group": "build",
      "presentation": { "reveal": "always", "panel": "dedicated" }
    },
    {
      "label": "DB: Migrate",
      "type": "shell",
      "command": "npx prisma migrate dev",
      "group": "build",
      "presentation": { "reveal": "always", "panel": "shared" }
    },
    {
      "label": "DB: Studio",
      "type": "shell",
      "command": "npx prisma studio",
      "isBackground": true,
      "group": "build",
      "presentation": { "reveal": "always", "panel": "dedicated" }
    }
  ]
}
`;

// ─── .vscode/app.code-snippets ───
const snippets = `
{
  // ─── TypeScript ───
  "Async Function": {
    "prefix": "afn",
    "body": [
      "async function \${1:name}(\${2:params}): Promise<\${3:void}> {",
      "  \$0",
      "}"
    ],
    "description": "Async function"
  },
  "Arrow Async Function": {
    "prefix": "aafn",
    "body": [
      "const \${1:name} = async (\${2:params}): Promise<\${3:void}> => {",
      "  \$0",
      "};"
    ],
    "description": "Async arrow function"
  },
  "Try-Catch": {
    "prefix": "tc",
    "body": [
      "try {",
      "  \$0",
      "} catch (error) {",
      "  if (error instanceof Error) {",
      "    console.error(error.message);",
      "  }",
      "  throw error;",
      "}"
    ],
    "description": "Try-catch block"
  },
  "Interface": {
    "prefix": "intf",
    "body": [
      "interface \${1:Name} {",
      "  \${2:key}: \${3:type};",
      "  \$0",
      "}"
    ],
    "description": "TypeScript interface"
  },
  "Type": {
    "prefix": "typ",
    "body": [
      "type \${1:Name} = {",
      "  \${2:key}: \${3:type};",
      "  \$0",
      "};"
    ],
    "description": "TypeScript type"
  },
  "Enum": {
    "prefix": "enm",
    "body": [
      "enum \${1:Name} {",
      "  \${2:Key} = '\${3:value}',",
      "  \$0",
      "}"
    ],
    "description": "TypeScript enum"
  },

  // ─── Testing ───
  "Describe Block": {
    "prefix": "desc",
    "body": [
      "describe('\${1:subject}', () => {",
      "  \$0",
      "});"
    ],
    "description": "Test describe block"
  },
  "It Block": {
    "prefix": "it",
    "body": [
      "it('should \${1:description}', async () => {",
      "  \$0",
      "});"
    ],
    "description": "Test it block"
  },
  "Before Each": {
    "prefix": "be",
    "body": [
      "beforeEach(() => {",
      "  \$0",
      "});"
    ],
    "description": "Before each hook"
  },
  "Test Suite": {
    "prefix": "tsuite",
    "body": [
      "import { describe, it, expect, vi, beforeEach } from 'vitest';",
      "",
      "describe('\${1:Module}', () => {",
      "  beforeEach(() => {",
      "    vi.clearAllMocks();",
      "  });",
      "",
      "  it('should \${2:description}', async () => {",
      "    \$0",
      "  });",
      "});"
    ],
    "description": "Full test suite template"
  },

  // ─── Express / Fastify ───
  "Route Handler": {
    "prefix": "rh",
    "body": [
      "export async function \${1:handler}(req: Request, res: Response): Promise<void> {",
      "  try {",
      "    \$0",
      "    res.json({ success: true, data: null });",
      "  } catch (error) {",
      "    res.status(500).json({ success: false, error: { message: 'Internal server error' } });",
      "  }",
      "}"
    ],
    "description": "Route handler"
  },
  "Middleware": {
    "prefix": "mw",
    "body": [
      "import type { Request, Response, NextFunction } from 'express';",
      "",
      "export function \${1:middleware}(req: Request, res: Response, next: NextFunction): void {",
      "  try {",
      "    \$0",
      "    next();",
      "  } catch (error) {",
      "    next(error);",
      "  }",
      "}"
    ],
    "description": "Express middleware"
  },

  // ─── Logging ───
  "Console Log Object": {
    "prefix": "clo",
    "body": "console.log('\${1:label}:', JSON.stringify(\${2:obj}, null, 2));",
    "description": "Console log object"
  },
  "Console Error": {
    "prefix": "cerr",
    "body": "console.error('[ERROR] \${1:context}:', \${2:error});",
    "description": "Console error"
  }
}
`;

// ─── Write files ───
const dir = ".vscode";
if (!existsSync(dir)) {
  mkdirSync(dir, { recursive: true });
  console.log("📁 Created .vscode/");
}

const files = [
  { name: `${dir}/settings.json`, content: settings },
  { name: `${dir}/extensions.json`, content: extensions },
  { name: `${dir}/launch.json`, content: launchConfig },
  { name: `${dir}/tasks.json`, content: tasksConfig },
  { name: `${dir}/app.code-snippets`, content: snippets },
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
🚀 VSCode setup done!

Files:
  .vscode/settings.json      → Editor, ESLint, Prettier, TypeScript, Git settings
  .vscode/extensions.json     → Recommended extensions (20+)
  .vscode/launch.json         → Debug configs (app, current file, tests, Docker attach)
  .vscode/tasks.json          → Tasks (build, dev, test, lint, docker, DB)
  .vscode/app.code-snippets   → Code snippets (TS, testing, Express, logging)
`);
