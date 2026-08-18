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
  description = "VPC ID where the ALB and ECS tasks are provisioned"
  type        = string
}

variable "public_subnet_ids" {
  description = "List of public subnet IDs for the Application Load Balancer"
  type        = list(string)
}

variable "private_app_subnet_ids" {
  description = "List of private application subnet IDs for ECS Fargate containers"
  type        = list(string)
}

variable "alb_security_group_id" {
  description = "Security group ID for the ALB"
  type        = string
}

variable "ecs_security_group_id" {
  description = "Security group ID for the ECS Fargate tasks"
  type        = string
}

variable "container_image" {
  description = "ECR or container image URI for SyncTask backend (e.g. 123456789.dkr.ecr.us-east-1.amazonaws.com/synctask:latest)"
  type        = string
  default     = "synctask-backend:latest"
}

variable "container_port" {
  description = "Port exposed by the container"
  type        = number
  default     = 3000
}

variable "cpu" {
  description = "Fargate CPU units (256, 512, 1024, 2048, 4096)"
  type        = number
  default     = 512
}

variable "memory" {
  description = "Fargate memory allocation in MB (512, 1024, 2048, 4096, 8192)"
  type        = number
  default     = 1024
}

variable "desired_count" {
  description = "Desired number of running ECS task replicas"
  type        = number
  default     = 2
}

variable "min_capacity" {
  description = "Minimum task count for autoscaling"
  type        = number
  default     = 2
}

variable "max_capacity" {
  description = "Maximum task count for autoscaling"
  type        = number
  default     = 10
}

variable "health_check_path" {
  description = "Health check path for ALB target group"
  type        = string
  default     = "/health"
}

variable "secrets_manager_arns" {
  description = "Map of secret names to Secrets Manager ARNs for task environment injection"
  type        = map(string)
  default     = {}
}

variable "environment_variables" {
  description = "List of name-value pairs for non-sensitive container environment variables"
  type = list(object({
    name  = string
    value = string
  }))
  default = []
}

variable "cloudwatch_log_group_name" {
  description = "CloudWatch log group name for container logs"
  type        = string
}

variable "tags" {
  description = "Common tags applied to all compute resources"
  type        = map(string)
  default     = {}
}
