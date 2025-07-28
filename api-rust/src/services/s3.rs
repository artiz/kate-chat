use aws_config::{BehaviorVersion, Region};
use aws_sdk_s3::{primitives::ByteStream, Client as S3Client};
use std::collections::HashMap;

use crate::config::AppConfig;
use crate::utils::errors::AppError;

pub struct S3Service {
    config: AppConfig,
    client: Option<S3Client>,
}

impl S3Service {
    pub fn new(config: AppConfig) -> Self {
        Self {
            config,
            client: None,
        }
    }

    async fn get_client(&mut self) -> Result<&S3Client, AppError> {
        if self.client.is_none() {
            let aws_config = self.build_aws_config().await?;
            self.client = Some(S3Client::new(&aws_config));
        }
        Ok(self.client.as_ref().unwrap())
    }

    async fn build_aws_config(&self) -> Result<aws_config::SdkConfig, AppError> {
        let mut config_builder = aws_config::defaults(BehaviorVersion::v2025_01_17());

        if let Some(region) = &self.config.s3_region {
            config_builder = config_builder.region(Region::new(region.clone()));
        }

        if let (Some(access_key), Some(secret_key)) = (
            &self.config.s3_access_key_id,
            &self.config.s3_secret_access_key,
        ) {
            let credentials = aws_credential_types::Credentials::new(
                access_key,
                secret_key,
                None,
                None,
                "kate-chat",
            );
            config_builder = config_builder.credentials_provider(credentials);
        }

        if let Some(endpoint) = &self.config.s3_endpoint {
            config_builder = config_builder.endpoint_url(endpoint.clone());
        }

        Ok(config_builder.load().await)
    }

    pub async fn upload_file(
        &mut self,
        key: &str,
        data: Vec<u8>,
        content_type: &str,
    ) -> Result<String, AppError> {
        let bucket = self
            .config
            .s3_bucket
            .clone()
            .ok_or_else(|| AppError::Internal("S3 bucket not configured".to_string()))?;
        let client = self.get_client().await?;

        let body = ByteStream::from(data);

        client
            .put_object()
            .bucket(&bucket)
            .key(key)
            .body(body)
            .content_type(content_type)
            .send()
            .await
            .map_err(|e| AppError::Aws(format!("S3 upload failed: {}", e)))?;

        // Return the S3 URL
        let region = self.config.s3_region.as_deref().unwrap_or("us-east-1");
        Ok(format!(
            "https://{}.s3.{}.amazonaws.com/{}",
            bucket, region, key
        ))
    }

    pub async fn delete_file(&mut self, key: &str) -> Result<(), AppError> {
        let bucket = self
            .config
            .s3_bucket
            .clone()
            .ok_or_else(|| AppError::Internal("S3 bucket not configured".to_string()))?;
        let client = self.get_client().await?;

        client
            .delete_object()
            .bucket(&bucket)
            .key(key)
            .send()
            .await
            .map_err(|e| AppError::Aws(format!("S3 delete failed: {}", e)))?;

        Ok(())
    }

    #[allow(dead_code)]
    pub async fn get_file_url(&self, key: &str) -> Result<String, AppError> {
        let bucket = self
            .config
            .s3_bucket
            .as_ref()
            .ok_or_else(|| AppError::Internal("S3 bucket not configured".to_string()))?;

        let region = self.config.s3_region.as_deref().unwrap_or("us-east-1");
        Ok(format!(
            "https://{}.s3.{}.amazonaws.com/{}",
            bucket, region, key
        ))
    }

    pub async fn test_connection(&mut self) -> Result<bool, AppError> {
        let bucket = self
            .config
            .s3_bucket
            .clone()
            .ok_or_else(|| AppError::Internal("S3 bucket not configured".to_string()))?;
        let client = self.get_client().await?;

        match client.head_bucket().bucket(&bucket).send().await {
            Ok(_) => Ok(true),
            Err(e) => {
                log::error!("S3 connection test failed: {}", e);
                Ok(false)
            }
        }
    }

    pub fn get_info(&self) -> HashMap<String, String> {
        let mut details = HashMap::new();

        details.insert(
            "configured".to_string(),
            self.config.s3_bucket.is_some().to_string(),
        );

        if let Some(bucket) = &self.config.s3_bucket {
            details.insert("bucket".to_string(), bucket.clone());
        }

        if let Some(region) = &self.config.s3_region {
            details.insert("region".to_string(), region.clone());
        }

        details
    }
}
