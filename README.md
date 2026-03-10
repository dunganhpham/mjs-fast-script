# DevOps & Project Config Generator

Bộ 20 generators MJS tạo nhanh toàn bộ file cấu hình production-ready cho dự án Node.js/TypeScript — từ ESLint, Husky, Docker cho đến K8S, Terraform, Monitoring.

## Yeu cau

- Node.js >= 18

## Su dung

```bash
# Xem danh sach generators
node index.mjs --list

# Chay tat ca (20 generators)
node index.mjs --all

# Chay tung nhom
node index.mjs eslint husky typescript testing vscode   # Code quality
node index.mjs dockerfile nginx k8s helm terraform      # Infrastructure
node index.mjs git env security api-docs makefile        # Project config

# Ket hop tuy y
node index.mjs dockerfile eslint husky git env
```

> Cac file da ton tai se **khong bi ghi de** (hien canh bao).

## Tong quan Generators (20)

### DevOps & Infrastructure

| Command | File | Output |
|---|---|---|
| `dockerfile` | `make-dockerfile.mjs` | `Dockerfile` (multi-stage), `.dockerignore`, `docker-compose.yml` (App + Postgres + Redis + Nginx), `.dev.yml`, `.test.yml` |
| `github-actions` | `make-github-actions.mjs` | `.github/workflows/` (CI, Deploy, Release, CodeQL, Dependency Review, PR Labeler, Stale), `dependabot.yml`, `labeler.yml` |
| `gitlab-ci` | `make-gitlab-ci.mjs` | `.gitlab-ci.yml` (6 stages: validate, test, security, build, staging, production) |
| `k8s` | `make-k8s.mjs` | `k8s/` (20 manifests + Kustomize overlays staging/production) |
| `helm` | `make-helm.mjs` | `helm/app/` (18 files: full chart, templates, values per env, tests) |
| `jenkins` | `make-jenkinsfile.mjs` | `Jenkinsfile` (K8s agent, parallel, SonarQube, Trivy, Slack) |
| `nginx` | `make-nginx.mjs` | `nginx/` (nginx.conf, site config, Dockerfile, SSL script) |
| `terraform` | `make-terraform.mjs` | `terraform/` (14 files: VPC, ALB, ECS, RDS, Redis, ACM, CloudWatch) |
| `pm2` | `make-pm2.mjs` | `ecosystem.config.cjs` (cluster, worker, scheduler), `logrotate.conf` |
| `monitoring` | `make-monitoring.mjs` | Prometheus + Grafana + Alertmanager + Loki + metrics middleware |

### Code Quality & DX

| Command | File | Output |
|---|---|---|
| `eslint` | `make-eslint-prettier.mjs` | `eslint.config.mjs` (flat config, TS, import, unicorn, sonarjs, security), `.prettierrc`, `.prettierignore`, `.editorconfig` |
| `husky` | `make-husky.mjs` | `.husky/` (pre-commit, commit-msg, pre-push), `.lintstagedrc`, `commitlint.config.mjs`, `.czrc`, `.versionrc` |
| `typescript` | `make-typescript.mjs` | `tsconfig.json` (base), `tsconfig.build.json`, `tsconfig.test.json`, `tsconfig.paths.json`, `src/types/global.d.ts` |
| `testing` | `make-testing.mjs` | `vitest.config.ts`, test setup/helpers (factory, mock-request, db), `playwright.config.ts` |
| `vscode` | `make-vscode.mjs` | `.vscode/` (settings, extensions, launch, tasks, code-snippets) |

### Project Config

| Command | File | Output |
|---|---|---|
| `git` | `make-git.mjs` | `.gitignore`, `.gitattributes`, GitHub templates (bug/feature/PR), `CODEOWNERS`, `CONTRIBUTING.md` |
| `env` | `make-env.mjs` | `.env.example`, `.env.development`, `.env.test`, `src/config/env.ts` (Zod validation) |
| `security` | `make-security.mjs` | `.npmrc`, `SECURITY.md`, `.snyk`, `.audit-ci.jsonc`, `src/config/security.ts` (Helmet, CORS, rate limits) |
| `api-docs` | `make-api-docs.mjs` | `docs/openapi.yaml` (OpenAPI 3.1), `src/config/swagger.ts`, `.redocly.yaml` |
| `makefile` | `make-makefile.mjs` | `Makefile` (40+ commands: dev, test, docker, deploy, db, docs, monitoring) |

---

## Chi tiet tung Generator

### ESLint + Prettier (`eslint`)

```bash
node index.mjs eslint
```

- **eslint.config.mjs**: Flat config with TypeScript, import ordering, unicorn, sonarjs (cognitive complexity), security plugin, jsdoc, relaxed rules for tests
- **.prettierrc**: Single quotes, trailing commas, 100 char width, overrides per file type
- **.editorconfig**: UTF-8, LF, 2 spaces, per-language settings

```bash
npm i -D eslint typescript-eslint @eslint/js eslint-config-prettier \
  eslint-plugin-import eslint-plugin-unicorn eslint-plugin-sonarjs \
  eslint-plugin-security eslint-plugin-jsdoc prettier
```

### Husky + Commitlint (`husky`)

```bash
node index.mjs husky
```

- **pre-commit**: lint-staged (ESLint fix + Prettier per file type)
- **commit-msg**: commitlint (conventional commits: feat, fix, docs, etc.)
- **pre-push**: typecheck + tests
- **.czrc**: Commitizen for interactive commit UI
- **.versionrc**: Changelog generation config

```bash
npm i -D husky lint-staged @commitlint/cli @commitlint/config-conventional commitizen
```

### TypeScript (`typescript`)

```bash
node index.mjs typescript
```

- **tsconfig.json**: ES2022, NodeNext, strict, path aliases (`@/*`)
- **tsconfig.build.json**: Production (no sourcemaps, strip comments, no unused)
- **tsconfig.test.json**: Relaxed for tests (vitest globals)
- **src/types/global.d.ts**: ProcessEnv, utility types (Brand, DeepPartial), API response types

### Testing (`testing`)

```bash
node index.mjs testing
```

- **vitest.config.ts**: V8 coverage (80% thresholds), JUnit reporter, path aliases, forks pool
- **test/helpers/**: Factory (user, post, API responses), mock HTTP req/res, DB helpers
- **playwright.config.ts**: Chromium + Firefox + mobile, CI mode, screenshots on failure

```bash
npm i -D vitest @vitest/coverage-v8 vite-tsconfig-paths @playwright/test
```

### VSCode (`vscode`)

```bash
node index.mjs vscode
```

- **settings.json**: Format on save, ESLint fix, Prettier, TypeScript inlay hints, file watchers
- **extensions.json**: 20+ recommended extensions
- **launch.json**: Debug app, current file, tests, Docker attach
- **tasks.json**: Build, dev, test, lint, Docker, DB tasks
- **code-snippets**: TS (async fn, interface, try-catch), testing (describe, it, suite), Express (handler, middleware)

### Git (`git`)

```bash
node index.mjs git
```

- **.gitignore**: Node.js comprehensive (deps, build, env, IDE, OS, Terraform, secrets)
- **.gitattributes**: LF normalization, diff drivers, binary detection, linguist
- **GitHub templates**: Bug report form, feature request form, PR template with checklist
- **CODEOWNERS**: Per-directory ownership
- **CONTRIBUTING.md**: Setup, commit convention, PR process

### Environment (`env`)

```bash
node index.mjs env
```

- **.env.example**: 50+ documented variables (app, DB, Redis, auth, email, S3, queue, CORS, features)
- **.env.development**: Dev defaults (debug logging, relaxed auth)
- **.env.test**: Test defaults (error-only logging, fast bcrypt)
- **src/config/env.ts**: Zod schema validation + typed `config` object with derived values

```bash
npm i zod
```

### PM2 (`pm2`)

```bash
node index.mjs pm2
```

- **ecosystem.config.cjs**: 3 apps (main cluster + worker + scheduler), env per stage, deploy config
- **logrotate.conf**: Daily rotation, 14 days retention, compressed

### Security (`security`)

```bash
node index.mjs security
```

- **.npmrc**: Audit on install, exact versions, strict engine
- **SECURITY.md**: Vulnerability reporting policy, timeline, scope
- **src/config/security.ts**: Helmet CSP config, CORS with origin validation, rate limit tiers (global/auth/api/upload)

### API Docs (`api-docs`)

```bash
node index.mjs api-docs
```

- **docs/openapi.yaml**: Full OpenAPI 3.1 spec (auth, users, health, pagination, error responses)
- **src/config/swagger.ts**: swagger-jsdoc setup + YAML loader
- **.redocly.yaml**: Linter + docs builder config

### Monitoring (`monitoring`)

```bash
node index.mjs monitoring
```

- **docker-compose.monitoring.yml**: Prometheus + Grafana + Alertmanager + Node Exporter + cAdvisor + Loki
- **Alert rules**: Error rate, latency, app down, CPU, memory, disk, container restarts
- **Grafana dashboard**: Requests, latency percentiles, errors, memory, CPU, event loop
- **src/middleware/metrics.ts**: prom-client middleware (request counter, duration histogram, active requests)

```bash
docker compose -f docker-compose.monitoring.yml up -d
# Prometheus: http://localhost:9090
# Grafana:    http://localhost:3001 (admin/admin)
```

### Makefile (`makefile`)

```bash
node index.mjs makefile
```

40+ commands organized by category:

| Category | Commands |
|---|---|
| Development | `make dev`, `make build`, `make start`, `make start-pm2` |
| Quality | `make lint`, `make test`, `make typecheck`, `make check-all`, `make ci` |
| Database | `make db-migrate`, `make db-seed`, `make db-studio`, `make db-reset` |
| Docker | `make docker-up`, `make docker-dev`, `make docker-build`, `make docker-push` |
| Monitoring | `make monitoring-up`, `make monitoring-down` |
| Deploy | `make deploy-staging`, `make deploy-production`, `make rollback` |
| Infrastructure | `make tf-init`, `make tf-plan`, `make tf-apply` |
| Docs | `make docs-lint`, `make docs-build`, `make docs-preview` |
| Setup | `make setup` (full project bootstrap) |

---

## Quick Start

```bash
# Tao tat ca config cho du an moi
node index.mjs --all

# Hoac chon nhung gi can
node index.mjs eslint husky typescript testing git env dockerfile vscode makefile
```

## Tuy chinh

Sau khi generate, thay doi cac placeholder:

- `your-org/your-app` → ten org/repo thuc te
- `example.com` → domain thuc te
- `alerts@example.com` → email nhan alerts
- Credentials, API keys → gia tri thuc te (dung secrets management)

## License

MIT
