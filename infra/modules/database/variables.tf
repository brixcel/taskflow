variable "environment" {
  description = "Deployment environment name (e.g. staging, production)"
  type        = string
}

variable "project_name" {
  description = "Project name identifier for resource naming and tagging"
  type        = string
  default     = "synctask"
}

variable "vpc_id" {
  description = "VPC ID where the database subnet group and security group reside"
  type        = string
}

variable "subnet_ids" {
  description = "List of private database subnet IDs across Multi-AZ"
  type        = list(string)
}

variable "db_security_group_id" {
  description = "Security group ID allowing PostgreSQL traffic from ECS tasks"
  type        = string
}

variable "instance_class" {
  description = "RDS DB instance class (e.g. db.t4g.micro for staging, db.r6g.large for production)"
  type        = string
  default     = "db.t4g.micro"
}

variable "allocated_storage" {
  description = "Initial allocated storage in gigabytes"
  type        = number
  default     = 20
}

variable "max_allocated_storage" {
  description = "Maximum storage limit for auto-scaling storage in gigabytes"
  type        = number
  default     = 100
}

variable "database_name" {
  description = "Name of the initial PostgreSQL database created upon provisioning"
  type        = string
  default     = "synctask"
}

variable "database_username" {
  description = "Master username for the PostgreSQL database"
  type        = string
  default     = "synctask_admin"
}

variable "database_password" {
  description = "Master password for PostgreSQL database (must be sensitive)"
  type        = string
  sensitive   = true
}

variable "multi_az" {
  description = "Enable Multi-AZ deployment for high availability failover"
  type        = bool
  default     = false
}

variable "backup_retention_period" {
  description = "Days of automated backups to retain"
  type        = number
  default     = 7
}

variable "deletion_protection" {
  description = "Protect the database from accidental deletion"
  type        = bool
  default     = false
}

variable "tags" {
  description = "Common tags applied to all database resources"
  type        = map(string)
  default     = {}
}
