# ==============================================================================
# SyncTask Staging Environment — Modular Infrastructure Composition
# ==============================================================================

terraform {
  required_version = ">= 1.5.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.50"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.6"
    }
  }

  # S3 Remote State with DynamoDB Locking (Configure with your organization's backend)
  # backend "s3" {
  #   bucket         = "synctask-terraform-state-staging"
  #   key            = "staging/terraform.tfstate"
  #   region         = "us-east-1"
  #   dynamodb_table = "synctask-terraform-locks-staging"
  #   encrypt        = true
  # }
}

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = var.tags
  }
}

# ── 1. Networking Module ───────────────────────────────────────────────────────

module "networking" {
  source = "../../modules/networking"

  environment               = var.environment
  project_name              = var.project_name
  vpc_cidr                  = var.vpc_cidr
  availability_zones        = var.availability_zones
  public_subnet_cidrs       = var.public_subnet_cidrs
  private_app_subnet_cidrs  = var.private_app_subnet_cidrs
  private_db_subnet_cidrs   = var.private_db_subnet_cidrs
  container_port            = 3000
  tags                      = var.tags
}

# ── 2. Storage Module ─────────────────────────────────────────────────────────

module "storage" {
  source = "../../modules/storage"

  environment          = var.environment
  project_name         = var.project_name
  cors_allowed_origins = ["*"]
  tags                 = var.tags
}

# ── 3. Database Module (RDS PostgreSQL) ───────────────────────────────────────

module "database" {
  source = "../../modules/database"

  environment             = var.environment
  project_name            = var.project_name
  vpc_id                  = module.networking.vpc_id
  subnet_ids              = module.networking.private_db_subnet_ids
  db_security_group_id    = module.networking.db_security_group_id
  instance_class          = "db.t4g.micro"
  allocated_storage       = 20
  max_allocated_storage   = 50
  database_name           = var.database_name
  database_username       = var.database_username
  database_password       = var.database_password
  multi_az                = false
  backup_retention_period = 7
  deletion_protection     = false
  tags                    = var.tags
}

# ── 4. AWS Secrets Manager (Zero-Hardcoded Secrets Injection) ─────────────────

resource "aws_secretsmanager_secret" "database_url" {
  name                    = "${var.project_name}-${var.environment}-database-url"
  description             = "PostgreSQL connection string for SyncTask staging"
  recovery_window_in_days = 0
}

resource "aws_secretsmanager_secret_version" "database_url" {
  secret_id     = aws_secretsmanager_secret.database_url.id
  secret_string = "postgresql://${var.database_username}:${var.database_password}@${module.database.db_endpoint}/${var.database_name}?sslmode=require"
}

resource "aws_secretsmanager_secret" "jwt_secret" {
  name                    = "${var.project_name}-${var.environment}-jwt-secret"
  description             = "JWT signing secret for authentication"
  recovery_window_in_days = 0
}

resource "aws_secretsmanager_secret_version" "jwt_secret" {
  secret_id     = aws_secretsmanager_secret.jwt_secret.id
  secret_string = var.jwt_secret
}

resource "aws_secretsmanager_secret" "gemini_api_key" {
  name                    = "${var.project_name}-${var.environment}-gemini-api-key"
  description             = "Google Gemini API Key for ST AI functionality"
  recovery_window_in_days = 0
}

resource "aws_secretsmanager_secret_version" "gemini_api_key" {
  secret_id     = aws_secretsmanager_secret.gemini_api_key.id
  secret_string = var.gemini_api_key
}

# ── 5. Compute Module (ECS Fargate & ALB) ──────────────────────────────────────

module "compute" {
  source = "../../modules/compute"

  environment               = var.environment
  project_name              = var.project_name
  vpc_id                    = module.networking.vpc_id
  public_subnet_ids         = module.networking.public_subnet_ids
  private_app_subnet_ids    = module.networking.private_app_subnet_ids
  alb_security_group_id     = module.networking.alb_security_group_id
  ecs_security_group_id     = module.networking.ecs_security_group_id
  container_image           = var.container_image
  container_port            = 3000
  cpu                       = 256
  memory                    = 512
  desired_count             = 1
  min_capacity              = 1
  max_capacity              = 4
  cloudwatch_log_group_name = module.monitoring.log_group_name

  environment_variables = [
    { name = "NODE_ENV", value = "staging" },
    { name = "PORT", value = "3000" },
    { name = "S3_ATTACHMENT_BUCKET", value = module.storage.bucket_name },
    { name = "CORS_ORIGIN", value = "*" }
  ]

  secrets_manager_arns = {
    DATABASE_URL   = aws_secretsmanager_secret.database_url.arn
    JWT_SECRET     = aws_secretsmanager_secret.jwt_secret.arn
    GEMINI_API_KEY = aws_secretsmanager_secret.gemini_api_key.arn
  }

  tags = var.tags
}

# ── 6. Monitoring Module (CloudWatch Logs, Alarms & SNS) ───────────────────────

module "monitoring" {
  source = "../../modules/monitoring"

  environment             = var.environment
  project_name            = var.project_name
  log_retention_days      = 30
  ecs_cluster_name        = "${var.project_name}-${var.environment}-cluster"
  ecs_service_name        = "${var.project_name}-${var.environment}-service"
  alb_arn_suffix          = module.compute.alb_arn_suffix
  target_group_arn_suffix = module.compute.target_group_arn_suffix
  db_instance_id          = module.database.db_instance_id
  alert_email             = var.alert_email
  tags                    = var.tags
}
