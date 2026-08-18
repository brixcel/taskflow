variable "environment" {
  description = "Deployment environment name (e.g. staging, production)"
  type        = string
}

variable "project_name" {
  description = "Project name identifier for resource naming and tagging"
  type        = string
  default     = "synctask"
}

variable "log_retention_days" {
  description = "Number of days to retain CloudWatch logs (e.g. 30 for staging, 90 for production)"
  type        = number
  default     = 30
}

variable "ecs_cluster_name" {
  description = "Name of the ECS Cluster to monitor"
  type        = string
}

variable "ecs_service_name" {
  description = "Name of the ECS Service to monitor"
  type        = string
}

variable "alb_arn_suffix" {
  description = "ARN suffix of the Application Load Balancer for CloudWatch metrics"
  type        = string
}

variable "target_group_arn_suffix" {
  description = "ARN suffix of the ALB Target Group for CloudWatch metrics"
  type        = string
}

variable "db_instance_id" {
  description = "Identifier of the RDS PostgreSQL instance to monitor"
  type        = string
}

variable "alert_email" {
  description = "Email address to receive critical CloudWatch alerts via SNS (optional)"
  type        = string
  default     = ""
}

variable "tags" {
  description = "Common tags applied to all monitoring resources"
  type        = map(string)
  default     = {}
}
