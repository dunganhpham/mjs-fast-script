import { writeFileSync, existsSync } from "fs";

// ─── tsconfig.json (base, references other configs) ───
const tsconfigBase = `
{
  "compilerOptions": {
    // ─── Language & Environment ───
    "target": "ES2022",
    "lib": ["ES2022"],
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "moduleDetection": "force",

    // ─── Output ───
    "outDir": "dist",
    "rootDir": "src",
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,

    // ─── Strict Checks ───
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "noPropertyAccessFromIndexSignature": true,
    "noFallthroughCasesInSwitch": true,
    "forceConsistentCasingInFileNames": true,
    "exactOptionalPropertyTypes": false,

    // ─── Interop ───
    "esModuleInterop": true,
    "allowSyntheticDefaultImports": true,
    "isolatedModules": true,
    "verbatimModuleSyntax": true,
    "resolveJsonModule": true,

    // ─── Path Aliases ───
    "baseUrl": ".",
    "paths": {
      "@/*": ["src/*"],
      "@/config/*": ["src/config/*"],
      "@/controllers/*": ["src/controllers/*"],
      "@/middleware/*": ["src/middleware/*"],
      "@/models/*": ["src/models/*"],
      "@/routes/*": ["src/routes/*"],
      "@/services/*": ["src/services/*"],
      "@/utils/*": ["src/utils/*"],
      "@/types/*": ["src/types/*"],
      "@/lib/*": ["src/lib/*"]
    },

    // ─── Emit ───
    "removeComments": false,
    "emitDecoratorMetadata": true,
    "experimentalDecorators": true,
    "incremental": true,
    "tsBuildInfoFile": "./dist/.tsbuildinfo",

    // ─── Skip ───
    "skipLibCheck": true
  },
  "include": ["src/**/*.ts"],
  "exclude": [
    "node_modules",
    "dist",
    "coverage",
    "**/*.test.ts",
    "**/*.spec.ts",
    "**/__tests__/**"
  ]
}
`;

// ─── tsconfig.build.json (production build, stricter) ───
const tsconfigBuild = `
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "sourceMap": false,
    "declarationMap": false,
    "removeComments": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true
  },
  "exclude": [
    "node_modules",
    "dist",
    "coverage",
    "**/*.test.ts",
    "**/*.spec.ts",
    "**/__tests__/**",
    "**/*.stories.ts",
    "**/*.stories.tsx",
    "src/**/*.mock.ts",
    "src/**/*.fixture.ts"
  ]
}
`;

// ─── tsconfig.test.json (test files) ───
const tsconfigTest = `
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "rootDir": ".",
    "outDir": "./dist-test",
    "declaration": false,
    "declarationMap": false,
    "sourceMap": true,
    "noUnusedLocals": false,
    "noUnusedParameters": false,
    "noPropertyAccessFromIndexSignature": false,
    "verbatimModuleSyntax": false,
    "types": ["vitest/globals", "node"]
  },
  "include": [
    "src/**/*.ts",
    "src/**/*.test.ts",
    "src/**/*.spec.ts",
    "src/**/__tests__/**",
    "test/**/*.ts"
  ]
}
`;

// ─── tsconfig.paths.json (for tsx/ts-node path alias registration) ───
const tsconfigPaths = `
{
  "$schema": "https://json.schemastore.org/tsconfig",
  "compilerOptions": {
    "baseUrl": ".",
    "paths": {
      "@/*": ["src/*"],
      "@/config/*": ["src/config/*"],
      "@/controllers/*": ["src/controllers/*"],
      "@/middleware/*": ["src/middleware/*"],
      "@/models/*": ["src/models/*"],
      "@/routes/*": ["src/routes/*"],
      "@/services/*": ["src/services/*"],
      "@/utils/*": ["src/utils/*"],
      "@/types/*": ["src/types/*"],
      "@/lib/*": ["src/lib/*"]
    }
  }
}
`;

// ─── src/types/global.d.ts ───
const globalTypes = `
// ─── Global type declarations ───

declare namespace NodeJS {
  interface ProcessEnv {
    NODE_ENV: 'development' | 'production' | 'test' | 'staging';
    PORT: string;
    DATABASE_URL: string;
    REDIS_URL: string;
    JWT_SECRET: string;
    API_KEY: string;
    CORS_ORIGINS: string;
    LOG_LEVEL: 'debug' | 'info' | 'warn' | 'error';
  }
}

// ─── Utility types ───

/** Make specific keys required */
type RequireKeys<T, K extends keyof T> = Omit<T, K> & Required<Pick<T, K>>;

/** Make specific keys optional */
type OptionalKeys<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;

/** Deep partial */
type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

/** Nullable */
type Nullable<T> = T | null;

/** Maybe (nullable + undefined) */
type Maybe<T> = T | null | undefined;

/** Brand type for nominal typing */
type Brand<T, B> = T & { __brand: B };

/** Common branded types */
type UserId = Brand<string, 'UserId'>;
type Email = Brand<string, 'Email'>;
type UUID = Brand<string, 'UUID'>;
type Timestamp = Brand<number, 'Timestamp'>;

/** API response wrapper */
interface ApiResponse<T = unknown> {
  success: boolean;
  data: T;
  message?: string;
  meta?: {
    page?: number;
    limit?: number;
    total?: number;
    totalPages?: number;
  };
}

/** API error */
interface ApiError {
  success: false;
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
    stack?: string;
  };
}

/** Pagination params */
interface PaginationParams {
  page: number;
  limit: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}
`;

const files = [
  { name: "tsconfig.json", content: tsconfigBase },
  { name: "tsconfig.build.json", content: tsconfigBuild },
  { name: "tsconfig.test.json", content: tsconfigTest },
  { name: "tsconfig.paths.json", content: tsconfigPaths },
];

for (const file of files) {
  if (!existsSync(file.name)) {
    writeFileSync(file.name, file.content.trim());
    console.log(`✅ ${file.name} created`);
  } else {
    console.log(`⚠️ ${file.name} already exists`);
  }
}

// Create src/types directory and global types
if (!existsSync("src/types")) {
  mkdirSync("src/types", { recursive: true });
}
if (!existsSync("src/types/global.d.ts")) {
  writeFileSync("src/types/global.d.ts", globalTypes.trim());
  console.log("✅ src/types/global.d.ts created");
} else {
  console.log("⚠️ src/types/global.d.ts already exists");
}

import { mkdirSync } from "fs";

console.log(`
🚀 TypeScript setup done!

Files:
  tsconfig.json          → Base config (ES2022, NodeNext, strict, path aliases)
  tsconfig.build.json    → Production build (no sourcemaps, strip comments, no unused)
  tsconfig.test.json     → Test files (vitest globals, relaxed rules)
  tsconfig.paths.json    → Path alias registration (for tsx/ts-node)
  src/types/global.d.ts  → Global types (ProcessEnv, utility types, API types)

Path aliases:
  @/*             → src/*
  @/config/*      → src/config/*
  @/controllers/* → src/controllers/*
  @/services/*    → src/services/*
  @/utils/*       → src/utils/*

Install:
  npm i -D typescript @types/node

Build commands:
  "build": "tsc -p tsconfig.build.json",
  "typecheck": "tsc --noEmit",
  "dev": "tsx watch src/index.ts"
`);
