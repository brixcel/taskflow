variable "environment" {
  description = "Deployment environment name (e.g. staging, production)"
  type        = string
}

variable "project_name" {
  description = "Project name identifier for resource naming and tagging"
  type        = string
  default     = "synctask"
}

variable "vpc_cidr" {
  description = "CIDR block for the Virtual Private Cloud (VPC)"
  type        = string
  default     = "10.0.0.0/16"
}

variable "availability_zones" {
  description = "List of AWS Availability Zones for multi-AZ redundancy"
  type        = list(string)
}

variable "public_subnet_cidrs" {
  description = "List of CIDR blocks for public subnets (ALB & NAT Gateways)"
  type        = list(string)
}

variable "private_app_subnet_cidrs" {
  description = "List of CIDR blocks for private application subnets (ECS Fargate containers)"
  type        = list(string)
}

variable "private_db_subnet_cidrs" {
  description = "List of CIDR blocks for private database subnets (RDS PostgreSQL isolated)"
  type        = list(string)
}

variable "container_port" {
  description = "Port on which the SyncTask backend container listens"
  type        = number
  default     = 3000
}

variable "tags" {
  description = "Common tags applied to all networking resources"
  type        = map(string)
  default     = {}
}
