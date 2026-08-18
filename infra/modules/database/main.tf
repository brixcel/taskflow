# ==============================================================================
# SyncTask Database Module — RDS PostgreSQL Multi-AZ, KMS Encryption & Backups
# ==============================================================================

# ── 1. KMS Key for Database Storage Encryption ─────────────────────────────────

resource "aws_kms_key" "database" {
  description             = "KMS Key for SyncTask ${var.environment} RDS PostgreSQL encryption"
  deletion_window_in_days = 30
  enable_key_rotation     = true

  tags = merge(var.tags, {
    Name        = "${var.project_name}-${var.environment}-db-kms"
    Environment = var.environment
    ManagedBy   = "Terraform"
  })
}

resource "aws_kms_alias" "database" {
  name          = "alias/${var.project_name}-${var.environment}-database"
  target_key_id = aws_kms_key.database.key_id
}

# ── 2. DB Subnet Group (Private Isolated Database Subnets) ─────────────────────

resource "aws_db_subnet_group" "main" {
  name        = "${var.project_name}-${var.environment}-db-subnet-group"
  description = "Subnet group for SyncTask ${var.environment} RDS PostgreSQL"
  subnet_ids  = var.subnet_ids

  tags = merge(var.tags, {
    Name        = "${var.project_name}-${var.environment}-db-subnet-group"
    Environment = var.environment
    ManagedBy   = "Terraform"
  })
}

# ── 3. DB Parameter Group (Enforce SSL & Performance Tuning) ───────────────────

resource "aws_db_parameter_group" "main" {
  name        = "${var.project_name}-${var.environment}-pg16-params"
  family      = "postgres16"
  description = "Custom parameter group enforcing SSL and logging for SyncTask"

  parameter {
    name  = "rds.force_ssl"
    value = "1"
  }

  parameter {
    name  = "log_connections"
    value = "1"
  }

  parameter {
    name  = "log_disconnections"
    value = "1"
  }

  parameter {
    name  = "log_min_duration_statement"
    value = "500" # Log queries taking over 500ms
  }

  tags = merge(var.tags, {
    Name        = "${var.project_name}-${var.environment}-db-params"
    Environment = var.environment
    ManagedBy   = "Terraform"
  })
}

# ── 4. RDS PostgreSQL DB Instance ─────────────────────────────────────────────

resource "aws_db_instance" "main" {
  identifier        = "${var.project_name}-${var.environment}-postgres"
  engine            = "postgres"
  engine_version    = "16.3"
  instance_class    = var.instance_class
  allocated_storage = var.allocated_storage
  max_allocated_storage = var.max_allocated_storage
  storage_type      = "gp3"

  db_name  = var.database_name
  username = var.database_username
  password = var.database_password

  db_subnet_group_name   = aws_db_subnet_group.main.name
  vpc_security_group_ids = [var.db_security_group_id]
  parameter_group_name   = aws_db_parameter_group.main.name

  multi_az               = var.multi_az
  publicly_accessible    = false
  storage_encrypted      = true
  kms_key_id             = aws_kms_key.database.arn
  deletion_protection    = var.deletion_protection
  skip_final_snapshot    = var.environment != "production"
  final_snapshot_identifier = var.environment == "production" ? "${var.project_name}-${var.environment}-final-snapshot" : null

  backup_retention_period = var.backup_retention_period
  backup_window           = "03:00-04:00" # UTC
  maintenance_window      = "Sun:04:30-Sun:05:30" # UTC

  auto_minor_version_upgrade = true
  copy_tags_to_snapshot      = true

  performance_insights_enabled = var.environment == "production"
  performance_insights_kms_key_id = var.environment == "production" ? aws_kms_key.database.arn : null
  performance_insights_retention_period = var.environment == "production" ? 7 : null

  tags = merge(var.tags, {
    Name        = "${var.project_name}-${var.environment}-postgres"
    Environment = var.environment
    ManagedBy   = "Terraform"
  })
}
