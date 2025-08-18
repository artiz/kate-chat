import os
from typing import List, Optional
from pydantic import AnyHttpUrl, EmailStr, validator
from pydantic_settings import BaseSettings
from pytz import VERSION


class Settings(BaseSettings):
    PROJECT_NAME: str = "kate-chat-document-processor"
    VERSION: str = "0.0.1"
    LOG_LEVEL: str = "INFO"
    
    
    DOCUMENT_STATUS_CHANNEL: str = "document:status"
    REDIS_URL: str = "redis://redis:6379"
    S3_ENDPOINT: str
    S3_REGION: str
    S3_ACCESS_KEY_ID: str
    S3_SECRET_ACCESS_KEY: str
    S3_FILES_BUCKET_NAME: str = "katechatdevfiles"
    SQS_DOCUMENTS_QUEUE: Optional[str] = "http://localhost:4566/000000000000/documents-queue"
    PORT: int = 8080
    API: str = "/api"

settings = Settings()
