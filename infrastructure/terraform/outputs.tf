output "vpc_id" {
  description = "ID of the VPC"
  value       = aws_vpc.main.id
}

output "public_subnet_ids" {
  description = "IDs of the public subnets"
  value       = aws_subnet.public[*].id
}

output "private_subnet_ids" {
  description = "IDs of the private subnets"
  value       = aws_subnet.private[*].id
}

output "alb_dns_name" {
  description = "DNS name of the load balancer"
  value       = aws_lb.main.dns_name
}

output "alb_zone_id" {
  description = "Zone ID of the load balancer"
  value       = aws_lb.main.zone_id
}

output "ecr_repository_urls" {
  description = "URLs of the ECR repositories"
  value = {
    for key, repo in aws_ecr_repository.repositories : key => repo.repository_url
  }
}

output "ecs_cluster_name" {
  description = "Name of the ECS cluster"
  value       = aws_ecs_cluster.main.name
}

output "database_endpoint" {
  description = "RDS instance endpoint"
  value       = aws_db_instance.main.endpoint
  sensitive   = true
}

output "database_port" {
  description = "RDS instance port"
  value       = aws_db_instance.main.port
}

output "redis_endpoint" {
  description = "ElastiCache Redis endpoint"
  value       = aws_elasticache_cluster.redis.cache_nodes[0].address
}

output "redis_port" {
  description = "ElastiCache Redis port"
  value       = aws_elasticache_cluster.redis.port
}

output "s3_bucket_name" {
  description = "Name of the S3 bucket for files"
  value       = aws_s3_bucket.files.bucket
}

output "s3_bucket_arn" {
  description = "ARN of the S3 bucket for files"
  value       = aws_s3_bucket.files.arn
}

output "secrets_manager_db_password_arn" {
  description = "ARN of the database password in Secrets Manager"
  value       = aws_secretsmanager_secret.db_password.arn
  sensitive   = true
}

output "cloudwatch_log_groups" {
  description = "CloudWatch log group names"
  value = {
    app = aws_cloudwatch_log_group.app.name
  }
}

# Domain and DNS outputs
output "route53_zone_id" {
  description = "Route 53 hosted zone ID"
  value       = var.aws_route53_record_zone_id
}

output "custom_domain_name" {
  description = "Custom domain name for the application"
  value       = var.domain_name != "" ? var.domain_name : null
}

