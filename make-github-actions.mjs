import { writeFileSync, existsSync, mkdirSync } from "fs";

// ─── CI Workflow ───
const ciWorkflow = `
name: CI

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main, develop]

concurrency:
  group: ci-\${{ github.ref }}
  cancel-in-progress: true

permissions:
  contents: read
  checks: write
  pull-requests: write

jobs:
  # ─── Lint & Format ───
  lint:
    name: Lint & Format
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm

      - run: npm ci

      - name: Run ESLint
        run: npm run lint -- --format=json --output-file=eslint-report.json
        continue-on-error: true

      - name: Annotate ESLint results
        if: always()
        uses: ataylorme/eslint-annotate-action@v3
        with:
          report-json: eslint-report.json

      - name: Check formatting (Prettier)
        run: npx prettier --check "src/**/*.{ts,tsx,js,jsx,json,css,md}"

  # ─── Type Check ───
  typecheck:
    name: Type Check
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
      - run: npm ci
      - run: npx tsc --noEmit

  # ─── Unit & Integration Tests ───
  test:
    name: Test (Node \${{ matrix.node-version }})
    runs-on: ubuntu-latest
    strategy:
      fail-fast: false
      matrix:
        node-version: [18, 20, 22]

    services:
      postgres:
        image: postgres:16-alpine
        env:
          POSTGRES_USER: postgres
          POSTGRES_PASSWORD: postgres
          POSTGRES_DB: app_test
        ports:
          - 5432:5432
        options: >-
          --health-cmd="pg_isready -U postgres"
          --health-interval=10s
          --health-timeout=5s
          --health-retries=5

      redis:
        image: redis:7-alpine
        ports:
          - 6379:6379
        options: >-
          --health-cmd="redis-cli ping"
          --health-interval=10s
          --health-timeout=5s
          --health-retries=5

    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: \${{ matrix.node-version }}
          cache: npm

      - run: npm ci

      - name: Run tests with coverage
        run: npm test -- --coverage --ci --reporters=default --reporters=jest-junit
        env:
          DATABASE_URL: postgresql://postgres:postgres@localhost:5432/app_test
          REDIS_URL: redis://localhost:6379
          NODE_ENV: test
          JEST_JUNIT_OUTPUT_DIR: ./reports

      - name: Upload coverage to Codecov
        if: matrix.node-version == 20
        uses: codecov/codecov-action@v4
        with:
          token: \${{ secrets.CODECOV_TOKEN }}
          files: ./coverage/lcov.info
          fail_ci_if_error: false

      - name: Upload test results
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: test-results-node-\${{ matrix.node-version }}
          path: |
            ./reports/
            ./coverage/
          retention-days: 7

  # ─── Build ───
  build:
    name: Build
    runs-on: ubuntu-latest
    needs: [lint, typecheck, test]
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm

      - run: npm ci
      - run: npm run build

      - name: Upload build artifacts
        uses: actions/upload-artifact@v4
        with:
          name: build-output
          path: dist/
          retention-days: 7

  # ─── E2E Tests (optional) ───
  e2e:
    name: E2E Tests
    runs-on: ubuntu-latest
    needs: [build]
    if: github.event_name == 'pull_request'
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm

      - run: npm ci

      - name: Install Playwright browsers
        run: npx playwright install --with-deps chromium

      - name: Run E2E tests
        run: npx playwright test
        env:
          CI: true

      - name: Upload Playwright report
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: playwright-report
          path: playwright-report/
          retention-days: 7
`;

// ─── Deploy Workflow ───
const deployWorkflow = `
name: Deploy

on:
  push:
    branches: [main]
  workflow_dispatch:
    inputs:
      environment:
        description: "Target environment"
        required: true
        type: choice
        options:
          - staging
          - production
        default: staging

concurrency:
  group: deploy-\${{ github.event.inputs.environment || 'staging' }}
  cancel-in-progress: false

env:
  REGISTRY: ghcr.io
  IMAGE_NAME: \${{ github.repository }}

jobs:
  # ─── Build & Push Docker Image ───
  build-image:
    name: Build & Push Image
    runs-on: ubuntu-latest
    permissions:
      contents: read
      packages: write
    outputs:
      image-tag: \${{ steps.meta.outputs.version }}
      image-digest: \${{ steps.build.outputs.digest }}

    steps:
      - uses: actions/checkout@v4

      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v3

      - name: Log in to Container Registry
        uses: docker/login-action@v3
        with:
          registry: \${{ env.REGISTRY }}
          username: \${{ github.actor }}
          password: \${{ secrets.GITHUB_TOKEN }}

      - name: Extract metadata
        id: meta
        uses: docker/metadata-action@v5
        with:
          images: \${{ env.REGISTRY }}/\${{ env.IMAGE_NAME }}
          tags: |
            type=sha,prefix=
            type=ref,event=branch
            type=semver,pattern={{version}}
            type=raw,value=latest,enable={{is_default_branch}}

      - name: Build and push Docker image
        id: build
        uses: docker/build-push-action@v6
        with:
          context: .
          push: true
          tags: \${{ steps.meta.outputs.tags }}
          labels: \${{ steps.meta.outputs.labels }}
          cache-from: type=gha
          cache-to: type=gha,mode=max
          platforms: linux/amd64,linux/arm64

  # ─── Deploy to Staging ───
  deploy-staging:
    name: Deploy to Staging
    needs: [build-image]
    runs-on: ubuntu-latest
    if: github.event.inputs.environment != 'production'
    environment:
      name: staging
      url: https://staging.example.com

    steps:
      - uses: actions/checkout@v4

      - name: Deploy to staging
        run: |
          echo "Deploying image \${{ env.REGISTRY }}/\${{ env.IMAGE_NAME }}:\${{ needs.build-image.outputs.image-tag }}"
          # kubectl set image deployment/app app=\${{ env.REGISTRY }}/\${{ env.IMAGE_NAME }}:\${{ needs.build-image.outputs.image-tag }}
          # -- OR --
          # helm upgrade app ./helm/app --set image.tag=\${{ needs.build-image.outputs.image-tag }}

      - name: Run smoke tests
        run: |
          echo "Running smoke tests against staging..."
          # curl -sf https://staging.example.com/healthz

  # ─── Deploy to Production ───
  deploy-production:
    name: Deploy to Production
    needs: [build-image, deploy-staging]
    runs-on: ubuntu-latest
    if: github.event.inputs.environment == 'production' || (github.ref == 'refs/heads/main' && github.event_name == 'push')
    environment:
      name: production
      url: https://example.com

    steps:
      - uses: actions/checkout@v4

      - name: Deploy to production
        run: |
          echo "Deploying image \${{ env.REGISTRY }}/\${{ env.IMAGE_NAME }}:\${{ needs.build-image.outputs.image-tag }}"
          # kubectl set image deployment/app app=\${{ env.REGISTRY }}/\${{ env.IMAGE_NAME }}:\${{ needs.build-image.outputs.image-tag }}

      - name: Verify deployment
        run: |
          echo "Verifying production deployment..."
          # curl -sf https://example.com/healthz
`;

// ─── Release Workflow ───
const releaseWorkflow = `
name: Release

on:
  push:
    tags:
      - "v*"

permissions:
  contents: write
  packages: write

jobs:
  release:
    name: Create Release
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm

      - run: npm ci
      - run: npm run build
      - run: npm test

      - name: Generate changelog
        id: changelog
        run: |
          PREV_TAG=\$(git describe --tags --abbrev=0 HEAD^ 2>/dev/null || echo "")
          if [ -n "\$PREV_TAG" ]; then
            CHANGES=\$(git log \$PREV_TAG..HEAD --pretty=format:"- %s (%h)" --no-merges)
          else
            CHANGES=\$(git log --pretty=format:"- %s (%h)" --no-merges -20)
          fi
          echo "changes<<EOF" >> \$GITHUB_OUTPUT
          echo "\$CHANGES" >> \$GITHUB_OUTPUT
          echo "EOF" >> \$GITHUB_OUTPUT

      - name: Create GitHub Release
        uses: softprops/action-gh-release@v2
        with:
          generate_release_notes: true
          body: |
            ## Changes
            \${{ steps.changelog.outputs.changes }}
          files: |
            dist/**

      - name: Publish to npm
        if: "!contains(github.ref, 'beta') && !contains(github.ref, 'alpha')"
        run: npm publish --access public
        env:
          NODE_AUTH_TOKEN: \${{ secrets.NPM_TOKEN }}
`;

// ─── CodeQL Security Analysis ───
const codeqlWorkflow = `
name: "CodeQL Analysis"

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]
  schedule:
    - cron: "30 6 * * 1"  # Monday 6:30 UTC

permissions:
  actions: read
  contents: read
  security-events: write

jobs:
  analyze:
    name: Analyze
    runs-on: ubuntu-latest
    strategy:
      fail-fast: false
      matrix:
        language: [javascript-typescript]

    steps:
      - uses: actions/checkout@v4

      - name: Initialize CodeQL
        uses: github/codeql-action/init@v3
        with:
          languages: \${{ matrix.language }}
          queries: security-extended,security-and-quality

      - name: Autobuild
        uses: github/codeql-action/autobuild@v3

      - name: Perform CodeQL Analysis
        uses: github/codeql-action/analyze@v3
        with:
          category: "/language:\${{ matrix.language }}"
`;

// ─── Dependency Review ───
const dependencyReviewWorkflow = `
name: Dependency Review

on:
  pull_request:
    branches: [main]

permissions:
  contents: read
  pull-requests: write

jobs:
  dependency-review:
    name: Dependency Review
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Dependency Review
        uses: actions/dependency-review-action@v4
        with:
          fail-on-severity: high
          deny-licenses: GPL-3.0, AGPL-3.0
          comment-summary-in-pr: always
`;

// ─── Dependabot Config ───
const dependabot = `
version: 2

updates:
  - package-ecosystem: "npm"
    directory: "/"
    schedule:
      interval: "weekly"
      day: "monday"
      time: "06:00"
      timezone: "Asia/Ho_Chi_Minh"
    open-pull-requests-limit: 10
    reviewers:
      - "your-org/devops-team"
    labels:
      - "dependencies"
      - "automated"
    groups:
      dev-dependencies:
        dependency-type: "development"
        update-types:
          - "minor"
          - "patch"
      production-dependencies:
        dependency-type: "production"
        update-types:
          - "patch"
    ignore:
      - dependency-name: "*"
        update-types: ["version-update:semver-major"]

  - package-ecosystem: "github-actions"
    directory: "/"
    schedule:
      interval: "weekly"
    labels:
      - "ci/cd"
      - "automated"

  - package-ecosystem: "docker"
    directory: "/"
    schedule:
      interval: "weekly"
    labels:
      - "docker"
      - "automated"
`;

// ─── PR Labeler Config ───
const labelerWorkflow = `
name: PR Labeler

on:
  pull_request:
    types: [opened, synchronize, reopened]

permissions:
  contents: read
  pull-requests: write

jobs:
  label:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/labeler@v5
        with:
          repo-token: \${{ secrets.GITHUB_TOKEN }}
          sync-labels: true
`;

const labelerConfig = `
# Label PRs based on file paths
feature:
  - changed-files:
      - any-glob-to-any-file: "src/features/**"

bugfix:
  - changed-files:
      - any-glob-to-any-file: "src/**/*.{ts,tsx,js,jsx}"
  - head-branch: ["^fix/", "^bugfix/", "^hotfix/"]

documentation:
  - changed-files:
      - any-glob-to-any-file: ["**/*.md", "docs/**"]

tests:
  - changed-files:
      - any-glob-to-any-file: ["**/*.test.*", "**/*.spec.*", "__tests__/**", "e2e/**"]

ci/cd:
  - changed-files:
      - any-glob-to-any-file: [".github/**", "Dockerfile*", "docker-compose*", "Jenkinsfile", ".gitlab-ci.yml"]

infrastructure:
  - changed-files:
      - any-glob-to-any-file: ["terraform/**", "k8s/**", "helm/**", "nginx/**"]

dependencies:
  - changed-files:
      - any-glob-to-any-file: ["package.json", "package-lock.json", "yarn.lock", "pnpm-lock.yaml"]

database:
  - changed-files:
      - any-glob-to-any-file: ["**/migrations/**", "**/seeds/**", "prisma/**"]

config:
  - changed-files:
      - any-glob-to-any-file: ["*.config.*", ".env*", "tsconfig*"]
`;

// ─── Stale issues/PRs ───
const staleWorkflow = `
name: Stale Issues & PRs

on:
  schedule:
    - cron: "0 6 * * *"  # Daily at 6:00 UTC

permissions:
  issues: write
  pull-requests: write

jobs:
  stale:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/stale@v9
        with:
          repo-token: \${{ secrets.GITHUB_TOKEN }}
          stale-issue-message: "This issue has been automatically marked as stale because it has not had recent activity. It will be closed in 7 days if no further activity occurs."
          stale-pr-message: "This PR has been automatically marked as stale because it has not had recent activity. It will be closed in 7 days if no further activity occurs."
          stale-issue-label: "stale"
          stale-pr-label: "stale"
          days-before-stale: 30
          days-before-close: 7
          exempt-issue-labels: "pinned,security,bug"
          exempt-pr-labels: "pinned,security"
`;

// ─── Write all files ───
const dirs = [".github/workflows", ".github"];

for (const d of dirs) {
  if (!existsSync(d)) {
    mkdirSync(d, { recursive: true });
  }
}

const files = [
  { name: ".github/workflows/ci.yml", content: ciWorkflow },
  { name: ".github/workflows/deploy.yml", content: deployWorkflow },
  { name: ".github/workflows/release.yml", content: releaseWorkflow },
  { name: ".github/workflows/codeql.yml", content: codeqlWorkflow },
  { name: ".github/workflows/dependency-review.yml", content: dependencyReviewWorkflow },
  { name: ".github/workflows/labeler.yml", content: labelerWorkflow },
  { name: ".github/workflows/stale.yml", content: staleWorkflow },
  { name: ".github/dependabot.yml", content: dependabot },
  { name: ".github/labeler.yml", content: labelerConfig },
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
🚀 GitHub Actions setup done!

Workflows:
  ci.yml                  → Lint, typecheck, test (matrix), build, E2E
  deploy.yml              → Build image + deploy staging/production
  release.yml             → Tag-based releases + npm publish
  codeql.yml              → Security scanning (weekly + on push)
  dependency-review.yml   → PR dependency audit
  labeler.yml             → Auto-label PRs by file paths
  stale.yml               → Auto-close stale issues/PRs

Config:
  dependabot.yml          → Auto-update npm, actions, docker
  labeler.yml             → PR label rules
`);
