# DevOps Config Generator

Bộ công cụ MJS tạo nhanh các file cấu hình DevOps/Infrastructure production-ready cho dự án Node.js.

## Yêu cầu

- Node.js >= 18

## Sử dụng

```bash
# Xem danh sách generators
node index.mjs --list

# Chạy tất cả
node index.mjs --all

# Chạy từng cái
node index.mjs dockerfile github-actions k8s

# Kết hợp tùy ý
node index.mjs dockerfile nginx terraform
```

> Các file đã tồn tại sẽ **không bị ghi đè** (hiện cảnh báo ⚠️).

## Generators

| Command | File | Output |
|---|---|---|
| `dockerfile` | `make-dockerfile.mjs` | `Dockerfile` (multi-stage), `.dockerignore`, `docker-compose.yml` (App + Postgres + Redis + Nginx), `docker-compose.dev.yml`, `docker-compose.test.yml` |
| `github-actions` | `make-github-actions.mjs` | `.github/workflows/` (CI, Deploy, Release, CodeQL, Dependency Review, PR Labeler, Stale), `.github/dependabot.yml`, `.github/labeler.yml` |
| `gitlab-ci` | `make-gitlab-ci.mjs` | `.gitlab-ci.yml` (validate → test → security → build → staging → production, SAST, Trivy, rollback) |
| `k8s` | `make-k8s.mjs` | `k8s/` (20 manifests: namespace, RBAC, deployment, service, ingress, HPA, PDB, NetworkPolicy, PVC, CronJobs, ResourceQuota, LimitRange, Kustomize overlays) |
| `helm` | `make-helm.mjs` | `helm/app/` (18 files: full Helm chart với templates, values base/staging/production, NOTES.txt, tests) |
| `jenkins` | `make-jenkinsfile.mjs` | `Jenkinsfile` (K8s pod agent, parallel stages, SonarQube, Trivy, Slack notifications, manual approval) |
| `nginx` | `make-nginx.mjs` | `nginx/` (nginx.conf, default.conf, Dockerfile, generate-ssl.sh — rate limiting, upstream LB, proxy cache, WebSocket, SSL) |
| `terraform` | `make-terraform.mjs` | `terraform/` (14 files: VPC 3-tier, ALB, ECS Fargate + Spot, RDS PostgreSQL, ElastiCache Redis, ACM + Route53, CloudWatch alarms, IAM) |

## Chi tiết từng Generator

### Docker (`dockerfile`)

```bash
node index.mjs dockerfile
```

- **Dockerfile**: Multi-stage build (deps → builder → runner), non-root user, tini, HEALTHCHECK
- **docker-compose.yml**: App + PostgreSQL 16 + Redis 7 + Nginx + Adminer + Redis Commander
- **docker-compose.dev.yml**: Hot reload, Node.js debugger (port 9229)
- **docker-compose.test.yml**: tmpfs cho DB/Redis, test database riêng

```bash
docker compose up -d                                            # Production
docker compose -f docker-compose.yml -f docker-compose.dev.yml up  # Development
docker compose --profile debug up -d                            # + Adminer & Redis Commander
```

### GitHub Actions (`github-actions`)

```bash
node index.mjs github-actions
```

| Workflow | Mô tả |
|---|---|
| `ci.yml` | Lint, typecheck, test matrix (Node 18/20/22) với Postgres + Redis services, build, E2E (Playwright) |
| `deploy.yml` | Docker Buildx multi-platform, GHA cache, deploy staging → production |
| `release.yml` | Tag-based release, changelog, npm publish |
| `codeql.yml` | Security scanning (weekly + on push) |
| `dependency-review.yml` | PR dependency audit, license check |
| `labeler.yml` | Auto-label PRs theo file paths |
| `stale.yml` | Auto-close stale issues/PRs |

### GitLab CI (`gitlab-ci`)

```bash
node index.mjs gitlab-ci
```

6 stages: `validate` → `test` → `security` → `build` → `deploy-staging` → `deploy-production`

- **Security**: SAST, secret detection, container scanning (Trivy), license scanning
- **Test**: Unit (Postgres + Redis), integration, E2E (Playwright)
- **Deploy**: Auto staging (auto-stop 1 week), manual production, rollback support

### Kubernetes (`k8s`)

```bash
node index.mjs k8s
```

20 manifest files với Kustomize:

- Core: Namespace, ServiceAccount, RBAC (Role + RoleBinding)
- App: Deployment (securityContext, topologySpread, initContainers, probes, lifecycle), Service, Ingress
- Scaling: HPA (with behavior), PDB
- Security: NetworkPolicy (ingress/egress rules)
- Storage: PVC
- Jobs: CronJob cleanup + DB backup
- Governance: ResourceQuota, LimitRange
- Overlays: `staging/` (1 replica), `production/` (3 replicas, HPA max 20)

```bash
kubectl apply -k k8s/                        # Base
kubectl apply -k k8s/overlays/staging/       # Staging
kubectl apply -k k8s/overlays/production/    # Production
```

### Helm (`helm`)

```bash
node index.mjs helm
```

Full Helm chart (18 files):

- Templates: ServiceAccount, Deployment (checksum annotations), ConfigMap, Secret, Ingress, HPA, PDB, NetworkPolicy, CronJob, NOTES.txt
- Tests: test-connection pod
- Values: `values.yaml` (base), `values-staging.yaml`, `values-production.yaml`

```bash
helm install app ./helm/app                                     # Default
helm install app ./helm/app -f helm/app/values-staging.yaml     # Staging
helm install app ./helm/app -f helm/app/values-production.yaml  # Production
helm test app                                                   # Run tests
```

### Jenkins (`jenkins`)

```bash
node index.mjs jenkins
```

- Kubernetes Pod agent (node + docker + kubectl containers)
- Parallel stages: Lint / Type Check / Format, Unit / Integration tests
- SonarQube analysis + Quality Gate
- Docker build + Trivy security scan
- Slack notifications (success / failure / unstable)
- Manual production approval với submitter whitelist

### Nginx (`nginx`)

```bash
node index.mjs nginx
```

- **nginx.conf**: Worker tuning, gzip, rate limiting zones (general/api/login/upload), proxy cache paths, upstream load balancing (least_conn), CloudFlare real IP, JSON structured logging
- **default.conf**: SSL (TLS 1.2+, OCSP stapling, HSTS, CSP), per-endpoint rate limits, WebSocket (`/ws`), CORS, upload endpoint, internal metrics, deny dotfiles/sensitive files
- **Dockerfile**: Production Nginx image
- **generate-ssl.sh**: Self-signed SSL cho development

### Terraform (`terraform`)

```bash
node index.mjs terraform
```

14 files — full AWS infrastructure:

| File | Resources |
|---|---|
| `main.tf` | Provider, S3 backend, data sources |
| `variables.tf` | All variables với defaults |
| `vpc.tf` | VPC, 3-tier subnets, NAT Gateway per AZ, IGW, route tables, flow logs |
| `security-groups.tf` | ALB, App, Database, Redis SGs |
| `alb.tf` | ALB, HTTPS listener, HTTP→HTTPS redirect, target group, S3 access logs |
| `iam.tf` | ECS execution role, task role (S3, SQS, Secrets Manager) |
| `ecs.tf` | Cluster, Fargate + Spot, task definition, service, auto-scaling, ECR + lifecycle |
| `rds.tf` | PostgreSQL 16, encrypted, multi-AZ, performance insights, Secrets Manager |
| `redis.tf` | ElastiCache Redis 7.1, encrypted, auth token, failover |
| `acm.tf` | SSL certificate, Route53 DNS validation, A records |
| `monitoring.tf` | 6 CloudWatch alarms + SNS alerts |
| `outputs.tf` | All resource IDs and endpoints |

```bash
cd terraform
terraform init
terraform plan -var-file=terraform.tfvars
terraform apply -var-file=terraform.tfvars
```

## Tùy chỉnh

Sau khi generate, chỉnh sửa các giá trị placeholder:

- `your-org/your-app` → tên org/repo thực tế
- `example.com` → domain thực tế
- `app.example.com` → subdomain thực tế
- `alerts@example.com` → email nhận alerts
- Credentials, API keys, database passwords → giá trị thực tế (sử dụng secrets management)

## License

MIT
