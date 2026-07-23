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
                    aws_smithy_types::error::display::DisplayErrorContext(&e)
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

    /// Long-poll a queue; returns (body, receipt_handle) pairs.
    pub async fn receive_messages(
        &self,
        queue_url: &str,
        max_messages: i32,
        wait_seconds: i32,
    ) -> Result<Vec<(String, String)>, AppError> {
        let result = self
            .client
            .receive_message()
            .queue_url(queue_url)
            .max_number_of_messages(max_messages)
            .wait_time_seconds(wait_seconds)
            .visibility_timeout(300)
            .send()
            .await
            .map_err(|e| {
                AppError::Aws(format!(
                    "Failed to receive SQS messages: {}",
                    aws_smithy_types::error::display::DisplayErrorContext(&e)
                ))
            })?;

        Ok(result
            .messages()
            .iter()
            .filter_map(|m| Some((m.body()?.to_string(), m.receipt_handle()?.to_string())))
            .collect())
    }

    pub async fn delete_message(
        &self,
        queue_url: &str,
        receipt_handle: &str,
    ) -> Result<(), AppError> {
        self.client
            .delete_message()
            .queue_url(queue_url)
            .receipt_handle(receipt_handle)
            .send()
            .await
            .map_err(|e| {
                AppError::Aws(format!(
                    "Failed to delete SQS message: {}",
                    aws_smithy_types::error::display::DisplayErrorContext(&e)
                ))
            })?;
        Ok(())
    }

    /// Probe used by the ignored integration test below.
    #[cfg(test)]
    pub async fn probe_send(&self, queue_url: &str) -> Result<(), AppError> {
        self.send_json_message(queue_url, &serde_json::json!({"command": "probe"}))
            .await
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

#[cfg(test)]
mod tests {
    use super::*;

    /// Live probe against a local SQS endpoint (LocalStack or the fake
    /// server in scratchpad). Run with: cargo test sqs_probe -- --ignored
    #[tokio::test]
    #[ignore]
    async fn sqs_probe() {
        let mut config = AppConfig::from_env();
        config.sqs_endpoint = Some("http://localhost:4566".to_string());
        config.sqs_region = Some("eu-central-1".to_string());
        config.sqs_access_key_id = Some("localstack".to_string());
        config.sqs_secret_access_key = Some("localstack".to_string());
        let queue =
            "http://sqs.eu-central-1.localhost.localstack.cloud:4566/000000000000/documents-queue";

        let sqs = SqsService::new(&config).await.expect("client");
        match sqs.probe_send(queue).await {
            Ok(()) => println!("PROBE OK"),
            Err(e) => println!("PROBE ERR: {}", e),
        }
    }
}
