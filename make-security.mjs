import { writeFileSync, existsSync } from "fs";

// ─── .npmrc ───
const npmrc = `
# ─── Security ───
audit=true
audit-level=high
fund=false

# ─── Registry ───
registry=https://registry.npmjs.org/
# @your-org:registry=https://npm.pkg.github.com

# ─── Behavior ───
save-exact=true
engine-strict=true
package-lock=true
ignore-scripts=false

# ─── Lockfile ───
prefer-offline=true

# ─── Auth (GitHub Packages - use env var) ───
# //npm.pkg.github.com/:_authToken=\${GITHUB_TOKEN}
`;

// ─── SECURITY.md ───
const securityMd = `
# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 1.x.x   | :white_check_mark: |
| < 1.0   | :x:                |

## Reporting a Vulnerability

We take security seriously. If you discover a security vulnerability, please report it responsibly.

### How to Report

1. **DO NOT** create a public GitHub issue for security vulnerabilities
2. Email us at **security@example.com**
3. Or use [GitHub Security Advisories](https://github.com/your-org/your-app/security/advisories/new)

### What to Include

- Description of the vulnerability
- Steps to reproduce
- Impact assessment
- Suggested fix (if any)

### Response Timeline

- **Acknowledgment**: Within 24 hours
- **Initial Assessment**: Within 72 hours
- **Resolution Target**: Within 7 days for critical, 30 days for others

### What to Expect

- We will acknowledge your report within 24 hours
- We will provide a detailed assessment within 72 hours
- We will keep you informed of our progress
- We will credit you (unless you prefer anonymity)

### Scope

The following are in scope:
- Application source code
- API endpoints
- Authentication/authorization
- Data handling and storage
- Dependencies

### Out of Scope

- Social engineering attacks
- Physical attacks
- Denial of service attacks
- Issues in third-party services

## Security Best Practices

This project follows these security practices:

- All dependencies are regularly audited (\`npm audit\`)
- Automated security scanning with CodeQL and Snyk
- Environment variables for all secrets (never hardcoded)
- Input validation on all API endpoints (Zod)
- SQL injection prevention (parameterized queries / ORM)
- XSS prevention (output encoding, CSP headers)
- CSRF protection
- Rate limiting on all endpoints
- HTTPS enforced in production
- Non-root Docker containers
- Secrets managed via Secrets Manager / Vault
- Regular dependency updates via Dependabot

## Disclosure Policy

We follow [Responsible Disclosure](https://en.wikipedia.org/wiki/Responsible_disclosure). After a fix is deployed, we will:

1. Credit the reporter (if desired)
2. Publish a security advisory
3. Release a patch version
`;

// ─── .snyk ───
const snykConfig = `
# Snyk (https://snyk.io) policy file
version: v1.25.0

# ignores vulnerabilities until expiry date
ignore: {}

# patches apply the minimum changes required to fix a vulnerability
patch: {}
`;

// ─── .audit-ci.jsonc ───
const auditCiConfig = `
{
  "$schema": "https://github.com/IBM/audit-ci/raw/main/docs/schema.json",
  "low": true,
  "moderate": true,
  "high": false,
  "critical": false,
  "allowlist": [],
  "report-type": "full",
  "skip-dev": false
}
`;

// ─── Helmet config example (src/config/security.ts) ───
const securityConfig = `
import type { HelmetOptions } from 'helmet';

export const helmetConfig: HelmetOptions = {
  // Content Security Policy
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      fontSrc: ["'self'", 'https://fonts.gstatic.com'],
      imgSrc: ["'self'", 'data:', 'https:'],
      connectSrc: ["'self'", 'https://api.example.com'],
      frameSrc: ["'none'"],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
      upgradeInsecureRequests: [],
    },
  },

  // Cross-Origin
  crossOriginEmbedderPolicy: true,
  crossOriginOpenerPolicy: { policy: 'same-origin' },
  crossOriginResourcePolicy: { policy: 'same-origin' },

  // DNS Prefetch Control
  dnsPrefetchControl: { allow: false },

  // Frameguard
  frameguard: { action: 'deny' },

  // Hide Powered By
  hidePoweredBy: true,

  // HSTS
  hsts: {
    maxAge: 63072000, // 2 years
    includeSubDomains: true,
    preload: true,
  },

  // IE No Open
  ieNoOpen: true,

  // No Sniff
  noSniff: true,

  // Referrer Policy
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },

  // XSS Filter
  xssFilter: true,
};

// ─── CORS config ───
export const corsConfig = {
  origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
    const allowedOrigins = (process.env.CORS_ORIGINS ?? '').split(',').filter(Boolean);

    // Allow requests with no origin (mobile apps, curl, etc.)
    if (!origin) return callback(null, true);

    if (allowedOrigins.includes(origin) || allowedOrigins.includes('*')) {
      return callback(null, true);
    }

    return callback(new Error(\`Origin \${origin} not allowed by CORS\`));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'X-Request-ID'],
  exposedHeaders: ['X-Request-ID', 'X-RateLimit-Limit', 'X-RateLimit-Remaining'],
  maxAge: 86400, // 24 hours
};

// ─── Rate limit tiers ───
export const rateLimitConfig = {
  global: {
    windowMs: 60_000,
    max: 100,
    standardHeaders: true,
    legacyHeaders: false,
  },
  auth: {
    windowMs: 15 * 60_000, // 15 min
    max: 10,
  },
  api: {
    windowMs: 60_000,
    max: 60,
  },
  upload: {
    windowMs: 60_000,
    max: 5,
  },
};
`;

// ─── Write files ───
import { mkdirSync } from "fs";

if (!existsSync("src/config")) {
  mkdirSync("src/config", { recursive: true });
}

const files = [
  { name: ".npmrc", content: npmrc },
  { name: "SECURITY.md", content: securityMd },
  { name: ".snyk", content: snykConfig },
  { name: ".audit-ci.jsonc", content: auditCiConfig },
  { name: "src/config/security.ts", content: securityConfig },
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
🚀 Security setup done!

Files:
  .npmrc                    → npm security settings (audit, exact versions, strict engine)
  SECURITY.md               → Security policy (reporting, timeline, scope, practices)
  .snyk                     → Snyk policy file
  .audit-ci.jsonc           → CI audit config (fail on high/critical)
  src/config/security.ts    → Helmet CSP, CORS, rate limit tiers config

Install:
  npm i helmet cors express-rate-limit
  npm i -D snyk audit-ci

Scripts:
  "audit": "npm audit --audit-level=high",
  "audit:fix": "npm audit fix",
  "security:check": "snyk test",
  "security:monitor": "snyk monitor"
`);
