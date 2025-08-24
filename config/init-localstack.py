import boto3

DOCUMENTS_QUEUE = "documents-queue"
DOCUMENTS_INDEX_QUEUE = "documents-index-queue"
FILES_BUCKET = "katechatdevfiles"

conn = {
    "endpoint_url": "http://localhost:4566",
    "aws_access_key_id": "localstack",
    "aws_secret_access_key": "localstack",
    "region_name": "us-east-1",
}

s3_client = boto3.client("s3", **conn)
sqs = boto3.resource("sqs", **conn)

s3_client.create_bucket(Bucket=FILES_BUCKET)
sqs.create_queue(QueueName=DOCUMENTS_QUEUE)
sqs.create_queue(QueueName=DOCUMENTS_INDEX_QUEUE)


queue = sqs.get_queue_by_name(QueueName=DOCUMENTS_QUEUE)
print(f"Created queue '{DOCUMENTS_QUEUE}' with URL={queue.url}")
queue = sqs.get_queue_by_name(QueueName=DOCUMENTS_INDEX_QUEUE)
print(f"Created queue '{DOCUMENTS_INDEX_QUEUE}' with URL={queue.url}")
