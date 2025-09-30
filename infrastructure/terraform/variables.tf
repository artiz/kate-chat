variable "aws_region" {
  description = "AWS region for resources"
  type        = string
  default     = "us-east-1"
}

variable "environment" {
  description = "Environment name (staging/production)"
  type        = string
  validation {
    condition     = contains(["staging", "production"], var.environment)
    error_message = "Environment must be either 'staging' or 'production'."
  }
}

variable "project_name" {
  description = "Name of the project"
  type        = string
  default     = "katechat"
}

# use only one deployed version of the application for now
variable "domain_name" {
  description = "Domain name for the application"
  type        = string
}


variable "certificate_arn" {
  description = "ARN of the SSL certificate"
  type        = string
}

variable "aws_route53_record_zone_id" {
  description = "Route 53 hosted zone ID"
  type        = string
}

# Database configuration
variable "db_instance_class" {
  description = "RDS instance class"
  type        = string
  default     = "db.t3.micro"
}

variable "db_allocated_storage" {
  description = "RDS allocated storage in GB"
  type        = number
  default     = 10
}

variable "db_engine_version" {
  description = "PostgreSQL engine version"
  type        = string
  default     = "16.9"
}

# ECS configuration
variable "app_cpu" {
  description = "CPU units for backend service"
  type        = number
  default     = 256
}

variable "app_memory" {
  description = "Memory (MB) for backend service"
  type        = number
  default     = 512
}

variable "app_desired_count" {
  description = "Desired number of backend tasks"
  type        = number
  default     = 2
}

# Document processor ECS configuration
variable "document_processor_cpu" {
  description = "CPU units for document processor service"
  type        = number
  default     = 1024
}

variable "document_processor_memory" {
  description = "Memory (MB) for document processor service"
  type        = number
  default     = 8192
}

variable "document_processor_storage_gib" {
  description = "Ephemeral storage (GiB) for document processor service"
  type        = number
  default     = 64
}

variable "document_processor_desired_count" {
  description = "Desired number of document processor tasks"
  type        = number
  default     = 0
}

# Network configuration
variable "use_private_networks" {
  description = "Use private subnets and NAT gateways (true) or public subnets (false). Private is more secure but costs more due to NAT gateway."
  type        = bool
  default     = false
}

# Redis configuration
variable "redis_node_type" {
  description = "ElastiCache node type"
  type        = string
  default     = "cache.t2.micro"
}

variable "redis_num_cache_nodes" {
  description = "Number of cache nodes"
  type        = number
  default     = 1
}

variable "default_admin_emails" {
  description = "Comma separated list of default admin email addresses"
  type        = string
}

