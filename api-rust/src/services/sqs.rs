//! SQS client for the RAG documents pipeline: the API sends
//! `parse_document` commands to the documents queue (consumed by the
//! external document-processor) and polls the index queue for
//! `index_document` commands coming back. Mirrors the Node API's
//! BaseSqsService/DocumentSqsService.

use aws_config::{BehaviorVersion, Region};
use aws_sdk_sqs::Client as SqsClient;
use serde_json::Value;
use tracing::debug;

use crate::config::AppConfig;
use crate::utils::errors::AppError;

pub struct SqsService {
    client: SqsClient,
}

impl SqsService {
    pub async fn new(config: &AppConfig) -> Result<Self, AppError> {
        let mut builder = aws_config::defaults(BehaviorVersion::v2025_01_17());

        if let Some(region) = &config.sqs_region {
            builder = builder.region(Region::new(region.clone()));
        }
        if let (Some(access_key), Some(secret_key)) =
            (&config.sqs_access_key_id, &config.sqs_secret_access_key)
        {
            let credentials = aws_sdk_sqs::config::Credentials::new(
                access_key,
                secret_key,
                None,
                None,
                "kate-chat",
            );
            builder = builder.credentials_provider(credentials);
        }
        if let Some(endpoint) = &config.sqs_endpoint {
            builder = builder.endpoint_url(endpoint.clone());
        }

        let aws_config = builder.load().await;
        Ok(Self {
            client: SqsClient::new(&aws_config),
        })
    }

    pub async fn send_json_message(
        &self,
        queue_url: &str,
        message: &Value,
    ) -> Result<(), AppError> {
        let body = message.to_string();
        let result = self
            .client
            .send_message()
            .queue_url(queue_url)
            .message_body(&body)
            .send()
            .await
            .map_err(|e| {
                AppError::Aws(format!(
                    "Failed to send SQS message: {}",
                    e.into_service_error()
                ))
            })?;

        debug!(
            "Sent SQS message {} ({} bytes) to {}",
            result.message_id().unwrap_or("-"),
            body.len(),
            queue_url
        );
        Ok(())
    }

    /// Enqueue a `parse_document` command for the document-processor.
    pub async fn send_parse_document(
        &self,
        config: &AppConfig,
        document_id: &str,
        s3key: &str,
        mime: Option<&str>,
    ) -> Result<(), AppError> {
        let queue = config
            .sqs_documents_queue
            .as_deref()
            .ok_or_else(|| AppError::Validation("SQS_DOCUMENTS_QUEUE not configured".into()))?;
        let mut message = serde_json::json!({
            "command": "parse_document",
            "documentId": document_id,
            "s3key": s3key,
        });
        if let Some(mime) = mime {
            message["mime"] = serde_json::json!(mime);
        }
        self.send_json_message(queue, &message).await
    }
}
