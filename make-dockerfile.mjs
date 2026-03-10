import { writeFileSync, existsSync } from "fs";

// ─── Multi-stage Dockerfile ───
const dockerfile = `
# ============ Stage 1: Dependencies ============
FROM node:20-alpine AS deps

RUN apk add --no-cache libc6-compat

WORKDIR /app

COPY package.json package-lock.json* yarn.lock* pnpm-lock.yaml* ./

RUN \\
  if [ -f yarn.lock ]; then yarn install --frozen-lockfile --production; \\
  elif [ -f pnpm-lock.yaml ]; then corepack enable pnpm && pnpm install --frozen-lockfile --prod; \\
  elif [ -f package-lock.json ]; then npm ci --omit=dev; \\
  else npm install --omit=dev; \\
  fi

# ============ Stage 2: Build ============
FROM node:20-alpine AS builder

WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

RUN \\
  if [ -f yarn.lock ]; then yarn build; \\
  elif [ -f pnpm-lock.yaml ]; then corepack enable pnpm && pnpm run build; \\
  else npm run build --if-present; \\
  fi

# ============ Stage 3: Production ============
FROM node:20-alpine AS runner

LABEL maintainer="your-team@example.com"
LABEL org.opencontainers.image.source="https://github.com/your-org/your-app"

# Security: non-root user
RUN addgroup --system --gid 1001 appgroup && \\
    adduser --system --uid 1001 --ingroup appgroup appuser

# Install tini for proper signal handling
RUN apk add --no-cache tini curl

WORKDIR /app

# Copy production dependencies
COPY --from=deps --chown=appuser:appgroup /app/node_modules ./node_modules

# Copy built application
COPY --from=builder --chown=appuser:appgroup /app/dist ./dist
COPY --from=builder --chown=appuser:appgroup /app/package.json ./package.json

# Environment
ENV NODE_ENV=production
ENV PORT=3000

# Switch to non-root user
USER appuser

EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \\
  CMD curl -f http://localhost:3000/healthz || exit 1

# Use tini as PID 1
ENTRYPOINT ["/sbin/tini", "--"]

CMD ["node", "dist/index.js"]
`;

// ─── .dockerignore ───
const dockerignore = `
# Dependencies
node_modules
npm-debug.log*
yarn-debug.log*
yarn-error.log*

# Build
dist
build
.next

# IDE
.vscode
.idea
*.swp
*.swo

# Git
.git
.gitignore

# Docker
Dockerfile*
docker-compose*
.dockerignore

# CI/CD
.github
.gitlab-ci.yml
Jenkinsfile

# Testing
coverage
.nyc_output
junit.xml

# Env
.env
.env.*
!.env.example

# OS
.DS_Store
Thumbs.db

# Docs
*.md
LICENSE
`;

// ─── docker-compose.yml (full dev stack) ───
const dockerCompose = `
services:
  # ─── Application ───
  app:
    build:
      context: .
      dockerfile: Dockerfile
      target: runner
    container_name: app
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
      - PORT=3000
      - DATABASE_URL=postgresql://postgres:postgres@postgres:5432/app_db
      - REDIS_URL=redis://redis:6379
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
    restart: unless-stopped
    networks:
      - app-network
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/healthz"]
      interval: 30s
      timeout: 5s
      retries: 3
      start_period: 10s
    deploy:
      resources:
        limits:
          cpus: "1.0"
          memory: 512M
        reservations:
          cpus: "0.25"
          memory: 128M

  # ─── PostgreSQL ───
  postgres:
    image: postgres:16-alpine
    container_name: postgres
    ports:
      - "5432:5432"
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
      POSTGRES_DB: app_db
      PGDATA: /var/lib/postgresql/data/pgdata
    volumes:
      - postgres_data:/var/lib/postgresql/data
      - ./scripts/init-db.sql:/docker-entrypoint-initdb.d/init.sql:ro
    restart: unless-stopped
    networks:
      - app-network
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 10s
      timeout: 5s
      retries: 5

  # ─── Redis ───
  redis:
    image: redis:7-alpine
    container_name: redis
    ports:
      - "6379:6379"
    command: redis-server --appendonly yes --maxmemory 256mb --maxmemory-policy allkeys-lru
    volumes:
      - redis_data:/data
    restart: unless-stopped
    networks:
      - app-network
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 5s
      retries: 5

  # ─── Nginx reverse proxy ───
  nginx:
    image: nginx:alpine
    container_name: nginx
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx/default.conf:/etc/nginx/conf.d/default.conf:ro
      - ./nginx/ssl:/etc/nginx/ssl:ro
    depends_on:
      app:
        condition: service_healthy
    restart: unless-stopped
    networks:
      - app-network

  # ─── Adminer (DB management UI) ───
  adminer:
    image: adminer:latest
    container_name: adminer
    ports:
      - "8080:8080"
    depends_on:
      - postgres
    restart: unless-stopped
    networks:
      - app-network
    profiles:
      - debug

  # ─── Redis Commander (Redis UI) ───
  redis-commander:
    image: rediscommander/redis-commander:latest
    container_name: redis-commander
    ports:
      - "8081:8081"
    environment:
      - REDIS_HOSTS=local:redis:6379
    depends_on:
      - redis
    restart: unless-stopped
    networks:
      - app-network
    profiles:
      - debug

volumes:
  postgres_data:
    driver: local
  redis_data:
    driver: local

networks:
  app-network:
    driver: bridge
`;

// ─── docker-compose.dev.yml (development overrides) ───
const dockerComposeDev = `
services:
  app:
    build:
      target: builder
    volumes:
      - .:/app
      - /app/node_modules
    environment:
      - NODE_ENV=development
    command: npm run dev
    ports:
      - "3000:3000"
      - "9229:9229"  # Node.js debugger

  postgres:
    ports:
      - "5432:5432"

  redis:
    ports:
      - "6379:6379"
`;

// ─── docker-compose.test.yml (testing) ───
const dockerComposeTest = `
services:
  app:
    build:
      target: builder
    environment:
      - NODE_ENV=test
      - DATABASE_URL=postgresql://postgres:postgres@postgres:5432/app_test_db
      - REDIS_URL=redis://redis:6379/1
    command: npm test
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy

  postgres:
    environment:
      POSTGRES_DB: app_test_db
    tmpfs:
      - /var/lib/postgresql/data

  redis:
    command: redis-server --appendonly no
    tmpfs:
      - /data
`;

const files = [
  { name: "Dockerfile", content: dockerfile },
  { name: ".dockerignore", content: dockerignore },
  { name: "docker-compose.yml", content: dockerCompose },
  { name: "docker-compose.dev.yml", content: dockerComposeDev },
  { name: "docker-compose.test.yml", content: dockerComposeTest },
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
🚀 Docker setup done!

Usage:
  docker compose up -d                           # Production
  docker compose -f docker-compose.yml -f docker-compose.dev.yml up   # Development
  docker compose -f docker-compose.yml -f docker-compose.test.yml up  # Testing
  docker compose --profile debug up -d           # With Adminer + Redis Commander
`);
