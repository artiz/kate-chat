# Terraform Variables for KateChat Demo Environment
aws_region   = "eu-central-1"
environment  = "staging"
project_name = "katechat"

# Cost Optimization Settings
use_private_networks = false # Use public subnets to avoid NAT Gateway costs (~$35/month savings)

# Domain Configuration
domain_name                = "katechat.tech"
certificate_arn            = "arn:aws:acm:eu-central-1:508414931829:certificate/70c77f1e-3a3f-4530-b393-48bedf6fed60"
default_admin_emails       = "artem.kustikov@gmail.com"
aws_route53_record_zone_id = "Z08280421TLAENXYORVOR"

# Database Configuration (Optimized for cost)
db_instance_class    = "db.t4g.micro" # ARM-based Graviton2, ~20% cheaper than t3.micro
db_allocated_storage = 10
db_engine_version    = "16.9"

# ECS Configuration (Optimized for cost)
app_cpu           = 256 # 0.25 vCPU
app_memory        = 512 # 512 MB
app_desired_count = 1   # Reduced from 2 to 1 for staging (~$13/month savings)

# Document Processor Configuration
document_processor_cpu           = 1024 # 1 vCPU
document_processor_memory        = 8192 # 8 GB
document_processor_storage_gib   = 64
document_processor_desired_count = 1 # Only run when needed

# Redis Configuration (Optimized for cost)
redis_node_type       = "cache.t4g.micro" # ARM-based Graviton2, ~20% cheaper than t2.micro
redis_num_cache_nodes = 1

