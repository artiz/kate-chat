# Generate secrets and configurations for ECS services
resource "random_password" "backend_session_secret" {
  length  = 128
  special = false
}


# ECS Task Definition for Backend
resource "aws_ecs_task_definition" "backend" {
  family                   = "${var.project_name}-${var.environment}-backend"
  network_mode             = "awsvpc"
  cpu                      = var.backend_cpu
  memory                   = var.backend_memory
  execution_role_arn       = aws_iam_role.ecs_execution_role.arn
  task_role_arn           = aws_iam_role.ecs_task_role.arn

  container_definitions = jsonencode([
    {
      name  = "backend"
      image = "${aws_ecr_repository.backend.repository_url}:master"
      
      essential = true
      
      portMappings = [
        {
          containerPort = 8080
          protocol      = "tcp"
        }
      ]

      environment = [
        {
          name  = "NODE_ENV"
          value = var.environment
        },
        {
          name  = "PORT"
          value = "8080"
        },
        {
          name  = "DEMO_MODE"
          value = "true"
        },
        {
          name  = "DB_TYPE"
          value = "postgres"
        },
        {
          name  = "DB_SSL"
          value = "yes"
        },
        {
          name  = "DB_URL"
          value = "postgres://${aws_db_instance.main.username}:${urlencode(aws_secretsmanager_secret_version.db_password.secret_string)}@${aws_db_instance.main.address}:${aws_db_instance.main.port}/${aws_db_instance.main.db_name}"
        },
        {
          name  = "DB_USERNAME"
          value = aws_db_instance.main.username
        },
        {
          name  = "REDIS_URL"
          value = "redis://${aws_elasticache_cluster.redis.cache_nodes[0].address}:${aws_elasticache_cluster.redis.port}"
        },
        # {
        #   name  = "S3_REGION"
        #   value = var.aws_region
        # },
        # {
        #   name  = "S3_FILES_BUCKET_NAME"
        #   value = aws_s3_bucket.files.bucket
        # },
        {
          name  = "CALLBACK_URL_BASE"
          value = var.domain_name != "" ? "https://${var.domain_name}" : "http://${aws_lb.main.dns_name}"
        },
        {
          name  = "FRONTEND_URL"
          value = var.domain_name != "" ? "https://${var.domain_name}" : "http://${aws_lb.main.dns_name}"
        },
        {
          name  = "ALLOWED_ORIGINS"
          value = var.domain_name != "" ? "https://${var.domain_name}" : "http://${aws_lb.main.dns_name}"
        },
        {
          name  = "JWT_EXPIRATION"
          value = "86400"
        },
        {
          name  = "JWT_SECRET"
          value = random_password.backend_session_secret.result
        },
        {
          name  = "SESSION_SECRET"
          value = random_password.backend_session_secret.result
        },
        {
          name = "ENABLED_API_PROVIDERS",
          value = "aws_bedrock,open_ai,yandex_fm"
        }
      ]
      
      secrets = [
        {
          name      = "DB_PASSWORD"
          valueFrom = aws_secretsmanager_secret.db_password.arn
        },
        {
          name      = "RECAPTCHA_SECRET_KEY"
          valueFrom = aws_secretsmanager_secret.recaptcha_secret_key.arn
        },
        {
          name      = "GOOGLE_CLIENT_ID"
          valueFrom = aws_secretsmanager_secret.google_client_id.arn
        },
        {
          name      = "GOOGLE_CLIENT_SECRET"
          valueFrom = aws_secretsmanager_secret.google_client_secret.arn
        },
        {
          name      = "GITHUB_CLIENT_ID"
          valueFrom = aws_secretsmanager_secret.github_client_id.arn
        },
        {
          name      = "GITHUB_CLIENT_SECRET"
          valueFrom = aws_secretsmanager_secret.github_client_secret.arn
        }
      ]
      
      logConfiguration = {
        logDriver = "awslogs"
        options = {
          "awslogs-group"         = aws_cloudwatch_log_group.backend.name
          "awslogs-region"        = var.aws_region
          "awslogs-stream-prefix" = "ecs"
        }
      }
      
      healthCheck = {
        command = ["CMD-SHELL", "curl -f http://localhost:8080/health || exit 1"]
        interval = 60
        timeout = 5
        retries = 10
      }
    }
  ])

  tags = {
    Name = "${var.project_name}-${var.environment}-backend-task"
  }
}

# ECS Task Definition for Frontend
resource "aws_ecs_task_definition" "frontend" {
  family                   = "${var.project_name}-${var.environment}-frontend"
  network_mode             = "awsvpc"
  cpu                      = var.frontend_cpu
  memory                   = var.frontend_memory
  execution_role_arn       = aws_iam_role.ecs_execution_role.arn

  container_definitions = jsonencode([
    {
      name  = "frontend"
      image = "${aws_ecr_repository.frontend.repository_url}:master"
      
      essential = true
      
      portMappings = [
        {
          containerPort = 80
          protocol      = "tcp"
        }
      ]
      
      logConfiguration = {
        logDriver = "awslogs"
        options = {
          "awslogs-group"         = aws_cloudwatch_log_group.frontend.name
          "awslogs-region"        = var.aws_region
          "awslogs-stream-prefix" = "ecs"
        }
      }
      
      healthCheck = {
        command = ["CMD-SHELL", "curl -f http://localhost:80 || exit 1"]
        interval = 30
        timeout = 5
        retries = 3
      }
    }
  ])

  tags = {
    Name = "${var.project_name}-${var.environment}-frontend-task"
  }
}

# ECS Service for Backend
resource "aws_ecs_service" "backend" {
  name            = "${var.project_name}-${var.environment}-backend-service"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.backend.arn
  desired_count   = var.backend_desired_count
  launch_type     = "FARGATE"

  network_configuration {
    security_groups  = [aws_security_group.ecs.id]
    subnets          = aws_subnet.private[*].id
    assign_public_ip = false
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.backend.arn
    container_name   = "backend"
    container_port   = 8080
  }

  depends_on = [aws_lb_listener.main]

  deployment_maximum_percent = 200
  deployment_minimum_healthy_percent = 100

  deployment_circuit_breaker {
    enable   = true
    rollback = true
  }

  tags = {
    Name = "${var.project_name}-${var.environment}-backend-service"
  }
}

# ECS Service for Frontend
resource "aws_ecs_service" "frontend" {
  name            = "${var.project_name}-${var.environment}-frontend-service"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.frontend.arn
  desired_count   = var.frontend_desired_count
  launch_type     = "FARGATE"

  network_configuration {
    security_groups  = [aws_security_group.ecs.id]
    subnets          = aws_subnet.private[*].id
    assign_public_ip = false
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.frontend.arn
    container_name   = "frontend"
    container_port   = 80
  }

  depends_on = [aws_lb_listener.main]

  deployment_maximum_percent = 200
  deployment_minimum_healthy_percent = 100

  deployment_circuit_breaker {
    enable   = true
    rollback = true
  }

  tags = {
    Name = "${var.project_name}-${var.environment}-frontend-service"
  }
}
