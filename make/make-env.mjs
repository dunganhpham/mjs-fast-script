import { writeFileSync, existsSync, mkdirSync } from "fs";
import { resolve } from "path";
if (process.argv[2]) process.chdir(resolve(process.argv[2]));

// ─── .env.example ───
const envExample = `
# ═══════════════════════════════════════════
#  Environment Variables
#  Copy this file to .env and fill in values
#  cp .env.example .env
# ═══════════════════════════════════════════

# ─── App ───
NODE_ENV=development
PORT=3000
HOST=0.0.0.0
APP_NAME=my-app
APP_URL=http://localhost:3000
API_PREFIX=/api/v1

# ─── Database (PostgreSQL) ───
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/app_db
DB_HOST=localhost
DB_PORT=5432
DB_NAME=app_db
DB_USER=postgres
DB_PASSWORD=postgres
DB_SSL=false
DB_POOL_MIN=2
DB_POOL_MAX=10

# ─── Redis ───
REDIS_URL=redis://localhost:6379
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=
REDIS_DB=0
REDIS_KEY_PREFIX=app:

# ─── Authentication ───
JWT_SECRET=change-me-to-a-secure-random-string
JWT_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d
BCRYPT_ROUNDS=12

# ─── OAuth (optional) ───
# GOOGLE_CLIENT_ID=
# GOOGLE_CLIENT_SECRET=
# GITHUB_CLIENT_ID=
# GITHUB_CLIENT_SECRET=

# ─── Email (SMTP) ───
SMTP_HOST=smtp.mailtrap.io
SMTP_PORT=587
SMTP_USER=
SMTP_PASSWORD=
SMTP_FROM=noreply@example.com
SMTP_SECURE=false

# ─── Storage (S3-compatible) ───
STORAGE_DRIVER=local
S3_BUCKET=
S3_REGION=ap-southeast-1
S3_ACCESS_KEY=
S3_SECRET_KEY=
S3_ENDPOINT=
UPLOAD_MAX_SIZE=10485760

# ─── Queue (Bull/BullMQ) ───
QUEUE_REDIS_URL=redis://localhost:6379/1

# ─── Logging ───
LOG_LEVEL=debug
LOG_FORMAT=pretty
LOG_FILE=

# ─── Rate Limiting ───
RATE_LIMIT_MAX=100
RATE_LIMIT_WINDOW_MS=60000

# ─── CORS ───
CORS_ORIGINS=http://localhost:3000,http://localhost:5173
CORS_CREDENTIALS=true

# ─── Session (optional) ───
SESSION_SECRET=change-me
SESSION_MAX_AGE=86400000

# ─── External APIs ───
# STRIPE_SECRET_KEY=
# STRIPE_WEBHOOK_SECRET=
# SENDGRID_API_KEY=
# SLACK_WEBHOOK_URL=
# SENTRY_DSN=

# ─── Feature Flags ───
FEATURE_REGISTRATION=true
FEATURE_OAUTH=false
FEATURE_EMAIL_VERIFICATION=true
FEATURE_RATE_LIMIT=true
`;

// ─── .env.development ───
const envDev = `
NODE_ENV=development
PORT=3000
LOG_LEVEL=debug
LOG_FORMAT=pretty

DATABASE_URL=postgresql://postgres:postgres@localhost:5432/app_dev
REDIS_URL=redis://localhost:6379/0

JWT_SECRET=dev-secret-not-for-production
JWT_EXPIRES_IN=1h
JWT_REFRESH_EXPIRES_IN=30d
BCRYPT_ROUNDS=4

CORS_ORIGINS=http://localhost:3000,http://localhost:5173,http://localhost:4200

FEATURE_REGISTRATION=true
FEATURE_OAUTH=false
`;

// ─── .env.test ───
const envTest = `
NODE_ENV=test
PORT=3001
LOG_LEVEL=error
LOG_FORMAT=json

DATABASE_URL=postgresql://postgres:postgres@localhost:5432/app_test
REDIS_URL=redis://localhost:6379/1

JWT_SECRET=test-secret
JWT_EXPIRES_IN=15m
BCRYPT_ROUNDS=1

CORS_ORIGINS=*

RATE_LIMIT_MAX=9999
`;

// ─── src/config/env.ts (Zod validation) ───
const envValidation = `
import { z } from 'zod';

const envSchema = z.object({
  // ─── App ───
  NODE_ENV: z.enum(['development', 'production', 'test', 'staging']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  HOST: z.string().default('0.0.0.0'),
  APP_NAME: z.string().default('my-app'),
  APP_URL: z.string().url().default('http://localhost:3000'),
  API_PREFIX: z.string().default('/api/v1'),

  // ─── Database ───
  DATABASE_URL: z.string().url(),
  DB_POOL_MIN: z.coerce.number().int().min(1).default(2),
  DB_POOL_MAX: z.coerce.number().int().min(1).default(10),

  // ─── Redis ───
  REDIS_URL: z.string().default('redis://localhost:6379'),
  REDIS_KEY_PREFIX: z.string().default('app:'),

  // ─── Auth ───
  JWT_SECRET: z.string().min(16),
  JWT_EXPIRES_IN: z.string().default('15m'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('7d'),
  BCRYPT_ROUNDS: z.coerce.number().int().min(1).max(20).default(12),

  // ─── Email ───
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  SMTP_FROM: z.string().email().optional(),

  // ─── Storage ───
  STORAGE_DRIVER: z.enum(['local', 's3']).default('local'),
  S3_BUCKET: z.string().optional(),
  S3_REGION: z.string().optional(),
  UPLOAD_MAX_SIZE: z.coerce.number().int().default(10_485_760), // 10MB

  // ─── Logging ───
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  LOG_FORMAT: z.enum(['json', 'pretty']).default('json'),

  // ─── Rate Limiting ───
  RATE_LIMIT_MAX: z.coerce.number().int().default(100),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().default(60_000),

  // ─── CORS ───
  CORS_ORIGINS: z.string().default(''),
  CORS_CREDENTIALS: z.coerce.boolean().default(true),

  // ─── External ───
  SENTRY_DSN: z.string().url().optional(),
  SLACK_WEBHOOK_URL: z.string().url().optional(),

  // ─── Feature Flags ───
  FEATURE_REGISTRATION: z.coerce.boolean().default(true),
  FEATURE_OAUTH: z.coerce.boolean().default(false),
  FEATURE_EMAIL_VERIFICATION: z.coerce.boolean().default(true),
  FEATURE_RATE_LIMIT: z.coerce.boolean().default(true),
});

export type Env = z.infer<typeof envSchema>;

function validateEnv(): Env {
  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    const errors = result.error.flatten().fieldErrors;
    const formatted = Object.entries(errors)
      .map(([key, msgs]) => \`  \${key}: \${msgs?.join(', ')}\`)
      .join('\\n');

    console.error('\\n❌ Invalid environment variables:\\n' + formatted + '\\n');
    process.exit(1);
  }

  return result.data;
}

export const env = validateEnv();

// ─── Derived config ───
export const config = {
  isDev: env.NODE_ENV === 'development',
  isProd: env.NODE_ENV === 'production',
  isTest: env.NODE_ENV === 'test',

  app: {
    name: env.APP_NAME,
    url: env.APP_URL,
    port: env.PORT,
    host: env.HOST,
    apiPrefix: env.API_PREFIX,
  },

  db: {
    url: env.DATABASE_URL,
    pool: { min: env.DB_POOL_MIN, max: env.DB_POOL_MAX },
  },

  redis: {
    url: env.REDIS_URL,
    keyPrefix: env.REDIS_KEY_PREFIX,
  },

  auth: {
    jwtSecret: env.JWT_SECRET,
    jwtExpiresIn: env.JWT_EXPIRES_IN,
    jwtRefreshExpiresIn: env.JWT_REFRESH_EXPIRES_IN,
    bcryptRounds: env.BCRYPT_ROUNDS,
  },

  mail: {
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    user: env.SMTP_USER,
    password: env.SMTP_PASSWORD,
    from: env.SMTP_FROM,
  },

  storage: {
    driver: env.STORAGE_DRIVER,
    s3: { bucket: env.S3_BUCKET, region: env.S3_REGION },
    maxSize: env.UPLOAD_MAX_SIZE,
  },

  log: {
    level: env.LOG_LEVEL,
    format: env.LOG_FORMAT,
  },

  rateLimit: {
    max: env.RATE_LIMIT_MAX,
    windowMs: env.RATE_LIMIT_WINDOW_MS,
  },

  cors: {
    origins: env.CORS_ORIGINS.split(',').filter(Boolean),
    credentials: env.CORS_CREDENTIALS,
  },

  features: {
    registration: env.FEATURE_REGISTRATION,
    oauth: env.FEATURE_OAUTH,
    emailVerification: env.FEATURE_EMAIL_VERIFICATION,
    rateLimit: env.FEATURE_RATE_LIMIT,
  },
} as const;
`;

// ─── Write files ───
if (!existsSync("src/config")) {
  mkdirSync("src/config", { recursive: true });
}

const files = [
  { name: ".env.example", content: envExample },
  { name: ".env.development", content: envDev },
  { name: ".env.test", content: envTest },
  { name: "src/config/env.ts", content: envValidation },
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
🚀 Environment setup done!

Files:
  .env.example          → Full template with all variables documented
  .env.development      → Dev defaults (debug logging, relaxed auth)
  .env.test             → Test defaults (error-only logging, fast bcrypt)
  src/config/env.ts     → Zod validation + typed config object

Install:
  npm i zod

Usage:
  import { config } from '@/config/env';
  console.log(config.app.port);
  console.log(config.features.registration);
`);
