# ==============================================================================
# SyncTask Storage Module — S3 Object Storage, KMS Encryption & Access Policies
# ==============================================================================

resource "random_id" "bucket_suffix" {
  byte_length = 4
}

# ── 1. KMS Customer Managed Key for Storage Encryption ────────────────────────

resource "aws_kms_key" "storage" {
  description             = "KMS Key for SyncTask ${var.environment} attachment & asset storage"
  deletion_window_in_days = 30
  enable_key_rotation     = true

  tags = merge(var.tags, {
    Name        = "${var.project_name}-${var.environment}-storage-kms"
    Environment = var.environment
    ManagedBy   = "Terraform"
  })
}

resource "aws_kms_alias" "storage" {
  name          = "alias/${var.project_name}-${var.environment}-storage"
  target_key_id = aws_kms_key.storage.key_id
}

# ── 2. S3 Bucket for Task Attachments & User Media Assets ─────────────────────

resource "aws_s3_bucket" "attachments" {
  bucket        = "${var.project_name}-${var.environment}-attachments-${random_id.bucket_suffix.hex}"
  force_destroy = var.environment != "production"

  tags = merge(var.tags, {
    Name        = "${var.project_name}-${var.environment}-attachments"
    Environment = var.environment
    ManagedBy   = "Terraform"
  })
}

# ── 3. Server-Side KMS Encryption ─────────────────────────────────────────────

resource "aws_s3_bucket_server_side_encryption_configuration" "attachments" {
  bucket = aws_s3_bucket.attachments.id

  rule {
    apply_server_side_encryption_by_default {
      kms_master_key_id = aws_kms_key.storage.arn
      sse_algorithm     = "aws:kms"
    }
    bucket_key_enabled = true
  }
}

# ── 4. Block All Public Access (Strict Zero-Trust) ────────────────────────────

resource "aws_s3_bucket_public_access_block" "attachments" {
  bucket = aws_s3_bucket.attachments.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# ── 5. Bucket Versioning ──────────────────────────────────────────────────────

resource "aws_s3_bucket_versioning" "attachments" {
  bucket = aws_s3_bucket.attachments.id

  versioning_configuration {
    status = "Enabled"
  }
}

# ── 6. Lifecycle Transition & Cleanup Rules ───────────────────────────────────

resource "aws_s3_bucket_lifecycle_configuration" "attachments" {
  bucket = aws_s3_bucket.attachments.id

  rule {
    id     = "transition-old-versions"
    status = "Enabled"

    noncurrent_version_transition {
      noncurrent_days = 90
      storage_class   = "STANDARD_IA"
    }

    noncurrent_version_expiration {
      noncurrent_days = 365
    }

    abort_incomplete_multipart_upload {
      days_after_initiation = 7
    }
  }
}

# ── 7. Cross-Origin Resource Sharing (CORS) ───────────────────────────────────

resource "aws_s3_bucket_cors_configuration" "attachments" {
  bucket = aws_s3_bucket.attachments.id

  cors_rule {
    allowed_headers = ["*"]
    allowed_methods = ["GET", "PUT", "POST", "HEAD"]
    allowed_origins = var.cors_allowed_origins
    expose_headers  = ["ETag"]
    max_age_seconds = 3600
  }
}
