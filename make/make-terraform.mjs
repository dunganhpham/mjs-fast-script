import { writeFileSync, existsSync, mkdirSync } from "fs";
import { resolve } from "path";
if (process.argv[2]) process.chdir(resolve(process.argv[2]));

// ─── main.tf ───
const mainTf = `
terraform {
  required_version = ">= 1.5"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }

  backend "s3" {
    bucket         = "your-terraform-state"
    key            = "app/terraform.tfstate"
    region         = "ap-southeast-1"
    dynamodb_table = "terraform-locks"
    encrypt        = true
  }
}

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Environment = var.environment
      ManagedBy   = "terraform"
      Project     = var.project_name
    }
  }
}

# Data sources
data "aws_availability_zones" "available" {
  state = "available"
}

data "aws_caller_identity" "current" {}
data "aws_region" "current" {}
`;

// ─── variables.tf ───
const variablesTf = `
# ─── General ───
variable "aws_region" {
  description = "AWS region"
  type        = string
  default     = "ap-southeast-1"
}

variable "environment" {
  description = "Environment name (staging, production)"
  type        = string
  default     = "production"
}

variable "project_name" {
  description = "Project name used for resource naming"
  type        = string
  default     = "my-app"
}

# ─── Networking ───
variable "vpc_cidr" {
  description = "VPC CIDR block"
  type        = string
  default     = "10.0.0.0/16"
}

variable "public_subnet_cidrs" {
  description = "Public subnet CIDR blocks"
  type        = list(string)
  default     = ["10.0.1.0/24", "10.0.2.0/24", "10.0.3.0/24"]
}

variable "private_subnet_cidrs" {
  description = "Private subnet CIDR blocks"
  type        = list(string)
  default     = ["10.0.10.0/24", "10.0.20.0/24", "10.0.30.0/24"]
}

variable "database_subnet_cidrs" {
  description = "Database subnet CIDR blocks"
  type        = list(string)
  default     = ["10.0.100.0/24", "10.0.200.0/24"]
}

# ─── ECS ───
variable "container_port" {
  description = "Container port"
  type        = number
  default     = 3000
}

variable "desired_count" {
  description = "Number of ECS tasks"
  type        = number
  default     = 2
}

variable "cpu" {
  description = "Fargate CPU units (256, 512, 1024, 2048, 4096)"
  type        = number
  default     = 256
}

variable "memory" {
  description = "Fargate memory in MB"
  type        = number
  default     = 512
}

variable "min_capacity" {
  description = "Minimum number of ECS tasks"
  type        = number
  default     = 2
}

variable "max_capacity" {
  description = "Maximum number of ECS tasks"
  type        = number
  default     = 10
}

# ─── Database ───
variable "db_instance_class" {
  description = "RDS instance class"
  type        = string
  default     = "db.t4g.micro"
}

variable "db_allocated_storage" {
  description = "RDS allocated storage in GB"
  type        = number
  default     = 20
}

variable "db_name" {
  description = "Database name"
  type        = string
  default     = "app_db"
}

variable "db_username" {
  description = "Database master username"
  type        = string
  default     = "admin"
  sensitive   = true
}

# ─── Cache ───
variable "redis_node_type" {
  description = "ElastiCache Redis node type"
  type        = string
  default     = "cache.t4g.micro"
}

# ─── Domain ───
variable "domain_name" {
  description = "Main domain name"
  type        = string
  default     = "example.com"
}

variable "hosted_zone_id" {
  description = "Route53 hosted zone ID (leave empty to create new)"
  type        = string
  default     = ""
}
`;

// ─── vpc.tf ───
const vpcTf = `
# ═══════════ VPC ═══════════

resource "aws_vpc" "main" {
  cidr_block           = var.vpc_cidr
  enable_dns_hostnames = true
  enable_dns_support   = true

  tags = { Name = "\${var.project_name}-\${var.environment}-vpc" }
}

# ─── Internet Gateway ───
resource "aws_internet_gateway" "main" {
  vpc_id = aws_vpc.main.id
  tags   = { Name = "\${var.project_name}-\${var.environment}-igw" }
}

# ─── NAT Gateway (1 per AZ for HA, or 1 shared for cost saving) ───
resource "aws_eip" "nat" {
  count  = length(var.public_subnet_cidrs)
  domain = "vpc"
  tags   = { Name = "\${var.project_name}-\${var.environment}-nat-eip-\${count.index}" }
}

resource "aws_nat_gateway" "main" {
  count         = length(var.public_subnet_cidrs)
  allocation_id = aws_eip.nat[count.index].id
  subnet_id     = aws_subnet.public[count.index].id

  tags = { Name = "\${var.project_name}-\${var.environment}-nat-\${count.index}" }

  depends_on = [aws_internet_gateway.main]
}

# ═══════════ SUBNETS ═══════════

# ─── Public subnets ───
resource "aws_subnet" "public" {
  count                   = length(var.public_subnet_cidrs)
  vpc_id                  = aws_vpc.main.id
  cidr_block              = var.public_subnet_cidrs[count.index]
  availability_zone       = data.aws_availability_zones.available.names[count.index]
  map_public_ip_on_launch = true

  tags = {
    Name = "\${var.project_name}-\${var.environment}-public-\${count.index}"
    Tier = "public"
  }
}

# ─── Private subnets (app) ───
resource "aws_subnet" "private" {
  count             = length(var.private_subnet_cidrs)
  vpc_id            = aws_vpc.main.id
  cidr_block        = var.private_subnet_cidrs[count.index]
  availability_zone = data.aws_availability_zones.available.names[count.index]

  tags = {
    Name = "\${var.project_name}-\${var.environment}-private-\${count.index}"
    Tier = "private"
  }
}

# ─── Database subnets ───
resource "aws_subnet" "database" {
  count             = length(var.database_subnet_cidrs)
  vpc_id            = aws_vpc.main.id
  cidr_block        = var.database_subnet_cidrs[count.index]
  availability_zone = data.aws_availability_zones.available.names[count.index]

  tags = {
    Name = "\${var.project_name}-\${var.environment}-database-\${count.index}"
    Tier = "database"
  }
}

# ═══════════ ROUTE TABLES ═══════════

# ─── Public route table ───
resource "aws_route_table" "public" {
  vpc_id = aws_vpc.main.id
  tags   = { Name = "\${var.project_name}-\${var.environment}-public-rt" }
}

resource "aws_route" "public_internet" {
  route_table_id         = aws_route_table.public.id
  destination_cidr_block = "0.0.0.0/0"
  gateway_id             = aws_internet_gateway.main.id
}

resource "aws_route_table_association" "public" {
  count          = length(aws_subnet.public)
  subnet_id      = aws_subnet.public[count.index].id
  route_table_id = aws_route_table.public.id
}

# ─── Private route tables ───
resource "aws_route_table" "private" {
  count  = length(var.private_subnet_cidrs)
  vpc_id = aws_vpc.main.id
  tags   = { Name = "\${var.project_name}-\${var.environment}-private-rt-\${count.index}" }
}

resource "aws_route" "private_nat" {
  count                  = length(var.private_subnet_cidrs)
  route_table_id         = aws_route_table.private[count.index].id
  destination_cidr_block = "0.0.0.0/0"
  nat_gateway_id         = aws_nat_gateway.main[count.index].id
}

resource "aws_route_table_association" "private" {
  count          = length(aws_subnet.private)
  subnet_id      = aws_subnet.private[count.index].id
  route_table_id = aws_route_table.private[count.index].id
}

# ─── Database route table (no internet) ───
resource "aws_route_table" "database" {
  vpc_id = aws_vpc.main.id
  tags   = { Name = "\${var.project_name}-\${var.environment}-database-rt" }
}

resource "aws_route_table_association" "database" {
  count          = length(aws_subnet.database)
  subnet_id      = aws_subnet.database[count.index].id
  route_table_id = aws_route_table.database.id
}

# ─── DB Subnet Group ───
resource "aws_db_subnet_group" "main" {
  name       = "\${var.project_name}-\${var.environment}"
  subnet_ids = aws_subnet.database[*].id
  tags       = { Name = "\${var.project_name}-\${var.environment}-db-subnet-group" }
}

# ─── ElastiCache Subnet Group ───
resource "aws_elasticache_subnet_group" "main" {
  name       = "\${var.project_name}-\${var.environment}"
  subnet_ids = aws_subnet.private[*].id
}

# ═══════════ VPC FLOW LOGS ═══════════

resource "aws_flow_log" "main" {
  iam_role_arn    = aws_iam_role.vpc_flow_log.arn
  log_destination = aws_cloudwatch_log_group.vpc_flow_log.arn
  traffic_type    = "ALL"
  vpc_id          = aws_vpc.main.id
}

resource "aws_cloudwatch_log_group" "vpc_flow_log" {
  name              = "/vpc/\${var.project_name}-\${var.environment}/flow-log"
  retention_in_days = 30
}

resource "aws_iam_role" "vpc_flow_log" {
  name = "\${var.project_name}-\${var.environment}-vpc-flow-log"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "vpc-flow-logs.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
}

resource "aws_iam_role_policy" "vpc_flow_log" {
  name = "vpc-flow-log"
  role = aws_iam_role.vpc_flow_log.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Action = [
        "logs:CreateLogGroup",
        "logs:CreateLogStream",
        "logs:PutLogEvents",
        "logs:DescribeLogGroups",
        "logs:DescribeLogStreams"
      ]
      Resource = "*"
    }]
  })
}
`;

// ─── security-groups.tf ───
const sgTf = `
# ═══════════ SECURITY GROUPS ═══════════

# ─── ALB Security Group ───
resource "aws_security_group" "alb" {
  name_prefix = "\${var.project_name}-\${var.environment}-alb-"
  vpc_id      = aws_vpc.main.id
  description = "ALB security group"

  ingress {
    description = "HTTP"
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    description = "HTTPS"
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = { Name = "\${var.project_name}-\${var.environment}-alb-sg" }

  lifecycle {
    create_before_destroy = true
  }
}

# ─── ECS App Security Group ───
resource "aws_security_group" "app" {
  name_prefix = "\${var.project_name}-\${var.environment}-app-"
  vpc_id      = aws_vpc.main.id
  description = "ECS app security group"

  ingress {
    description     = "From ALB"
    from_port       = var.container_port
    to_port         = var.container_port
    protocol        = "tcp"
    security_groups = [aws_security_group.alb.id]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = { Name = "\${var.project_name}-\${var.environment}-app-sg" }

  lifecycle {
    create_before_destroy = true
  }
}

# ─── Database Security Group ───
resource "aws_security_group" "database" {
  name_prefix = "\${var.project_name}-\${var.environment}-db-"
  vpc_id      = aws_vpc.main.id
  description = "RDS database security group"

  ingress {
    description     = "PostgreSQL from app"
    from_port       = 5432
    to_port         = 5432
    protocol        = "tcp"
    security_groups = [aws_security_group.app.id]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = { Name = "\${var.project_name}-\${var.environment}-db-sg" }

  lifecycle {
    create_before_destroy = true
  }
}

# ─── Redis Security Group ───
resource "aws_security_group" "redis" {
  name_prefix = "\${var.project_name}-\${var.environment}-redis-"
  vpc_id      = aws_vpc.main.id
  description = "ElastiCache Redis security group"

  ingress {
    description     = "Redis from app"
    from_port       = 6379
    to_port         = 6379
    protocol        = "tcp"
    security_groups = [aws_security_group.app.id]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = { Name = "\${var.project_name}-\${var.environment}-redis-sg" }

  lifecycle {
    create_before_destroy = true
  }
}
`;

// ─── alb.tf ───
const albTf = `
# ═══════════ APPLICATION LOAD BALANCER ═══════════

resource "aws_lb" "main" {
  name               = "\${var.project_name}-\${var.environment}"
  internal           = false
  load_balancer_type = "application"
  security_groups    = [aws_security_group.alb.id]
  subnets            = aws_subnet.public[*].id

  enable_deletion_protection = var.environment == "production"
  enable_http2               = true
  idle_timeout               = 60

  access_logs {
    bucket  = aws_s3_bucket.alb_logs.id
    prefix  = "alb"
    enabled = true
  }

  tags = { Name = "\${var.project_name}-\${var.environment}-alb" }
}

# ─── ALB Log Bucket ───
resource "aws_s3_bucket" "alb_logs" {
  bucket = "\${var.project_name}-\${var.environment}-alb-logs-\${data.aws_caller_identity.current.account_id}"

  tags = { Name = "\${var.project_name}-\${var.environment}-alb-logs" }
}

resource "aws_s3_bucket_lifecycle_configuration" "alb_logs" {
  bucket = aws_s3_bucket.alb_logs.id

  rule {
    id     = "expire-logs"
    status = "Enabled"

    expiration {
      days = 90
    }
  }
}

resource "aws_s3_bucket_policy" "alb_logs" {
  bucket = aws_s3_bucket.alb_logs.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { AWS = "arn:aws:iam::114774131450:root" }  # ap-southeast-1 ALB account
      Action    = "s3:PutObject"
      Resource  = "\${aws_s3_bucket.alb_logs.arn}/alb/*"
    }]
  })
}

# ─── HTTPS Listener ───
resource "aws_lb_listener" "https" {
  load_balancer_arn = aws_lb.main.arn
  port              = "443"
  protocol          = "HTTPS"
  ssl_policy        = "ELBSecurityPolicy-TLS13-1-2-2021-06"
  certificate_arn   = aws_acm_certificate_validation.main.certificate_arn

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.app.arn
  }
}

# ─── HTTP → HTTPS redirect ───
resource "aws_lb_listener" "http" {
  load_balancer_arn = aws_lb.main.arn
  port              = "80"
  protocol          = "HTTP"

  default_action {
    type = "redirect"
    redirect {
      port        = "443"
      protocol    = "HTTPS"
      status_code = "HTTP_301"
    }
  }
}

# ─── Target Group ───
resource "aws_lb_target_group" "app" {
  name        = "\${var.project_name}-\${var.environment}"
  port        = var.container_port
  protocol    = "HTTP"
  vpc_id      = aws_vpc.main.id
  target_type = "ip"

  deregistration_delay = 30

  health_check {
    enabled             = true
    healthy_threshold   = 2
    unhealthy_threshold = 3
    interval            = 15
    timeout             = 5
    path                = "/healthz"
    port                = "traffic-port"
    protocol            = "HTTP"
    matcher             = "200"
  }

  stickiness {
    type    = "lb_cookie"
    enabled = false
  }

  tags = { Name = "\${var.project_name}-\${var.environment}-tg" }
}
`;

// ─── iam.tf ───
const iamTf = `
# ═══════════ IAM ROLES ═══════════

# ─── ECS Task Execution Role ───
resource "aws_iam_role" "ecs_execution" {
  name = "\${var.project_name}-\${var.environment}-ecs-execution"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "ecs-tasks.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
}

resource "aws_iam_role_policy_attachment" "ecs_execution" {
  role       = aws_iam_role.ecs_execution.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

# Allow pulling from ECR and reading secrets
resource "aws_iam_role_policy" "ecs_execution_extra" {
  name = "ecs-execution-extra"
  role = aws_iam_role.ecs_execution.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "secretsmanager:GetSecretValue",
          "ssm:GetParameters",
          "ssm:GetParameter"
        ]
        Resource = [
          "arn:aws:secretsmanager:\${data.aws_region.current.name}:\${data.aws_caller_identity.current.account_id}:secret:\${var.project_name}/*",
          "arn:aws:ssm:\${data.aws_region.current.name}:\${data.aws_caller_identity.current.account_id}:parameter/\${var.project_name}/*"
        ]
      },
      {
        Effect = "Allow"
        Action = ["kms:Decrypt"]
        Resource = ["*"]
        Condition = {
          StringEquals = {
            "kms:ViaService" = "secretsmanager.\${data.aws_region.current.name}.amazonaws.com"
          }
        }
      }
    ]
  })
}

# ─── ECS Task Role (app permissions) ───
resource "aws_iam_role" "ecs_task" {
  name = "\${var.project_name}-\${var.environment}-ecs-task"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "ecs-tasks.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
}

resource "aws_iam_role_policy" "ecs_task" {
  name = "ecs-task-permissions"
  role = aws_iam_role.ecs_task.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["s3:GetObject", "s3:PutObject", "s3:ListBucket"]
        Resource = ["arn:aws:s3:::\${var.project_name}-*", "arn:aws:s3:::\${var.project_name}-*/*"]
      },
      {
        Effect   = "Allow"
        Action   = ["sqs:SendMessage", "sqs:ReceiveMessage", "sqs:DeleteMessage"]
        Resource = ["arn:aws:sqs:\${data.aws_region.current.name}:\${data.aws_caller_identity.current.account_id}:\${var.project_name}-*"]
      }
    ]
  })
}
`;

// ─── ecs.tf ───
const ecsTf = `
# ═══════════ ECS ═══════════

resource "aws_ecs_cluster" "main" {
  name = "\${var.project_name}-\${var.environment}"

  setting {
    name  = "containerInsights"
    value = "enabled"
  }

  configuration {
    execute_command_configuration {
      logging = "OVERRIDE"
      log_configuration {
        cloud_watch_log_group_name = aws_cloudwatch_log_group.ecs_exec.name
      }
    }
  }
}

resource "aws_ecs_cluster_capacity_providers" "main" {
  cluster_name       = aws_ecs_cluster.main.name
  capacity_providers = ["FARGATE", "FARGATE_SPOT"]

  default_capacity_provider_strategy {
    capacity_provider = "FARGATE"
    weight            = 1
    base              = var.min_capacity
  }

  default_capacity_provider_strategy {
    capacity_provider = "FARGATE_SPOT"
    weight            = 3
  }
}

# ─── Task Definition ───
resource "aws_ecs_task_definition" "app" {
  family                   = "\${var.project_name}-\${var.environment}"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = var.cpu
  memory                   = var.memory
  execution_role_arn       = aws_iam_role.ecs_execution.arn
  task_role_arn            = aws_iam_role.ecs_task.arn

  container_definitions = jsonencode([
    {
      name      = "app"
      image     = "\${aws_ecr_repository.app.repository_url}:latest"
      essential = true

      portMappings = [{
        containerPort = var.container_port
        protocol      = "tcp"
      }]

      environment = [
        { name = "NODE_ENV", value = var.environment },
        { name = "PORT", value = tostring(var.container_port) },
      ]

      secrets = [
        { name = "DATABASE_URL", valueFrom = aws_secretsmanager_secret.db_url.arn },
        { name = "REDIS_URL", valueFrom = aws_secretsmanager_secret.redis_url.arn },
      ]

      healthCheck = {
        command     = ["CMD-SHELL", "curl -f http://localhost:\${var.container_port}/healthz || exit 1"]
        interval    = 30
        timeout     = 5
        retries     = 3
        startPeriod = 60
      }

      logConfiguration = {
        logDriver = "awslogs"
        options = {
          "awslogs-group"         = aws_cloudwatch_log_group.app.name
          "awslogs-region"        = var.aws_region
          "awslogs-stream-prefix" = "app"
        }
      }
    }
  ])
}

# ─── ECS Service ───
resource "aws_ecs_service" "app" {
  name            = "\${var.project_name}-\${var.environment}"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.app.arn
  desired_count   = var.desired_count

  enable_execute_command = true

  capacity_provider_strategy {
    capacity_provider = "FARGATE"
    weight            = 1
    base              = var.min_capacity
  }

  capacity_provider_strategy {
    capacity_provider = "FARGATE_SPOT"
    weight            = 3
  }

  network_configuration {
    subnets          = aws_subnet.private[*].id
    security_groups  = [aws_security_group.app.id]
    assign_public_ip = false
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.app.arn
    container_name   = "app"
    container_port   = var.container_port
  }

  deployment_circuit_breaker {
    enable   = true
    rollback = true
  }

  deployment_maximum_percent         = 200
  deployment_minimum_healthy_percent = 100
  health_check_grace_period_seconds  = 60

  lifecycle {
    ignore_changes = [desired_count, task_definition]
  }
}

# ─── ECR Repository ───
resource "aws_ecr_repository" "app" {
  name                 = "\${var.project_name}-\${var.environment}"
  image_tag_mutability = "MUTABLE"

  image_scanning_configuration {
    scan_on_push = true
  }

  encryption_configuration {
    encryption_type = "AES256"
  }
}

resource "aws_ecr_lifecycle_policy" "app" {
  repository = aws_ecr_repository.app.name

  policy = jsonencode({
    rules = [
      {
        rulePriority = 1
        description  = "Keep last 20 images"
        selection = {
          tagStatus   = "any"
          countType   = "imageCountMoreThan"
          countNumber = 20
        }
        action = { type = "expire" }
      }
    ]
  })
}

# ─── Auto Scaling ───
resource "aws_appautoscaling_target" "ecs" {
  max_capacity       = var.max_capacity
  min_capacity       = var.min_capacity
  resource_id        = "service/\${aws_ecs_cluster.main.name}/\${aws_ecs_service.app.name}"
  scalable_dimension = "ecs:service:DesiredCount"
  service_namespace  = "ecs"
}

resource "aws_appautoscaling_policy" "cpu" {
  name               = "\${var.project_name}-\${var.environment}-cpu"
  policy_type        = "TargetTrackingScaling"
  resource_id        = aws_appautoscaling_target.ecs.resource_id
  scalable_dimension = aws_appautoscaling_target.ecs.scalable_dimension
  service_namespace  = aws_appautoscaling_target.ecs.service_namespace

  target_tracking_scaling_policy_configuration {
    predefined_metric_specification {
      predefined_metric_type = "ECSServiceAverageCPUUtilization"
    }
    target_value       = 70
    scale_in_cooldown  = 300
    scale_out_cooldown = 60
  }
}

resource "aws_appautoscaling_policy" "memory" {
  name               = "\${var.project_name}-\${var.environment}-memory"
  policy_type        = "TargetTrackingScaling"
  resource_id        = aws_appautoscaling_target.ecs.resource_id
  scalable_dimension = aws_appautoscaling_target.ecs.scalable_dimension
  service_namespace  = aws_appautoscaling_target.ecs.service_namespace

  target_tracking_scaling_policy_configuration {
    predefined_metric_specification {
      predefined_metric_type = "ECSServiceAverageMemoryUtilization"
    }
    target_value       = 80
    scale_in_cooldown  = 300
    scale_out_cooldown = 60
  }
}

# ─── CloudWatch Log Groups ───
resource "aws_cloudwatch_log_group" "app" {
  name              = "/ecs/\${var.project_name}-\${var.environment}/app"
  retention_in_days = 30
}

resource "aws_cloudwatch_log_group" "ecs_exec" {
  name              = "/ecs/\${var.project_name}-\${var.environment}/exec"
  retention_in_days = 7
}
`;

// ─── rds.tf ───
const rdsTf = `
# ═══════════ RDS (PostgreSQL) ═══════════

resource "aws_db_instance" "main" {
  identifier     = "\${var.project_name}-\${var.environment}"
  engine         = "postgres"
  engine_version = "16.2"
  instance_class = var.db_instance_class

  allocated_storage     = var.db_allocated_storage
  max_allocated_storage = var.db_allocated_storage * 4
  storage_type          = "gp3"
  storage_encrypted     = true

  db_name  = var.db_name
  username = var.db_username
  password = random_password.db_password.result

  db_subnet_group_name   = aws_db_subnet_group.main.name
  vpc_security_group_ids = [aws_security_group.database.id]

  multi_az            = var.environment == "production"
  publicly_accessible = false

  backup_retention_period = 7
  backup_window           = "03:00-04:00"
  maintenance_window      = "Mon:04:00-Mon:05:00"

  deletion_protection       = var.environment == "production"
  skip_final_snapshot       = var.environment != "production"
  final_snapshot_identifier = var.environment == "production" ? "\${var.project_name}-\${var.environment}-final" : null

  performance_insights_enabled = true
  monitoring_interval          = 60
  monitoring_role_arn          = aws_iam_role.rds_monitoring.arn

  tags = { Name = "\${var.project_name}-\${var.environment}-db" }
}

resource "random_password" "db_password" {
  length  = 32
  special = true
}

# ─── Store DB URL in Secrets Manager ───
resource "aws_secretsmanager_secret" "db_url" {
  name = "\${var.project_name}/\${var.environment}/database-url"
}

resource "aws_secretsmanager_secret_version" "db_url" {
  secret_id     = aws_secretsmanager_secret.db_url.id
  secret_string = "postgresql://\${var.db_username}:\${random_password.db_password.result}@\${aws_db_instance.main.endpoint}/\${var.db_name}"
}

# ─── RDS Enhanced Monitoring Role ───
resource "aws_iam_role" "rds_monitoring" {
  name = "\${var.project_name}-\${var.environment}-rds-monitoring"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "monitoring.rds.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
}

resource "aws_iam_role_policy_attachment" "rds_monitoring" {
  role       = aws_iam_role.rds_monitoring.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonRDSEnhancedMonitoringRole"
}
`;

// ─── redis.tf ───
const redisTf = `
# ═══════════ ELASTICACHE (Redis) ═══════════

resource "aws_elasticache_replication_group" "main" {
  replication_group_id = "\${var.project_name}-\${var.environment}"
  description          = "Redis for \${var.project_name} \${var.environment}"

  engine               = "redis"
  engine_version       = "7.1"
  node_type            = var.redis_node_type
  num_cache_clusters   = var.environment == "production" ? 2 : 1
  parameter_group_name = "default.redis7"

  port               = 6379
  subnet_group_name  = aws_elasticache_subnet_group.main.name
  security_group_ids = [aws_security_group.redis.id]

  at_rest_encryption_enabled = true
  transit_encryption_enabled = true
  auth_token                 = random_password.redis_auth.result

  automatic_failover_enabled = var.environment == "production"
  multi_az_enabled           = var.environment == "production"

  snapshot_retention_limit = 3
  snapshot_window          = "05:00-06:00"
  maintenance_window       = "mon:06:00-mon:07:00"

  apply_immediately = var.environment != "production"

  tags = { Name = "\${var.project_name}-\${var.environment}-redis" }
}

resource "random_password" "redis_auth" {
  length  = 64
  special = false
}

# ─── Store Redis URL in Secrets Manager ───
resource "aws_secretsmanager_secret" "redis_url" {
  name = "\${var.project_name}/\${var.environment}/redis-url"
}

resource "aws_secretsmanager_secret_version" "redis_url" {
  secret_id     = aws_secretsmanager_secret.redis_url.id
  secret_string = "rediss://:\${random_password.redis_auth.result}@\${aws_elasticache_replication_group.main.primary_endpoint_address}:6379"
}
`;

// ─── acm.tf (SSL Certificate + Route53) ───
const acmTf = `
# ═══════════ ACM CERTIFICATE ═══════════

resource "aws_acm_certificate" "main" {
  domain_name               = var.domain_name
  subject_alternative_names = ["*.\\${var.domain_name}"]
  validation_method         = "DNS"

  lifecycle {
    create_before_destroy = true
  }

  tags = { Name = "\${var.project_name}-\${var.environment}-cert" }
}

# ─── DNS Validation ───
resource "aws_route53_record" "cert_validation" {
  for_each = {
    for dvo in aws_acm_certificate.main.domain_validation_options : dvo.domain_name => {
      name   = dvo.resource_record_name
      record = dvo.resource_record_value
      type   = dvo.resource_record_type
    }
  }

  zone_id = var.hosted_zone_id != "" ? var.hosted_zone_id : aws_route53_zone.main[0].zone_id
  name    = each.value.name
  type    = each.value.type
  records = [each.value.record]
  ttl     = 60

  allow_overwrite = true
}

resource "aws_acm_certificate_validation" "main" {
  certificate_arn         = aws_acm_certificate.main.arn
  validation_record_fqdns = [for record in aws_route53_record.cert_validation : record.fqdn]
}

# ═══════════ ROUTE53 ═══════════

resource "aws_route53_zone" "main" {
  count = var.hosted_zone_id == "" ? 1 : 0
  name  = var.domain_name

  tags = { Name = "\${var.project_name}-\${var.environment}-zone" }
}

# ─── A record (ALB alias) ───
resource "aws_route53_record" "app" {
  zone_id = var.hosted_zone_id != "" ? var.hosted_zone_id : aws_route53_zone.main[0].zone_id
  name    = var.domain_name
  type    = "A"

  alias {
    name                   = aws_lb.main.dns_name
    zone_id                = aws_lb.main.zone_id
    evaluate_target_health = true
  }
}

resource "aws_route53_record" "app_www" {
  zone_id = var.hosted_zone_id != "" ? var.hosted_zone_id : aws_route53_zone.main[0].zone_id
  name    = "www.\${var.domain_name}"
  type    = "A"

  alias {
    name                   = aws_lb.main.dns_name
    zone_id                = aws_lb.main.zone_id
    evaluate_target_health = true
  }
}
`;

// ─── monitoring.tf ───
const monitoringTf = `
# ═══════════ CLOUDWATCH ALARMS ═══════════

# ─── ECS CPU High ───
resource "aws_cloudwatch_metric_alarm" "ecs_cpu_high" {
  alarm_name          = "\${var.project_name}-\${var.environment}-ecs-cpu-high"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 3
  metric_name         = "CPUUtilization"
  namespace           = "AWS/ECS"
  period              = 60
  statistic           = "Average"
  threshold           = 85
  alarm_description   = "ECS CPU utilization > 85%"

  dimensions = {
    ClusterName = aws_ecs_cluster.main.name
    ServiceName = aws_ecs_service.app.name
  }

  alarm_actions = [aws_sns_topic.alerts.arn]
  ok_actions    = [aws_sns_topic.alerts.arn]
}

# ─── ECS Memory High ───
resource "aws_cloudwatch_metric_alarm" "ecs_memory_high" {
  alarm_name          = "\${var.project_name}-\${var.environment}-ecs-memory-high"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 3
  metric_name         = "MemoryUtilization"
  namespace           = "AWS/ECS"
  period              = 60
  statistic           = "Average"
  threshold           = 85
  alarm_description   = "ECS memory utilization > 85%"

  dimensions = {
    ClusterName = aws_ecs_cluster.main.name
    ServiceName = aws_ecs_service.app.name
  }

  alarm_actions = [aws_sns_topic.alerts.arn]
}

# ─── ALB 5xx Errors ───
resource "aws_cloudwatch_metric_alarm" "alb_5xx" {
  alarm_name          = "\${var.project_name}-\${var.environment}-alb-5xx"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  metric_name         = "HTTPCode_Target_5XX_Count"
  namespace           = "AWS/ApplicationELB"
  period              = 60
  statistic           = "Sum"
  threshold           = 10
  alarm_description   = "ALB 5xx errors > 10 per minute"
  treat_missing_data  = "notBreaching"

  dimensions = {
    LoadBalancer = aws_lb.main.arn_suffix
    TargetGroup  = aws_lb_target_group.app.arn_suffix
  }

  alarm_actions = [aws_sns_topic.alerts.arn]
}

# ─── ALB Response Time ───
resource "aws_cloudwatch_metric_alarm" "alb_latency" {
  alarm_name          = "\${var.project_name}-\${var.environment}-alb-latency"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 3
  metric_name         = "TargetResponseTime"
  namespace           = "AWS/ApplicationELB"
  period              = 60
  extended_statistic  = "p99"
  threshold           = 3
  alarm_description   = "ALB p99 latency > 3s"

  dimensions = {
    LoadBalancer = aws_lb.main.arn_suffix
    TargetGroup  = aws_lb_target_group.app.arn_suffix
  }

  alarm_actions = [aws_sns_topic.alerts.arn]
}

# ─── RDS CPU ───
resource "aws_cloudwatch_metric_alarm" "rds_cpu" {
  alarm_name          = "\${var.project_name}-\${var.environment}-rds-cpu"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 3
  metric_name         = "CPUUtilization"
  namespace           = "AWS/RDS"
  period              = 60
  statistic           = "Average"
  threshold           = 80
  alarm_description   = "RDS CPU > 80%"

  dimensions = {
    DBInstanceIdentifier = aws_db_instance.main.id
  }

  alarm_actions = [aws_sns_topic.alerts.arn]
}

# ─── RDS Storage ───
resource "aws_cloudwatch_metric_alarm" "rds_storage" {
  alarm_name          = "\${var.project_name}-\${var.environment}-rds-storage"
  comparison_operator = "LessThanThreshold"
  evaluation_periods  = 1
  metric_name         = "FreeStorageSpace"
  namespace           = "AWS/RDS"
  period              = 300
  statistic           = "Average"
  threshold           = 5000000000  # 5 GB
  alarm_description   = "RDS free storage < 5GB"

  dimensions = {
    DBInstanceIdentifier = aws_db_instance.main.id
  }

  alarm_actions = [aws_sns_topic.alerts.arn]
}

# ─── SNS Topic for Alerts ───
resource "aws_sns_topic" "alerts" {
  name = "\${var.project_name}-\${var.environment}-alerts"
}

resource "aws_sns_topic_subscription" "email" {
  topic_arn = aws_sns_topic.alerts.arn
  protocol  = "email"
  endpoint  = "alerts@example.com"
}
`;

// ─── outputs.tf ───
const outputsTf = `
# ═══════════ OUTPUTS ═══════════

# ─── VPC ───
output "vpc_id" {
  value = aws_vpc.main.id
}

output "public_subnet_ids" {
  value = aws_subnet.public[*].id
}

output "private_subnet_ids" {
  value = aws_subnet.private[*].id
}

# ─── ECS ───
output "ecs_cluster_name" {
  value = aws_ecs_cluster.main.name
}

output "ecs_service_name" {
  value = aws_ecs_service.app.name
}

output "ecr_repository_url" {
  value = aws_ecr_repository.app.repository_url
}

# ─── ALB ───
output "alb_dns_name" {
  value = aws_lb.main.dns_name
}

output "alb_zone_id" {
  value = aws_lb.main.zone_id
}

# ─── Database ───
output "rds_endpoint" {
  value     = aws_db_instance.main.endpoint
  sensitive = true
}

output "rds_db_name" {
  value = aws_db_instance.main.db_name
}

# ─── Redis ───
output "redis_endpoint" {
  value     = aws_elasticache_replication_group.main.primary_endpoint_address
  sensitive = true
}

# ─── DNS ───
output "app_url" {
  value = "https://\${var.domain_name}"
}

output "nameservers" {
  value = var.hosted_zone_id == "" ? aws_route53_zone.main[0].name_servers : []
}
`;

// ─── terraform.tfvars.example ───
const tfvarsExample = `
# General
aws_region   = "ap-southeast-1"
environment  = "production"
project_name = "my-app"

# Networking
vpc_cidr              = "10.0.0.0/16"
public_subnet_cidrs   = ["10.0.1.0/24", "10.0.2.0/24", "10.0.3.0/24"]
private_subnet_cidrs  = ["10.0.10.0/24", "10.0.20.0/24", "10.0.30.0/24"]
database_subnet_cidrs = ["10.0.100.0/24", "10.0.200.0/24"]

# ECS
container_port = 3000
desired_count  = 2
cpu            = 256
memory         = 512
min_capacity   = 2
max_capacity   = 10

# Database
db_instance_class    = "db.t4g.micro"
db_allocated_storage = 20
db_name              = "app_db"
db_username          = "admin"

# Cache
redis_node_type = "cache.t4g.micro"

# Domain
domain_name    = "example.com"
hosted_zone_id = ""  # Leave empty to create new zone
`;

// ─── .gitignore ───
const gitignore = `
# Terraform
.terraform/
*.tfstate
*.tfstate.*
*.tfvars
!terraform.tfvars.example
.terraform.lock.hcl
crash.log
override.tf
override.tf.json
*_override.tf
*_override.tf.json
.terraformrc
terraform.rc
`;

// ─── Write all files ───
const dir = "terraform";

if (!existsSync(dir)) {
  mkdirSync(dir, { recursive: true });
  console.log("📁 Created terraform/");
}

const files = [
  { name: `${dir}/main.tf`, content: mainTf },
  { name: `${dir}/variables.tf`, content: variablesTf },
  { name: `${dir}/vpc.tf`, content: vpcTf },
  { name: `${dir}/security-groups.tf`, content: sgTf },
  { name: `${dir}/alb.tf`, content: albTf },
  { name: `${dir}/iam.tf`, content: iamTf },
  { name: `${dir}/ecs.tf`, content: ecsTf },
  { name: `${dir}/rds.tf`, content: rdsTf },
  { name: `${dir}/redis.tf`, content: redisTf },
  { name: `${dir}/acm.tf`, content: acmTf },
  { name: `${dir}/monitoring.tf`, content: monitoringTf },
  { name: `${dir}/outputs.tf`, content: outputsTf },
  { name: `${dir}/terraform.tfvars.example`, content: tfvarsExample },
  { name: `${dir}/.gitignore`, content: gitignore },
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
🚀 Terraform setup done!

Resources (14 files):
  main.tf             → Provider, backend, data sources
  variables.tf        → All variables with defaults
  vpc.tf              → VPC, subnets (public/private/database), NAT, IGW, route tables, flow logs
  security-groups.tf  → ALB, App, Database, Redis security groups
  alb.tf              → ALB, listeners (HTTP→HTTPS), target group, access logs
  iam.tf              → ECS execution role, task role (S3, SQS, Secrets Manager)
  ecs.tf              → Cluster, task def, service (Fargate + Spot), auto-scaling, ECR
  rds.tf              → PostgreSQL 16, encrypted, performance insights, monitoring
  redis.tf            → ElastiCache Redis 7.1, encrypted, auth token
  acm.tf              → SSL certificate + Route53 DNS validation + A records
  monitoring.tf       → CloudWatch alarms (CPU, memory, 5xx, latency, storage) + SNS
  outputs.tf          → All important resource IDs and endpoints

Usage:
  cd terraform
  terraform init
  terraform plan -var-file=terraform.tfvars
  terraform apply -var-file=terraform.tfvars
`);
