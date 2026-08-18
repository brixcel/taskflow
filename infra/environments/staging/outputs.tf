output "alb_url" {
  description = "Public ALB URL for SyncTask staging environment"
  value       = "http://${module.compute.alb_dns_name}"
}

output "database_endpoint" {
  description = "PostgreSQL endpoint for staging database"
  value       = module.database.db_endpoint
}

output "s3_attachments_bucket" {
  description = "S3 attachments bucket name"
  value       = module.storage.bucket_name
}

output "cloudwatch_log_group" {
  description = "CloudWatch log group for staging logs"
  value       = module.monitoring.log_group_name
}

output "sns_alerts_topic" {
  description = "SNS topic ARN for operational alerts"
  value       = module.monitoring.sns_topic_arn
}
