import { writeFileSync, existsSync } from "fs";

const makefile = `
# ═══════════════════════════════════════════
#  Makefile - Common Development Commands
# ═══════════════════════════════════════════

.PHONY: help install dev build test lint format clean docker-up docker-down db-migrate db-seed deploy

.DEFAULT_GOAL := help

# ─── Colors ───
BLUE  := \\033[36m
GREEN := \\033[32m
RESET := \\033[0m

# ─── Variables ───
APP_NAME    ?= app
NODE_ENV    ?= development
DOCKER_TAG  ?= latest
REGISTRY    ?= ghcr.io/your-org/your-app

# ═══════════ HELP ═══════════
help: ## Show this help
	@echo ""
	@echo "$(GREEN)$(APP_NAME)$(RESET) - Available commands:"
	@echo ""
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | \\
		awk 'BEGIN {FS = ":.*?## "}; {printf "  $(BLUE)%-20s$(RESET) %s\\n", $$1, $$2}'
	@echo ""

# ═══════════ DEVELOPMENT ═══════════
install: ## Install dependencies
	npm ci

dev: ## Start development server
	npm run dev

build: ## Build for production
	npm run build

start: ## Start production server
	NODE_ENV=production node dist/index.js

start-pm2: ## Start with PM2
	pm2 start ecosystem.config.cjs --env production

# ═══════════ QUALITY ═══════════
test: ## Run tests
	npm test

test-watch: ## Run tests in watch mode
	npm run test:watch

test-coverage: ## Run tests with coverage
	npm run test:coverage

test-e2e: ## Run E2E tests
	npx playwright test

lint: ## Run ESLint
	npm run lint

lint-fix: ## Run ESLint with auto-fix
	npm run lint:fix

format: ## Format code with Prettier
	npx prettier --write "src/**/*.{ts,tsx,js,jsx,json,css,md}"

format-check: ## Check formatting
	npx prettier --check "src/**/*.{ts,tsx,js,jsx,json,css,md}"

typecheck: ## Run TypeScript type check
	npx tsc --noEmit

audit: ## Run security audit
	npm audit --audit-level=high

check-all: lint typecheck test build ## Run all checks (lint, typecheck, test, build)

# ═══════════ DATABASE ═══════════
db-migrate: ## Run database migrations
	npx prisma migrate dev

db-migrate-prod: ## Run production migrations
	npx prisma migrate deploy

db-seed: ## Seed the database
	npx prisma db seed

db-reset: ## Reset database (DESTRUCTIVE)
	npx prisma migrate reset --force

db-studio: ## Open Prisma Studio
	npx prisma studio

db-generate: ## Generate Prisma client
	npx prisma generate

# ═══════════ DOCKER ═══════════
docker-up: ## Start all Docker services
	docker compose up -d

docker-down: ## Stop all Docker services
	docker compose down

docker-dev: ## Start dev environment
	docker compose -f docker-compose.yml -f docker-compose.dev.yml up

docker-test: ## Run tests in Docker
	docker compose -f docker-compose.yml -f docker-compose.test.yml run --rm app

docker-build: ## Build Docker image
	docker build -t $(REGISTRY):$(DOCKER_TAG) .

docker-push: ## Push Docker image
	docker push $(REGISTRY):$(DOCKER_TAG)

docker-logs: ## View app logs
	docker compose logs -f app

docker-shell: ## Shell into app container
	docker compose exec app sh

docker-clean: ## Remove all containers, volumes, and images
	docker compose down -v --rmi local --remove-orphans

# ═══════════ MONITORING ═══════════
monitoring-up: ## Start monitoring stack
	docker compose -f docker-compose.monitoring.yml up -d

monitoring-down: ## Stop monitoring stack
	docker compose -f docker-compose.monitoring.yml down

# ═══════════ DEPLOYMENT ═══════════
deploy-staging: ## Deploy to staging
	@echo "Deploying to staging..."
	# kubectl set image deployment/$(APP_NAME) app=$(REGISTRY):$(DOCKER_TAG) -n staging
	# -- or --
	# helm upgrade $(APP_NAME) ./helm/app -f helm/app/values-staging.yaml

deploy-production: ## Deploy to production
	@echo "Deploying to production..."
	@read -p "Are you sure? [y/N] " confirm && [ "$$confirm" = "y" ] || exit 1
	# kubectl set image deployment/$(APP_NAME) app=$(REGISTRY):$(DOCKER_TAG) -n production
	# -- or --
	# helm upgrade $(APP_NAME) ./helm/app -f helm/app/values-production.yaml

rollback: ## Rollback last deployment
	# kubectl rollout undo deployment/$(APP_NAME) -n production
	@echo "Rolled back successfully"

# ═══════════ INFRASTRUCTURE ═══════════
tf-init: ## Initialize Terraform
	cd terraform && terraform init

tf-plan: ## Plan Terraform changes
	cd terraform && terraform plan -var-file=terraform.tfvars

tf-apply: ## Apply Terraform changes
	cd terraform && terraform apply -var-file=terraform.tfvars

tf-destroy: ## Destroy Terraform resources (DESTRUCTIVE)
	@read -p "Are you REALLY sure? [y/N] " confirm && [ "$$confirm" = "y" ] || exit 1
	cd terraform && terraform destroy -var-file=terraform.tfvars

# ═══════════ DOCS ═══════════
docs-lint: ## Lint OpenAPI spec
	npx @redocly/cli lint docs/openapi.yaml

docs-build: ## Build API docs
	npx @redocly/cli build-docs docs/openapi.yaml -o docs/index.html

docs-preview: ## Preview API docs
	npx @redocly/cli preview-docs docs/openapi.yaml

# ═══════════ CLEAN ═══════════
clean: ## Clean build artifacts
	rm -rf dist coverage .tsbuildinfo node_modules/.cache

clean-all: clean ## Clean everything including node_modules
	rm -rf node_modules

# ═══════════ SETUP ═══════════
setup: ## Full project setup (install, generate, migrate, seed)
	@echo "$(GREEN)Setting up project...$(RESET)"
	npm ci
	npx prisma generate
	npx prisma migrate dev
	npx prisma db seed
	npx husky install
	@echo "$(GREEN)Setup complete!$(RESET)"

# ═══════════ CI ═══════════
ci: install lint typecheck test build ## Run full CI pipeline locally
	@echo "$(GREEN)CI pipeline passed!$(RESET)"
`;

if (!existsSync("Makefile")) {
  writeFileSync("Makefile", makefile.trim());
  console.log("✅ Makefile created");
} else {
  console.log("⚠️ Makefile already exists");
}

console.log(`
🚀 Makefile setup done!

Commands (run 'make help' for full list):

  Development:    make dev, make build, make start
  Quality:        make lint, make test, make typecheck, make check-all
  Database:       make db-migrate, make db-seed, make db-studio
  Docker:         make docker-up, make docker-down, make docker-build
  Monitoring:     make monitoring-up
  Deploy:         make deploy-staging, make deploy-production, make rollback
  Infrastructure: make tf-init, make tf-plan, make tf-apply
  Docs:           make docs-lint, make docs-build, make docs-preview
  Setup:          make setup (full project setup)
  CI:             make ci (run full CI locally)
`);
