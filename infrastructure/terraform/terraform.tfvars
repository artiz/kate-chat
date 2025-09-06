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

# Database Configuration
db_instance_class    = "db.t3.micro"
db_allocated_storage = 10
db_engine_version    = "16.9"

# ECS Configuration - Optimized for cost
app_cpu           = 256
app_memory        = 512
app_desired_count = 2

# Redis Configuration
redis_node_type       = "cache.t2.micro"
redis_num_cache_nodes = 1

