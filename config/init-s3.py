import boto3

s3_client = boto3.client(
    "s3",
    endpoint_url="http://localhost:4566",
    aws_access_key_id="localstack",
    aws_secret_access_key="localstack"
)

s3_client.create_bucket(Bucket="katechatdevfiles")
