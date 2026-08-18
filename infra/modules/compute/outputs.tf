output "cluster_id" {
  description = "The ID of the ECS Cluster"
  value       = aws_ecs_cluster.main.id
}

output "cluster_name" {
  description = "The name of the ECS Cluster"
  value       = aws_ecs_cluster.main.name
}

output "service_name" {
  description = "The name of the ECS Service"
  value       = aws_ecs_service.app.name
}

output "alb_id" {
  description = "The ID of the Application Load Balancer"
  value       = aws_lb.main.id
}

output "alb_arn" {
  description = "The ARN of the Application Load Balancer"
  value       = aws_lb.main.arn
}

output "alb_arn_suffix" {
  description = "The ARN suffix of the Application Load Balancer for CloudWatch metrics"
  value       = aws_lb.main.arn_suffix
}

output "alb_dns_name" {
  description = "The DNS name of the Application Load Balancer for accessing the application"
  value       = aws_lb.main.dns_name
}

output "alb_zone_id" {
  description = "The canonical hosted zone ID of the load balancer (for Route53 Alias records)"
  value       = aws_lb.main.zone_id
}

output "target_group_arn" {
  description = "The ARN of the ALB target group"
  value       = aws_lb_target_group.app.arn
}

output "target_group_arn_suffix" {
  description = "The ARN suffix of the ALB target group for CloudWatch metrics"
  value       = aws_lb_target_group.app.arn_suffix
}


output "task_execution_role_arn" {
  description = "The ARN of the ECS task execution role"
  value       = aws_iam_role.ecs_execution.arn
}

output "task_role_arn" {
  description = "The ARN of the ECS task runtime role"
  value       = aws_iam_role.ecs_task.arn
}
