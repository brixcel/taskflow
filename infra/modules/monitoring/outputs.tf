output "log_group_name" {
  description = "The name of the CloudWatch log group for application logs"
  value       = aws_cloudwatch_log_group.app.name
}

output "log_group_arn" {
  description = "The ARN of the CloudWatch log group for application logs"
  value       = aws_cloudwatch_log_group.app.arn
}

output "sns_topic_arn" {
  description = "The ARN of the SNS topic for operational alerts"
  value       = aws_sns_topic.alerts.arn
}
