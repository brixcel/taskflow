variable "aws_region" {
  description = "AWS deployment region"
  type        = string
  default     = "us-east-1"
}

variable "project_name" {
  description = "Project name identifier"
  type        = string
  default     = "synctask"
}

variable "environment" {
  description = "Deployment environment"
  type        = string
  default     = "staging"
}

variable "vpc_cidr" {
  description = "VPC CIDR block"
  type        = string
  default     = "10.10.0.0/16"
}

variable "availability_zones" {
  description = "Availability zones for staging multi-AZ setup"
  type        = list(string)
  default     = ["us-east-1a", "us-east-1b"]
}

variable "public_subnet_cidrs" {
  description = "Public subnet CIDRs"
  type        = list(string)
  default     = ["10.10.1.0/24", "10.10.2.0/24"]
}

variable "private_app_subnet_cidrs" {
  description = "Private application subnet CIDRs"
  type        = list(string)
  default     = ["10.10.11.0/24", "10.10.12.0/24"]
}

variable "private_db_subnet_cidrs" {
  description = "Private database subnet CIDRs"
  type        = list(string)
  default     = ["10.10.21.0/24", "10.10.22.0/24"]
}

variable "database_name" {
  description = "Initial PostgreSQL database name"
  type        = string
  default     = "synctask_staging"
}

variable "database_username" {
  description = "PostgreSQL master username"
  type        = string
  default     = "synctask_staging_admin"
}

variable "database_password" {
  description = "PostgreSQL master password"
  type        = string
  sensitive   = true
}

variable "container_image" {
  description = "Container image URI for SyncTask backend"
  type        = string
  default     = "synctask-backend:staging-latest"
}

variable "jwt_secret" {
  description = "JWT Secret for authentication session signing"
  type        = string
  sensitive   = true
}

variable "gemini_api_key" {
  description = "Google Gemini API Key for ST AI productivity & assistant features"
  type        = string
  sensitive   = true
  default     = ""
}

variable "resend_api_key" {
  description = "Resend API Key for transactional auth emails"
  type        = string
  sensitive   = true
  default     = ""
}

variable "alert_email" {
  description = "Alert email address for CloudWatch monitoring"
  type        = string
  default     = ""
}

variable "tags" {
  description = "Resource tags"
  type        = map(string)
  default = {
    Project     = "SyncTask"
    Environment = "staging"
    ManagedBy   = "Terraform"
  }
}
