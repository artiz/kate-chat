# Terraform Variables for KateChat Demo Environment
aws_region = "eu-central-1"
environment = "staging"
project_name = "katechat"

# Domain Configuration
domain_name = "katechat.tech"
certificate_arn = "arn:aws:acm:eu-central-1:508414931829:certificate/70c77f1e-3a3f-4530-b393-48bedf6fed60"

# Database Configuration
db_instance_class = "db.t3.micro"
db_allocated_storage = 10
db_engine_version = "16.9"

# ECS Configuration
backend_cpu = 256
backend_memory = 512
frontend_cpu = 256
frontend_memory = 512
frontend_desired_count = 1
backend_desired_count = 2

# Redis Configuration
redis_node_type = "cache.t2.micro"
redis_num_cache_nodes = 1
