import { writeFileSync, existsSync, mkdirSync } from "fs";

// ─── vitest.config.ts ───
const vitestConfig = `
import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [tsconfigPaths()],

  test: {
    // ─── Environment ───
    globals: true,
    environment: 'node',

    // ─── Files ───
    include: ['src/**/*.{test,spec}.{ts,tsx}', 'test/**/*.{test,spec}.{ts,tsx}'],
    exclude: ['node_modules', 'dist', 'e2e/**'],

    // ─── Setup ───
    setupFiles: ['./test/setup.ts'],
    globalSetup: ['./test/global-setup.ts'],

    // ─── Coverage ───
    coverage: {
      provider: 'v8',
      reporter: ['text', 'text-summary', 'lcov', 'html', 'cobertura', 'json-summary'],
      reportsDirectory: './coverage',
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/*.test.ts',
        'src/**/*.spec.ts',
        'src/**/*.d.ts',
        'src/**/index.ts',
        'src/types/**',
        'src/**/*.mock.ts',
        'src/**/*.fixture.ts',
      ],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 75,
        statements: 80,
      },
    },

    // ─── Reporting ───
    reporters: ['default', 'junit'],
    outputFile: {
      junit: './junit.xml',
    },

    // ─── Performance ───
    pool: 'forks',
    poolOptions: {
      forks: { singleFork: false },
    },
    testTimeout: 10000,
    hookTimeout: 30000,

    // ─── Mocking ───
    mockReset: true,
    clearMocks: true,
    restoreMocks: true,

    // ─── Snapshot ───
    snapshotFormat: {
      escapeString: true,
      printBasicPrototype: true,
    },
  },
});
`;

// ─── test/setup.ts ───
const testSetup = `
import { beforeAll, afterAll, afterEach } from 'vitest';

// ─── Global test setup ───

beforeAll(async () => {
  // Set test environment variables
  process.env.NODE_ENV = 'test';
  process.env.LOG_LEVEL = 'error';

  // Add any global setup here:
  // - Database connection
  // - Redis connection
  // - Mock server
});

afterEach(() => {
  // Clean up after each test
  // vi.clearAllMocks() is handled by vitest config
});

afterAll(async () => {
  // Clean up global resources
  // - Close database connections
  // - Close Redis connections
  // - Stop mock server
});

// ─── Custom matchers ───
// expect.extend({
//   toBeWithinRange(received: number, floor: number, ceiling: number) {
//     const pass = received >= floor && received <= ceiling;
//     return {
//       pass,
//       message: () => \`expected \${received} to be within range \${floor} - \${ceiling}\`,
//     };
//   },
// });
`;

// ─── test/global-setup.ts ───
const globalSetup = `
// Runs once before all test suites
export async function setup() {
  console.log('\\n🧪 Global test setup...');

  // Start test containers, seed database, etc.
  // Example with testcontainers:
  // const postgres = await new PostgreSqlContainer().start();
  // process.env.DATABASE_URL = postgres.getConnectionUri();
}

// Runs once after all test suites
export async function teardown() {
  console.log('🧹 Global test teardown...');

  // Stop containers, clean up, etc.
}
`;

// ─── test/helpers/factory.ts ───
const factory = `
import { randomUUID } from 'node:crypto';

/**
 * Test data factory for creating test fixtures.
 *
 * Usage:
 *   const user = Factory.user();
 *   const user = Factory.user({ email: 'custom@test.com' });
 */
export const Factory = {
  user(overrides: Record<string, unknown> = {}) {
    return {
      id: randomUUID(),
      email: \`test-\${Date.now()}@example.com\`,
      name: 'Test User',
      password: 'hashed_password_123',
      role: 'user',
      createdAt: new Date(),
      updatedAt: new Date(),
      ...overrides,
    };
  },

  post(overrides: Record<string, unknown> = {}) {
    return {
      id: randomUUID(),
      title: 'Test Post',
      content: 'This is a test post content.',
      authorId: randomUUID(),
      published: false,
      createdAt: new Date(),
      updatedAt: new Date(),
      ...overrides,
    };
  },

  paginatedResponse<T>(data: T[], total: number, page = 1, limit = 10) {
    return {
      success: true,
      data,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  },

  apiError(code = 'INTERNAL_ERROR', message = 'Something went wrong') {
    return {
      success: false,
      error: { code, message },
    };
  },
};
`;

// ─── test/helpers/mock-request.ts ───
const mockRequest = `
/**
 * Helper to create mock HTTP request/response for testing controllers.
 *
 * Usage:
 *   const { req, res } = createMockContext({ body: { email: 'test@test.com' } });
 *   await myController(req, res);
 *   expect(res.statusCode).toBe(200);
 */

interface MockRequestOptions {
  method?: string;
  url?: string;
  body?: Record<string, unknown>;
  query?: Record<string, string>;
  params?: Record<string, string>;
  headers?: Record<string, string>;
  user?: Record<string, unknown>;
}

export function createMockRequest(options: MockRequestOptions = {}) {
  return {
    method: options.method ?? 'GET',
    url: options.url ?? '/',
    body: options.body ?? {},
    query: options.query ?? {},
    params: options.params ?? {},
    headers: {
      'content-type': 'application/json',
      ...options.headers,
    },
    user: options.user,
    get: (name: string) => (options.headers ?? {})[name.toLowerCase()],
  };
}

export function createMockResponse() {
  const res: Record<string, unknown> = {
    statusCode: 200,
    headers: {} as Record<string, string>,
    body: undefined as unknown,
  };

  res.status = (code: number) => { res.statusCode = code; return res; };
  res.json = (data: unknown) => { res.body = data; return res; };
  res.send = (data: unknown) => { res.body = data; return res; };
  res.set = (name: string, value: string) => { (res.headers as Record<string, string>)[name] = value; return res; };
  res.header = res.set;
  res.end = () => res;

  return res;
}

export function createMockContext(options: MockRequestOptions = {}) {
  return {
    req: createMockRequest(options),
    res: createMockResponse(),
  };
}
`;

// ─── test/helpers/db.ts ───
const dbHelper = `
/**
 * Database test helpers.
 *
 * Usage:
 *   import { resetDatabase, seedDatabase } from '../helpers/db';
 *
 *   beforeEach(async () => {
 *     await resetDatabase();
 *     await seedDatabase();
 *   });
 */

export async function resetDatabase() {
  // Truncate all tables in test database
  // Example with Prisma:
  // const tables = await prisma.$queryRaw<{ tablename: string }[]>\`
  //   SELECT tablename FROM pg_tables WHERE schemaname = 'public'
  // \`;
  // for (const { tablename } of tables) {
  //   await prisma.$executeRawUnsafe(\`TRUNCATE TABLE "\${tablename}" CASCADE\`);
  // }
  console.log('Database reset');
}

export async function seedDatabase() {
  // Insert seed data for tests
  // Example:
  // await prisma.user.create({ data: Factory.user({ role: 'admin' }) });
  console.log('Database seeded');
}

export async function closeDatabase() {
  // Close database connection
  // await prisma.$disconnect();
  console.log('Database connection closed');
}
`;

// ─── Example test file ───
const exampleTest = `
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Example unit test
describe('Example', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should pass a basic test', () => {
    expect(1 + 1).toBe(2);
  });

  it('should handle async operations', async () => {
    const result = await Promise.resolve('hello');
    expect(result).toBe('hello');
  });

  it('should mock a function', () => {
    const mockFn = vi.fn().mockReturnValue(42);
    expect(mockFn()).toBe(42);
    expect(mockFn).toHaveBeenCalledOnce();
  });

  it('should mock a module', async () => {
    // vi.mock('@/services/user', () => ({
    //   getUserById: vi.fn().mockResolvedValue({ id: '1', name: 'Test' }),
    // }));
  });

  it('should use snapshot testing', () => {
    const data = { name: 'test', value: 123 };
    expect(data).toMatchSnapshot();
  });

  it.each([
    [1, 2, 3],
    [2, 3, 5],
    [10, 20, 30],
  ])('should add %i + %i = %i', (a, b, expected) => {
    expect(a + b).toBe(expected);
  });
});
`;

// ─── Playwright config ───
const playwrightConfig = `
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [
    ['html', { open: 'never' }],
    ['junit', { outputFile: 'e2e-results.xml' }],
    ...(process.env.CI ? [['github' as const]] : []),
  ],
  use: {
    baseURL: process.env.BASE_URL ?? 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },
    {
      name: 'mobile-chrome',
      use: { ...devices['Pixel 5'] },
    },
  ],
  webServer: process.env.CI
    ? undefined
    : {
        command: 'npm run dev',
        url: 'http://localhost:3000/healthz',
        reuseExistingServer: true,
        timeout: 30000,
      },
});
`;

// ─── Write files ───
const dirs = ["test", "test/helpers", "e2e"];
for (const d of dirs) {
  if (!existsSync(d)) mkdirSync(d, { recursive: true });
}

const files = [
  { name: "vitest.config.ts", content: vitestConfig },
  { name: "test/setup.ts", content: testSetup },
  { name: "test/global-setup.ts", content: globalSetup },
  { name: "test/helpers/factory.ts", content: factory },
  { name: "test/helpers/mock-request.ts", content: mockRequest },
  { name: "test/helpers/db.ts", content: dbHelper },
  { name: "test/example.test.ts", content: exampleTest },
  { name: "playwright.config.ts", content: playwrightConfig },
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
🚀 Testing setup done!

Files:
  vitest.config.ts          → Vitest config (v8 coverage, JUnit, thresholds, path aliases)
  test/setup.ts             → Per-suite setup (env vars, cleanup)
  test/global-setup.ts      → Global setup/teardown (containers, seeding)
  test/helpers/factory.ts   → Test data factory (user, post, API responses)
  test/helpers/mock-request.ts → Mock HTTP req/res for controller tests
  test/helpers/db.ts        → Database reset/seed helpers
  test/example.test.ts      → Example test (mocks, async, snapshots, each)
  playwright.config.ts      → E2E config (Chromium, Firefox, mobile, CI mode)

Install:
  npm i -D vitest @vitest/coverage-v8 vite-tsconfig-paths
  npm i -D @playwright/test

Scripts:
  "test": "vitest run",
  "test:watch": "vitest",
  "test:coverage": "vitest run --coverage",
  "test:ui": "vitest --ui",
  "test:e2e": "playwright test",
  "test:e2e:ui": "playwright test --ui"
`);
