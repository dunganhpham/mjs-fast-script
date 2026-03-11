import { writeFileSync, existsSync } from "fs";
import { resolve } from "path";
if (process.argv[2]) process.chdir(resolve(process.argv[2]));

const gitlabCI = `
# ═══════════════════════════════════════════════════════
#  GitLab CI/CD Pipeline - Full Production Configuration
# ═══════════════════════════════════════════════════════

stages:
  - validate
  - test
  - security
  - build
  - deploy-staging
  - deploy-production

variables:
  NODE_IMAGE: node:20-alpine
  DOCKER_TLS_CERTDIR: "/certs"
  DOCKER_DRIVER: overlay2
  # Cache
  NPM_CONFIG_CACHE: "$CI_PROJECT_DIR/.npm"
  # Kubernetes
  KUBE_NAMESPACE_STAGING: app-staging
  KUBE_NAMESPACE_PRODUCTION: app-production
  # Container registry
  CONTAINER_IMAGE: $CI_REGISTRY_IMAGE
  CONTAINER_TAG: $CI_COMMIT_SHORT_SHA

# ─── Global cache ───
cache:
  key:
    files:
      - package-lock.json
  paths:
    - .npm/
    - node_modules/
  policy: pull

# ═══════════ VALIDATE STAGE ═══════════

lint:
  stage: validate
  image: $NODE_IMAGE
  cache:
    key:
      files:
        - package-lock.json
    paths:
      - .npm/
      - node_modules/
    policy: pull-push
  script:
    - npm ci --cache .npm --prefer-offline
    - npm run lint
  rules:
    - if: $CI_PIPELINE_SOURCE == "merge_request_event"
    - if: $CI_COMMIT_BRANCH == $CI_DEFAULT_BRANCH
    - if: $CI_COMMIT_BRANCH == "develop"

typecheck:
  stage: validate
  image: $NODE_IMAGE
  script:
    - npm ci --cache .npm --prefer-offline
    - npx tsc --noEmit
  rules:
    - if: $CI_PIPELINE_SOURCE == "merge_request_event"
    - if: $CI_COMMIT_BRANCH == $CI_DEFAULT_BRANCH

format-check:
  stage: validate
  image: $NODE_IMAGE
  script:
    - npm ci --cache .npm --prefer-offline
    - npx prettier --check "src/**/*.{ts,tsx,js,jsx,json,css,md}"
  allow_failure: true
  rules:
    - if: $CI_PIPELINE_SOURCE == "merge_request_event"

# ═══════════ TEST STAGE ═══════════

unit-test:
  stage: test
  image: $NODE_IMAGE
  services:
    - name: postgres:16-alpine
      alias: postgres
    - name: redis:7-alpine
      alias: redis
  variables:
    POSTGRES_USER: postgres
    POSTGRES_PASSWORD: postgres
    POSTGRES_DB: app_test
    DATABASE_URL: "postgresql://postgres:postgres@postgres:5432/app_test"
    REDIS_URL: "redis://redis:6379"
    NODE_ENV: test
  script:
    - npm ci --cache .npm --prefer-offline
    - npm test -- --coverage --ci
  coverage: '/Lines\\s*:\\s*(\\d+\\.?\\d*)%/'
  artifacts:
    when: always
    reports:
      junit: junit.xml
      coverage_report:
        coverage_format: cobertura
        path: coverage/cobertura-coverage.xml
    paths:
      - coverage/
    expire_in: 7 days
  rules:
    - if: $CI_PIPELINE_SOURCE == "merge_request_event"
    - if: $CI_COMMIT_BRANCH == $CI_DEFAULT_BRANCH
    - if: $CI_COMMIT_BRANCH == "develop"

integration-test:
  stage: test
  image: $NODE_IMAGE
  services:
    - name: postgres:16-alpine
      alias: postgres
    - name: redis:7-alpine
      alias: redis
  variables:
    POSTGRES_USER: postgres
    POSTGRES_PASSWORD: postgres
    POSTGRES_DB: app_integration_test
    DATABASE_URL: "postgresql://postgres:postgres@postgres:5432/app_integration_test"
    REDIS_URL: "redis://redis:6379"
    NODE_ENV: test
  script:
    - npm ci --cache .npm --prefer-offline
    - npm run test:integration
  artifacts:
    when: always
    reports:
      junit: junit-integration.xml
    expire_in: 7 days
  rules:
    - if: $CI_PIPELINE_SOURCE == "merge_request_event"
    - if: $CI_COMMIT_BRANCH == $CI_DEFAULT_BRANCH
  allow_failure: true

e2e-test:
  stage: test
  image: mcr.microsoft.com/playwright:v1.42.0-jammy
  script:
    - npm ci --cache .npm --prefer-offline
    - npx playwright test
  artifacts:
    when: always
    paths:
      - playwright-report/
      - test-results/
    expire_in: 7 days
  rules:
    - if: $CI_PIPELINE_SOURCE == "merge_request_event"
  allow_failure: true

# ═══════════ SECURITY STAGE ═══════════

sast:
  stage: security
  include:
    - template: Security/SAST.gitlab-ci.yml
  rules:
    - if: $CI_PIPELINE_SOURCE == "merge_request_event"
    - if: $CI_COMMIT_BRANCH == $CI_DEFAULT_BRANCH

dependency-scanning:
  stage: security
  image: $NODE_IMAGE
  script:
    - npm ci --cache .npm --prefer-offline
    - npm audit --audit-level=high
  allow_failure: true
  rules:
    - if: $CI_PIPELINE_SOURCE == "merge_request_event"
    - if: $CI_COMMIT_BRANCH == $CI_DEFAULT_BRANCH

secret-detection:
  stage: security
  include:
    - template: Security/Secret-Detection.gitlab-ci.yml
  rules:
    - if: $CI_PIPELINE_SOURCE == "merge_request_event"
    - if: $CI_COMMIT_BRANCH == $CI_DEFAULT_BRANCH

license-scanning:
  stage: security
  image: $NODE_IMAGE
  script:
    - npm ci --cache .npm --prefer-offline
    - npx license-checker --failOn "GPL-3.0;AGPL-3.0" --summary
  allow_failure: true
  rules:
    - if: $CI_PIPELINE_SOURCE == "merge_request_event"

container-scanning:
  stage: security
  image: docker:24
  services:
    - docker:24-dind
  variables:
    CS_IMAGE: $CONTAINER_IMAGE:$CONTAINER_TAG
  script:
    - docker run --rm -v /var/run/docker.sock:/var/run/docker.sock
        aquasec/trivy image --exit-code 1 --severity HIGH,CRITICAL
        $CS_IMAGE || true
  needs:
    - build-image
  rules:
    - if: $CI_COMMIT_BRANCH == $CI_DEFAULT_BRANCH

# ═══════════ BUILD STAGE ═══════════

build-app:
  stage: build
  image: $NODE_IMAGE
  script:
    - npm ci --cache .npm --prefer-offline
    - npm run build
  artifacts:
    paths:
      - dist/
    expire_in: 1 day
  rules:
    - if: $CI_PIPELINE_SOURCE == "merge_request_event"
    - if: $CI_COMMIT_BRANCH == $CI_DEFAULT_BRANCH
    - if: $CI_COMMIT_TAG =~ /^v.*/

build-image:
  stage: build
  image: docker:24
  services:
    - docker:24-dind
  before_script:
    - docker login -u $CI_REGISTRY_USER -p $CI_REGISTRY_PASSWORD $CI_REGISTRY
  script:
    - |
      docker build \\
        --build-arg BUILD_DATE=$(date -u +"%Y-%m-%dT%H:%M:%SZ") \\
        --build-arg VCS_REF=$CI_COMMIT_SHORT_SHA \\
        --build-arg VERSION=$CI_COMMIT_TAG \\
        --cache-from $CONTAINER_IMAGE:latest \\
        -t $CONTAINER_IMAGE:$CONTAINER_TAG \\
        -t $CONTAINER_IMAGE:$CI_COMMIT_REF_SLUG \\
        -t $CONTAINER_IMAGE:latest \\
        .
    - docker push $CONTAINER_IMAGE:$CONTAINER_TAG
    - docker push $CONTAINER_IMAGE:$CI_COMMIT_REF_SLUG
    - docker push $CONTAINER_IMAGE:latest
  rules:
    - if: $CI_COMMIT_BRANCH == $CI_DEFAULT_BRANCH
    - if: $CI_COMMIT_TAG =~ /^v.*/

# ═══════════ DEPLOY STAGING ═══════════

deploy-staging:
  stage: deploy-staging
  image: alpine/k8s:1.29.2
  environment:
    name: staging
    url: https://staging.example.com
    on_stop: stop-staging
    auto_stop_in: 1 week
  before_script:
    - kubectl config use-context $KUBE_CONTEXT_STAGING
  script:
    - |
      echo "Deploying $CONTAINER_IMAGE:$CONTAINER_TAG to staging..."
      kubectl -n $KUBE_NAMESPACE_STAGING set image deployment/app app=$CONTAINER_IMAGE:$CONTAINER_TAG
      kubectl -n $KUBE_NAMESPACE_STAGING rollout status deployment/app --timeout=300s
    - |
      echo "Running smoke tests..."
      kubectl -n $KUBE_NAMESPACE_STAGING exec deploy/app -- curl -sf http://localhost:3000/healthz
  rules:
    - if: $CI_COMMIT_BRANCH == $CI_DEFAULT_BRANCH

stop-staging:
  stage: deploy-staging
  image: alpine/k8s:1.29.2
  environment:
    name: staging
    action: stop
  script:
    - kubectl -n $KUBE_NAMESPACE_STAGING scale deployment/app --replicas=0
  when: manual
  rules:
    - if: $CI_COMMIT_BRANCH == $CI_DEFAULT_BRANCH

# ═══════════ DEPLOY PRODUCTION ═══════════

deploy-production:
  stage: deploy-production
  image: alpine/k8s:1.29.2
  environment:
    name: production
    url: https://example.com
  before_script:
    - kubectl config use-context $KUBE_CONTEXT_PRODUCTION
  script:
    - |
      echo "Deploying $CONTAINER_IMAGE:$CONTAINER_TAG to production..."
      kubectl -n $KUBE_NAMESPACE_PRODUCTION set image deployment/app app=$CONTAINER_IMAGE:$CONTAINER_TAG
      kubectl -n $KUBE_NAMESPACE_PRODUCTION rollout status deployment/app --timeout=300s
    - |
      echo "Verifying deployment..."
      kubectl -n $KUBE_NAMESPACE_PRODUCTION exec deploy/app -- curl -sf http://localhost:3000/healthz
  when: manual
  rules:
    - if: $CI_COMMIT_TAG =~ /^v.*/
    - if: $CI_COMMIT_BRANCH == $CI_DEFAULT_BRANCH

rollback-production:
  stage: deploy-production
  image: alpine/k8s:1.29.2
  environment:
    name: production
    action: stop
  before_script:
    - kubectl config use-context $KUBE_CONTEXT_PRODUCTION
  script:
    - kubectl -n $KUBE_NAMESPACE_PRODUCTION rollout undo deployment/app
    - kubectl -n $KUBE_NAMESPACE_PRODUCTION rollout status deployment/app --timeout=300s
  when: manual
  rules:
    - if: $CI_COMMIT_TAG =~ /^v.*/
    - if: $CI_COMMIT_BRANCH == $CI_DEFAULT_BRANCH
`;

if (!existsSync(".gitlab-ci.yml")) {
  writeFileSync(".gitlab-ci.yml", gitlabCI.trim());
  console.log("✅ .gitlab-ci.yml created");
} else {
  console.log("⚠️ .gitlab-ci.yml already exists");
}

console.log(`
🚀 GitLab CI/CD setup done!

Pipeline stages:
  validate   → lint, typecheck, format check
  test       → unit tests (with Postgres + Redis), integration, E2E (Playwright)
  security   → SAST, dependency scanning, secret detection, license scanning, container scanning
  build      → build app + Docker image (multi-tag)
  staging    → auto-deploy + smoke tests + auto-stop (1 week)
  production → manual deploy + rollback support
`);
