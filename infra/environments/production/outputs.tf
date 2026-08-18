output "alb_url" {
  description = "Public ALB URL for SyncTask production environment"
  value       = "http://${module.compute.alb_dns_name}"
}

output "alb_dns_name" {
  description = "Canonical DNS hostname for Route53 ALIAS record mapping"
  value       = module.compute.alb_dns_name
}

output "alb_zone_id" {
  description = "Canonical hosted zone ID for Route53 ALIAS record"
  value       = module.compute.alb_zone_id
}

output "database_endpoint" {
  description = "PostgreSQL endpoint for production database (Multi-AZ)"
  value       = module.database.db_endpoint
}

output "s3_attachments_bucket" {
  description = "S3 attachments bucket name"
  value       = module.storage.bucket_name
}

output "waf_web_acl_id" {
  description = "AWS WAF Web ACL ID attached to ALB"
  value       = aws_wafv2_web_acl.alb.id
}

output "cloudwatch_log_group" {
  description = "CloudWatch log group for production logs (90-day retention)"
  value       = module.monitoring.log_group_name
}

output "sns_alerts_topic" {
  description = "SNS topic ARN for operational alerts"
  value       = module.monitoring.sns_topic_arn
}
