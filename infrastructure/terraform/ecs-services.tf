


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

# Local values for stable container definitions
locals {
  # Static environment variables that don't change between deployments
  static_environment_vars = [
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
      name  = "DB_MIGRATIONS_PATH"
      value = "./db-migrations/postgres/*-*.js"
    },
    {
      name  = "S3_REGION"
      value = var.aws_region
    },
    {
      name  = "S3_AWS_PROFILE"
      value = "default"
    },
    {
      name  = "SQS_REGION"
      value = var.aws_region
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
      name  = "ENABLED_API_PROVIDERS"
      value = "AWS_BEDROCK,OPEN_AI,YANDEX_FM,CUSTOM_REST_API"
    },
    {
      name  = "DEFAULT_ADMIN_EMAILS"
      value = var.default_admin_emails
    },
    {
      name  = "OPENAI_IGNORED_MODELS"
      value = "o1-pro,chatgpt-image,gpt-image,dall-e,o4,gpt-audio,gpt-4-0125-preview,gpt-4-0613,gpt-4-1106-preview,gpt-4o-2024-11-20,gpt-4o-mini-search-preview,gpt-5-2025-08-07,gpt-realtime,whisper-1,gpt-5-codex,gpt-5.2-codex"
    },
    {
      # Node's default thread pool size is 4, which can lead to performance issues under heavy load. 
      # Increasing it to 16 allows for better concurrency when handling multiple requests that involve file I/O, 
      # database access, or other operations that can benefit from additional threads.
      name  = "UV_THREADPOOL_SIZE"
      value = "16"
    }
  ]

  # Dynamic environment variables that can change
  dynamic_environment_vars = [
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
      value = "redis://${aws_elasticache_replication_group.redis.primary_endpoint_address}:${aws_elasticache_replication_group.redis.port}"
    },
    {
      name  = "S3_FILES_BUCKET_NAME"
      value = aws_s3_bucket.files.bucket
    },
    {
      name  = "SQS_DOCUMENTS_QUEUE"
      value = aws_sqs_queue.documents_queue.url
    },
    {
      name  = "SQS_INDEX_DOCUMENTS_QUEUE"
      value = aws_sqs_queue.index_documents_queue.url
    },
    {
      name  = "SQS_REQUESTS_QUEUE"
      value = aws_sqs_queue.requests_queue.url
    }
  ]

  # URL variables that depend on domain configuration
  url_environment_vars = var.domain_name != "" ? [
    {
      name  = "CALLBACK_URL_BASE"
      value = "https://${var.domain_name}"
    },
    {
      name  = "FRONTEND_URL"
      value = "https://${var.domain_name}"
    },
    {
      name  = "ALLOWED_ORIGINS"
      value = "https://${var.domain_name}"
    }
    ] : [
    {
      name  = "CALLBACK_URL_BASE"
      value = "http://${aws_lb.main.dns_name}"
    },
    {
      name  = "FRONTEND_URL"
      value = "http://${aws_lb.main.dns_name}"
    },
    {
      name  = "ALLOWED_ORIGINS"
      value = "http://${aws_lb.main.dns_name}"
    }
  ]

  app_container_definition = {
    name  = "app"
    image = "${aws_ecr_repository.repositories["app"].repository_url}:master"

    essential = true

    portMappings = [
      {
        containerPort = 80
        protocol      = "tcp"
      }
    ]

    environment = concat(
      local.static_environment_vars,
      local.dynamic_environment_vars,
      local.url_environment_vars
    )

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
        name      = "MICROSOFT_CLIENT_ID"
        valueFrom = aws_secretsmanager_secret.microsoft_client_id.arn
      },
      {
        name      = "MICROSOFT_CLIENT_SECRET"
        valueFrom = aws_secretsmanager_secret.microsoft_client_secret.arn
      },
      {
        name      = "YANDEX_FM_API_KEY"
        valueFrom = aws_secretsmanager_secret.yandex_fm_api_key.arn
      },
      {
        name      = "YANDEX_FM_API_FOLDER"
        valueFrom = aws_secretsmanager_secret.yandex_fm_api_folder.arn
      },
      {
        name      = "OPENAI_API_KEY"
        valueFrom = aws_secretsmanager_secret.openai_api_key.arn
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

  container_definitions = jsonencode([local.app_container_definition])

  tags = {
    Name = "${var.project_name}-${var.environment}-app-task"
  }

  lifecycle {
    create_before_destroy = true
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

# ECS Task Definition for Document Processor
resource "aws_ecs_task_definition" "document_processor" {
  family                   = "${var.project_name}-${var.environment}-document-processor"
  network_mode             = "awsvpc"
  cpu                      = var.document_processor_cpu
  memory                   = var.document_processor_memory
  execution_role_arn       = aws_iam_role.ecs_execution_role.arn
  task_role_arn            = aws_iam_role.ecs_task_role.arn
  requires_compatibilities = ["FARGATE"]

  ephemeral_storage {
    size_in_gib = var.document_processor_storage_gib
  }

  container_definitions = jsonencode([
    {
      name  = "document-processor"
      image = "${aws_ecr_repository.repositories["document-processor"].repository_url}:master"

      essential = true

      environment = [
        {
          name  = "PORT"
          value = "8080"
        },
        {
          name  = "ENVIRONMENT"
          value = "production"
        },
        {
          name  = "LOG_LEVEL"
          value = "INFO"
        },
        {
          name  = "SQS_REGION"
          value = var.aws_region
        },
        {
          name  = "SQS_DOCUMENTS_QUEUE"
          value = aws_sqs_queue.documents_queue.url
        },
        {
          name  = "SQS_INDEX_DOCUMENTS_QUEUE"
          value = aws_sqs_queue.index_documents_queue.url
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
          name  = "REDIS_URL"
          value = "redis://${aws_elasticache_replication_group.redis.primary_endpoint_address}:${aws_elasticache_replication_group.redis.port}"
        },
        {
          name  = "NUM_THREADS"
          value = "2"
        }
      ]

      logConfiguration = {
        logDriver = "awslogs"
        options = {
          "awslogs-group"         = aws_cloudwatch_log_group.document_processor.name
          "awslogs-region"        = var.aws_region
          "awslogs-stream-prefix" = "ecs"
        }
      }

      healthCheck = {
        command     = ["CMD-SHELL", "curl -f http://localhost:8080 || exit 1"]
        interval    = 30
        timeout     = 5
        retries     = 5
        startPeriod = 120
      }
    }
  ])

  tags = {
    Name = "${var.project_name}-${var.environment}-document-processor-task"
  }
}

# ECS Service for Document Processor
resource "aws_ecs_service" "document_processor" {
  name            = "${var.project_name}-${var.environment}-document-processor-service"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.document_processor.arn
  desired_count   = var.document_processor_desired_count
  capacity_provider_strategy {
    capacity_provider = "FARGATE"
    weight            = 1
  }

  network_configuration {
    security_groups  = [aws_security_group.ecs.id]
    subnets          = var.use_private_networks ? aws_subnet.private[*].id : aws_subnet.public[*].id
    assign_public_ip = var.use_private_networks ? false : true
  }

  deployment_maximum_percent         = 200
  deployment_minimum_healthy_percent = 50

  deployment_circuit_breaker {
    enable   = true
    rollback = true
  }

  tags = {
    Name = "${var.project_name}-${var.environment}-document-processor-service"
  }
}
