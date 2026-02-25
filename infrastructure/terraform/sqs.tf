# SQS Queue for document processing requests
resource "aws_sqs_queue" "documents_queue" {
  name                       = "${var.project_name}-${var.environment}-documents-queue"
  delay_seconds              = 0
  max_message_size           = 262144
  message_retention_seconds  = 345600 # 4 days
  receive_wait_time_seconds  = 0
  visibility_timeout_seconds = 30

  redrive_policy = jsonencode({
    deadLetterTargetArn = aws_sqs_queue.documents_dlq.arn
    maxReceiveCount     = 10
  })

  tags = {
    Name = "${var.project_name}-${var.environment}-documents-queue"
  }
}

# SQS Queue for document indexing requests
resource "aws_sqs_queue" "index_documents_queue" {
  name                       = "${var.project_name}-${var.environment}-index-documents-queue"
  delay_seconds              = 0
  max_message_size           = 262144
  message_retention_seconds  = 345600 # 4 days
  receive_wait_time_seconds  = 0
  visibility_timeout_seconds = 30

  redrive_policy = jsonencode({
    deadLetterTargetArn = aws_sqs_queue.index_documents_dlq.arn
    maxReceiveCount     = 10
  })

  tags = {
    Name = "${var.project_name}-${var.environment}-index-documents-queue"
  }
}

# Dead Letter Queue for documents processing
resource "aws_sqs_queue" "documents_dlq" {
  name                      = "${var.project_name}-${var.environment}-documents-dlq"
  message_retention_seconds = 1209600 # 14 days

  tags = {
    Name = "${var.project_name}-${var.environment}-documents-dlq"
  }
}

# Dead Letter Queue for document indexing
resource "aws_sqs_queue" "index_documents_dlq" {
  name                      = "${var.project_name}-${var.environment}-index-documents-dlq"
  message_retention_seconds = 1209600 # 14 days

  tags = {
    Name = "${var.project_name}-${var.environment}-index-documents-dlq"
  }
}


# SQS Queue for long-running AI requests (image/video generation)
resource "aws_sqs_queue" "requests_queue" {
  name                       = "${var.project_name}-${var.environment}-requests-queue"
  delay_seconds              = 0
  max_message_size           = 262144
  message_retention_seconds  = 345600 # 4 days
  receive_wait_time_seconds  = 0
  visibility_timeout_seconds = 120 # longer timeout for image/video generation

  redrive_policy = jsonencode({
    deadLetterTargetArn = aws_sqs_queue.requests_dlq.arn
    maxReceiveCount     = 3
  })

  tags = {
    Name = "${var.project_name}-${var.environment}-requests-queue"
  }
}

# Dead Letter Queue for AI requests
resource "aws_sqs_queue" "requests_dlq" {
  name                      = "${var.project_name}-${var.environment}-requests-dlq"
  message_retention_seconds = 1209600 # 14 days

  tags = {
    Name = "${var.project_name}-${var.environment}-requests-dlq"
  }
}

# IAM policy for SQS access
resource "aws_iam_policy" "sqs_access" {
  name        = "${var.project_name}-${var.environment}-sqs-access"
  description = "Policy for SQS access for document processing"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "sqs:SendMessage",
          "sqs:ReceiveMessage",
          "sqs:DeleteMessage",
          "sqs:GetQueueAttributes",
          "sqs:GetQueueUrl"
        ]
        Resource = [
          aws_sqs_queue.documents_queue.arn,
          aws_sqs_queue.index_documents_queue.arn,
          aws_sqs_queue.documents_dlq.arn,
          aws_sqs_queue.index_documents_dlq.arn,
          aws_sqs_queue.requests_queue.arn,
          aws_sqs_queue.requests_dlq.arn,
        ]
      },
      {
        Effect = "Allow"
        Action = [
          "sqs:ListQueues"
        ]
        Resource = "*"
      }
    ]
  })
}

# Attach SQS policy to ECS task role
resource "aws_iam_role_policy_attachment" "ecs_task_sqs_policy" {
  role       = aws_iam_role.ecs_task_role.name
  policy_arn = aws_iam_policy.sqs_access.arn
}
