output "vpc_id" {
  description = "The ID of the Virtual Private Cloud (VPC)"
  value       = aws_vpc.main.id
}

output "vpc_cidr" {
  description = "The CIDR block of the VPC"
  value       = aws_vpc.main.cidr_block
}

output "public_subnet_ids" {
  description = "List of public subnet IDs"
  value       = aws_subnet.public[*].id
}

output "private_app_subnet_ids" {
  description = "List of private application subnet IDs (ECS Fargate)"
  value       = aws_subnet.private_app[*].id
}

output "private_db_subnet_ids" {
  description = "List of private database subnet IDs (RDS PostgreSQL)"
  value       = aws_subnet.private_db[*].id
}

output "alb_security_group_id" {
  description = "The ID of the Application Load Balancer security group"
  value       = aws_security_group.alb.id
}

output "ecs_security_group_id" {
  description = "The ID of the ECS Fargate security group"
  value       = aws_security_group.ecs.id
}

output "db_security_group_id" {
  description = "The ID of the RDS database security group"
  value       = aws_security_group.db.id
}
