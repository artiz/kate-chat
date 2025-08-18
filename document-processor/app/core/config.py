from typing import List, Optional
from pydantic_settings import BaseSettings, SettingsConfigDict
from pytz import VERSION


class Settings(BaseSettings):
    port: int = 8080
    version: str = "0.0.1"
    
    project_name: str = "kate-chat-document-processor"
    log_level: str = "INFO"
    
    workers: int = 1
    
    document_status_channel: str = "document:status"
    redis_url: str = "redis://localhost:6379"
    
    s3_endpoint: str
    s3_region: str
    s3_access_key_id: str
    s3_secret_access_key: str
    s3_files_bucket_name: str = "katechatdevfiles"
    
    sqs_endpoint: str = None
    sqs_region: str
    sqs_access_key_id: str
    sqs_secret_access_key: str
    sqs_documents_queue: str
    sqs_index_documents_queue: str
    
    model_config = SettingsConfigDict(env_file=".env")

settings = Settings()
