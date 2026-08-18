output "bucket_name" {
  description = "The name of the S3 attachments bucket"
  value       = aws_s3_bucket.attachments.id
}

output "bucket_arn" {
  description = "The ARN of the S3 attachments bucket"
  value       = aws_s3_bucket.attachments.arn
}

output "kms_key_arn" {
  description = "The ARN of the KMS key used for storage encryption"
  value       = aws_kms_key.storage.arn
}

output "kms_key_id" {
  description = "The ID of the KMS key used for storage encryption"
  value       = aws_kms_key.storage.key_id
}
