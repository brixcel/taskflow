variable "environment" {
  description = "Deployment environment name (e.g. staging, production)"
  type        = string
}

variable "project_name" {
  description = "Project name identifier for resource naming and tagging"
  type        = string
  default     = "synctask"
}

variable "cors_allowed_origins" {
  description = "List of allowed frontend origins for S3 direct upload CORS"
  type        = list(string)
  default     = ["*"]
}

variable "tags" {
  description = "Common tags applied to all storage resources"
  type        = map(string)
  default     = {}
}
