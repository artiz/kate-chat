# Generate secrets and configurations for ECS services
resource "random_password" "session_secret" {
  length  = 128
  special = false

  lifecycle {
    ignore_changes = [
      length,
      special,
    ]
  }
}


# ECS Task Definition for App
resource "aws_ecs_task_definition" "app" {
  family                   = "${var.project_name}-${var.environment}-app"
  network_mode             = "awsvpc"
  cpu                      = var.app_cpu
  memory                   = var.app_memory
  execution_role_arn       = aws_iam_role.ecs_execution_role.arn
  task_role_arn            = aws_iam_role.ecs_task_role.arn
  requires_compatibilities = ["FARGATE"]

  container_definitions = jsonencode([
    {
      name  = "app"
      image = "${aws_ecr_repository.repositories["app"].repository_url}:master"

      essential = true

      portMappings = [
        {
          containerPort = 80
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
          value = "80"
        },
        {
          name  = "LOG_LEVEL"
          value = "info"
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
          name  = "DB_MIGRATIONS_PATH"
          value = "./db-migrations/*.js"
        },
        {
          name  = "REDIS_URL"
          value = "redis://${aws_elasticache_cluster.redis.cache_nodes[0].address}:${aws_elasticache_cluster.redis.port}"
        },
        {
          name  = "S3_REGION"
          value = var.aws_region
        },
        {
          name  = "S3_FILES_BUCKET_NAME"
          value = aws_s3_bucket.files.bucket
        },
        {
          name  = "S3_AWS_PROFILE"
          value = "default"
        },
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
          value = random_password.session_secret.result
        },
        {
          name  = "SESSION_SECRET"
          value = random_password.session_secret.result
        },
        {
          name  = "ENABLED_API_PROVIDERS",
          value = "aws_bedrock,open_ai,yandex_fm"
        },
        {
          name  = "ENABLED_API_PROVIDERS",
          value = "aws_bedrock,open_ai,yandex_fm"
        },
        {
          name  = "DEFAULT_ADMIN_EMAILS"
          value = var.default_admin_emails,
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
        },
        {
          name      = "YANDEX_FM_API_KEY"
          valueFrom = aws_secretsmanager_secret.yandex_fm_api_key.arn
        },
        {
          name      = "YANDEX_FM_API_FOLDER"
          valueFrom = aws_secretsmanager_secret.yandex_fm_api_folder.arn
        }
      ]

      logConfiguration = {
        logDriver = "awslogs"
        options = {
          "awslogs-group"         = aws_cloudwatch_log_group.app.name
          "awslogs-region"        = var.aws_region
          "awslogs-stream-prefix" = "ecs"
        }
      }

      healthCheck = {
        command  = ["CMD-SHELL", "wget -q --spider http://localhost/health || exit 1"]
        interval = 10
        timeout  = 5
        retries  = 5
      }
    }
  ])

  tags = {
    Name = "${var.project_name}-${var.environment}-app-task"
  }
}



# ECS Service for Backend
resource "aws_ecs_service" "app" {
  name            = "${var.project_name}-${var.environment}-app-service"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.app.arn
  desired_count   = var.app_desired_count
  capacity_provider_strategy {
    capacity_provider = "FARGATE"
    weight            = 1
  }

  network_configuration {
    security_groups  = [aws_security_group.ecs.id]
    subnets          = var.use_private_networks ? aws_subnet.private[*].id : aws_subnet.public[*].id
    assign_public_ip = var.use_private_networks ? false : true
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.app.arn
    container_name   = "app"
    container_port   = 80
  }

  depends_on = [aws_lb_listener.main]

  deployment_maximum_percent         = 200
  deployment_minimum_healthy_percent = 100

  deployment_circuit_breaker {
    enable   = true
    rollback = true
  }

  tags = {
    Name = "${var.project_name}-${var.environment}-app-service"
  }
}
