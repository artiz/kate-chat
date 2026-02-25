import os

import boto3

QUEUES = ["documents-queue", "documents-index-queue", "requests-queue"]
BUCKETS = ["katechatdevfiles"]

conn = {
    "endpoint_url": "http://localhost:4566",
    "aws_access_key_id": "localstack",
    "aws_secret_access_key": "localstack",
    "region_name": "eu-central-1"
}

s3_client = boto3.client("s3", **conn)
sqs = boto3.resource("sqs", **conn)


for bucket_name in BUCKETS:
    try:
        # us-east-1 must NOT pass LocationConstraint; all other regions require it
        create_bucket_kwargs = {"Bucket": bucket_name}
        if conn["region_name"] != "us-east-1":
            create_bucket_kwargs["CreateBucketConfiguration"] = {"LocationConstraint": conn["region_name"]}
        s3_client.create_bucket(**create_bucket_kwargs)
        print(f"Created S3 bucket '{bucket_name}' in {conn['region_name']}")
    except s3_client.exceptions.BucketAlreadyOwnedByYou:
        print(f"S3 bucket '{bucket_name}' already exists")

for queue_name in QUEUES:
    sqs.create_queue(QueueName=queue_name)
    queue = sqs.get_queue_by_name(QueueName=queue_name)
    print(f"Created queue '{queue_name}' with URL={queue.url}")
