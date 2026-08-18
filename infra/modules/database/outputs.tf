output "db_instance_id" {
  description = "The RDS instance ID"
  value       = aws_db_instance.main.id
}

output "db_endpoint" {
  description = "The connection endpoint for the RDS PostgreSQL database"
  value       = aws_db_instance.main.endpoint
}

output "db_address" {
  description = "The hostname of the RDS PostgreSQL database"
  value       = aws_db_instance.main.address
}

output "db_port" {
  description = "The database port"
  value       = aws_db_instance.main.port
}

output "db_name" {
  description = "The database name"
  value       = aws_db_instance.main.db_name
}

output "db_arn" {
  description = "The ARN of the RDS database instance"
  value       = aws_db_instance.main.arn
}

output "kms_key_arn" {
  description = "The ARN of the KMS key used for database encryption"
  value       = aws_kms_key.database.arn
}
