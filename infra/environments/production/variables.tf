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
  default     = "production"
}

variable "vpc_cidr" {
  description = "VPC CIDR block for production"
  type        = string
  default     = "10.0.0.0/16"
}

variable "availability_zones" {
  description = "Availability zones for production multi-AZ high availability"
  type        = list(string)
  default     = ["us-east-1a", "us-east-1b", "us-east-1c"]
}

variable "public_subnet_cidrs" {
  description = "Public subnet CIDRs across 3 AZs"
  type        = list(string)
  default     = ["10.0.1.0/24", "10.0.2.0/24", "10.0.3.0/24"]
}

variable "private_app_subnet_cidrs" {
  description = "Private application subnet CIDRs across 3 AZs"
  type        = list(string)
  default     = ["10.0.11.0/24", "10.0.12.0/24", "10.0.13.0/24"]
}

variable "private_db_subnet_cidrs" {
  description = "Private database subnet CIDRs across 3 AZs"
  type        = list(string)
  default     = ["10.0.21.0/24", "10.0.22.0/24", "10.0.23.0/24"]
}

variable "database_name" {
  description = "Production PostgreSQL database name"
  type        = string
  default     = "synctask_production"
}

variable "database_username" {
  description = "PostgreSQL master username"
  type        = string
  default     = "synctask_prod_master"
}

variable "database_password" {
  description = "PostgreSQL master password (must be strong and sensitive)"
  type        = string
  sensitive   = true
}

variable "db_instance_class" {
  description = "Production database instance class"
  type        = string
  default     = "db.r6g.large"
}

variable "container_image" {
  description = "Container image URI for SyncTask production backend"
  type        = string
  default     = "synctask-backend:v2.0.0"
}

variable "jwt_secret" {
  description = "JWT Secret for production authentication session signing"
  type        = string
  sensitive   = true
}

variable "gemini_api_key" {
  description = "Google Gemini API Key for production ST AI intelligence"
  type        = string
  sensitive   = true
}

variable "resend_api_key" {
  description = "Resend API Key for production transactional auth emails"
  type        = string
  sensitive   = true
}

variable "cors_allowed_origins" {
  description = "Production frontend URLs allowed for CORS"
  type        = list(string)
  default     = ["https://app.synctask.com", "https://synctask.com"]
}

variable "alert_email" {
  description = "On-call alert email address for critical CloudWatch notifications"
  type        = string
  default     = "oncall@synctask.com"
}

variable "tags" {
  description = "Production resource tags"
  type        = map(string)
  default = {
    Project     = "SyncTask"
    Environment = "production"
    ManagedBy   = "Terraform"
    Tier        = "MissionCritical"
  }
}
