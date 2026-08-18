# ==============================================================================
# SyncTask Production Environment — High-Availability Cloud Architecture
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

  # S3 Remote State with DynamoDB Locking
  # backend "s3" {
  #   bucket         = "synctask-terraform-state-prod"
  #   key            = "production/terraform.tfstate"
  #   region         = "us-east-1"
  #   dynamodb_table = "synctask-terraform-locks-prod"
  #   encrypt        = true
  # }
}

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = var.tags
  }
}

# ── 1. Networking Module (3 AZs with Dedicated NAT Gateways) ──────────────────

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

# ── 2. Storage Module (S3 Bucket with KMS & Versioning) ───────────────────────

module "storage" {
  source = "../../modules/storage"

  environment          = var.environment
  project_name         = var.project_name
  cors_allowed_origins = var.cors_allowed_origins
  tags                 = var.tags
}

# ── 3. Database Module (RDS PostgreSQL Multi-AZ with Deletion Protection) ─────

module "database" {
  source = "../../modules/database"

  environment             = var.environment
  project_name            = var.project_name
  vpc_id                  = module.networking.vpc_id
  subnet_ids              = module.networking.private_db_subnet_ids
  db_security_group_id    = module.networking.db_security_group_id
  instance_class          = var.db_instance_class
  allocated_storage       = 100
  max_allocated_storage   = 500
  database_name           = var.database_name
  database_username       = var.database_username
  database_password       = var.database_password
  multi_az                = true
  backup_retention_period = 30
  deletion_protection     = true
  tags                    = var.tags
}

# ── 4. AWS Secrets Manager (Encrypted Credentials) ────────────────────────────

resource "aws_secretsmanager_secret" "database_url" {
  name                    = "${var.project_name}-${var.environment}-database-url"
  description             = "PostgreSQL connection string for SyncTask production"
  recovery_window_in_days = 30
}

resource "aws_secretsmanager_secret_version" "database_url" {
  secret_id     = aws_secretsmanager_secret.database_url.id
  secret_string = "postgresql://${var.database_username}:${var.database_password}@${module.database.db_endpoint}/${var.database_name}?sslmode=require"
}

resource "aws_secretsmanager_secret" "jwt_secret" {
  name                    = "${var.project_name}-${var.environment}-jwt-secret"
  description             = "Production JWT secret for authentication session validation"
  recovery_window_in_days = 30
}

resource "aws_secretsmanager_secret_version" "jwt_secret" {
  secret_id     = aws_secretsmanager_secret.jwt_secret.id
  secret_string = var.jwt_secret
}

resource "aws_secretsmanager_secret" "gemini_api_key" {
  name                    = "${var.project_name}-${var.environment}-gemini-api-key"
  description             = "Google Gemini API Key for production ST AI features"
  recovery_window_in_days = 30
}

resource "aws_secretsmanager_secret_version" "gemini_api_key" {
  secret_id     = aws_secretsmanager_secret.gemini_api_key.id
  secret_string = var.gemini_api_key
}

resource "aws_secretsmanager_secret" "resend_api_key" {
  name                    = "${var.project_name}-${var.environment}-resend-api-key"
  description             = "Resend API Key for transactional auth emails"
  recovery_window_in_days = 30
}

resource "aws_secretsmanager_secret_version" "resend_api_key" {
  secret_id     = aws_secretsmanager_secret.resend_api_key.id
  secret_string = var.resend_api_key
}

# ── 5. Compute Module (ECS Fargate Multi-Replica & ALB) ───────────────────────

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
  cpu                       = 1024
  memory                    = 2048
  desired_count             = 3
  min_capacity              = 2
  max_capacity              = 10
  cloudwatch_log_group_name = module.monitoring.log_group_name

  environment_variables = [
    { name = "NODE_ENV", value = "production" },
    { name = "PORT", value = "3000" },
    { name = "S3_ATTACHMENT_BUCKET", value = module.storage.bucket_name },
    { name = "CORS_ORIGIN", value = join(",", var.cors_allowed_origins) }
  ]

  secrets_manager_arns = {
    DATABASE_URL   = aws_secretsmanager_secret.database_url.arn
    JWT_SECRET     = aws_secretsmanager_secret.jwt_secret.arn
    GEMINI_API_KEY = aws_secretsmanager_secret.gemini_api_key.arn
    RESEND_API_KEY = aws_secretsmanager_secret.resend_api_key.arn
  }

  tags = var.tags
}

# ── 6. AWS WAF (Web Application Firewall for ALB) ─────────────────────────────

resource "aws_wafv2_web_acl" "alb" {
  name        = "${var.project_name}-${var.environment}-waf"
  description = "WAF protecting SyncTask production ALB against DDoS, SQLi, and common exploits"
  scope       = "REGIONAL"

  default_action {
    allow {}
  }

  # Rule 1: Rate Limiting (1000 requests per 5 minutes per IP)
  rule {
    name     = "RateLimitRule"
    priority = 1

    action {
      block {}
    }

    statement {
      rate_based_statement {
        limit              = 1000
        aggregate_key_type = "IP"
      }
    }

    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "SyncTaskWafRateLimit"
      sampled_requests_enabled   = true
    }
  }

  # Rule 2: AWS Managed Common Rule Set
  rule {
    name     = "AWSManagedRulesCommonRuleSet"
    priority = 2

    override_action {
      none {}
    }

    statement {
      managed_rule_group_statement {
        name        = "AWSManagedRulesCommonRuleSet"
        vendor_name = "AWS"
      }
    }

    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "SyncTaskWafCommonRuleSet"
      sampled_requests_enabled   = true
    }
  }

  visibility_config {
    cloudwatch_metrics_enabled = true
    metric_name                = "${var.project_name}-${var.environment}-waf-main"
    sampled_requests_enabled   = true
  }

  tags = var.tags
}

resource "aws_wafv2_web_acl_association" "alb" {
  resource_arn = module.compute.alb_arn
  web_acl_arn  = aws_wafv2_web_acl.alb.arn
}

# ── 7. Monitoring Module (CloudWatch Alarms, 90-Day Logs & SNS) ───────────────

module "monitoring" {
  source = "../../modules/monitoring"

  environment             = var.environment
  project_name            = var.project_name
  log_retention_days      = 90
  ecs_cluster_name        = "${var.project_name}-${var.environment}-cluster"
  ecs_service_name        = "${var.project_name}-${var.environment}-service"
  alb_arn_suffix          = module.compute.alb_arn_suffix
  target_group_arn_suffix = module.compute.target_group_arn_suffix
  db_instance_id          = module.database.db_instance_id
  alert_email             = var.alert_email
  tags                    = var.tags
}
