from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    port: int = 8080
    version: str = "0.0.1"
    commit_sha: str = "---"
    environment: str = "development"
    
    project_name: str = "kate-chat-document-processor"
    log_level: str = "INFO"
    
    # uvicorn workers
    workers: int = 1
    reload: bool = True
    
    document_status_channel: str = "document:status"
    redis_url: str = "redis://localhost:6379"

    s3_endpoint: str | None = None
    s3_region: str
    s3_access_key_id: str | None = None
    s3_secret_access_key: str | None = None
    s3_files_bucket_name: str = "katechatdevfiles"
    
    sqs_endpoint: str | None = None
    sqs_region: str
    sqs_access_key_id: str | None = None
    sqs_secret_access_key: str | None = None
    sqs_documents_queue: str
    sqs_index_documents_queue: str
    
    # Number of parallel threads for Docling processing (1 - 10, limited by SQS)
    # based on SQS concurrency limits and processing capacity
    num_threads: int = 5
    # Number of PDF pages to split large documents into smaller batches
    pdf_page_batch_size: int = 10
    # Restart worker process after this many tasks
    worker_restart_after: int = 20  
    
    model_config = SettingsConfigDict(env_file=".env")

settings = Settings()


def validate_settings() -> None:
    if not 1 <= settings.num_threads <= 10:
        raise ValueError("num_threads must be between 1 and 10 inclusive")


validate_settings()
