//! Thin S3 helper around the AWS SDK client.
//!
//! Every operation is wrapped in a timeout so a stalled S3 endpoint fails the
//! call instead of hanging the worker forever.

use std::future::Future;
use std::time::Duration;

use anyhow::{Context, Result};
use aws_sdk_s3::primitives::ByteStream;

/// S3 access scoped to a single bucket.
#[derive(Clone)]
pub struct S3 {
    client: aws_sdk_s3::Client,
    bucket: String,
    timeout: Duration,
}

impl S3 {
    pub fn new(client: aws_sdk_s3::Client, bucket: impl Into<String>, timeout: Duration) -> Self {
        Self {
            client,
            bucket: bucket.into(),
            timeout,
        }
    }

    /// Await `fut` with the configured per-operation timeout.
    async fn timed<T>(&self, op: &str, fut: impl Future<Output = Result<T>>) -> Result<T> {
        match tokio::time::timeout(self.timeout, fut).await {
            Ok(result) => result,
            Err(_) => Err(anyhow::anyhow!(
                "S3 {op} timed out after {}s",
                self.timeout.as_secs()
            )),
        }
    }

    /// Download an object, returning its bytes and (if present) content type.
    pub async fn get_object(&self, key: &str) -> Result<(Vec<u8>, Option<String>)> {
        self.timed("get_object", async {
            let resp = self
                .client
                .get_object()
                .bucket(&self.bucket)
                .key(key)
                .send()
                .await
                .with_context(|| format!("get_object {key}"))?;

            let content_type = resp.content_type().map(|s| s.to_string());
            let bytes = resp
                .body
                .collect()
                .await
                .with_context(|| format!("read body of {key}"))?
                .into_bytes()
                .to_vec();
            Ok((bytes, content_type))
        })
        .await
    }

    /// Download an object as UTF-8 text.
    pub async fn get_object_text(&self, key: &str) -> Result<String> {
        let (bytes, _) = self.get_object(key).await?;
        Ok(String::from_utf8_lossy(&bytes).into_owned())
    }

    /// Upload an object with the given content type.
    pub async fn put_object(&self, key: &str, body: Vec<u8>, content_type: &str) -> Result<()> {
        self.timed("put_object", async {
            self.client
                .put_object()
                .bucket(&self.bucket)
                .key(key)
                .body(ByteStream::from(body))
                .content_type(content_type)
                .send()
                .await
                .with_context(|| format!("put_object {key}"))?;
            Ok(())
        })
        .await
    }

    /// True if the object exists.
    pub async fn exists(&self, key: &str) -> Result<bool> {
        self.timed("head_object", async {
            match self
                .client
                .head_object()
                .bucket(&self.bucket)
                .key(key)
                .send()
                .await
            {
                Ok(_) => Ok(true),
                Err(err) => {
                    if let Some(svc) = err.as_service_error() {
                        if svc.is_not_found() {
                            return Ok(false);
                        }
                    }
                    Err(anyhow::Error::new(err).context(format!("head_object {key}")))
                }
            }
        })
        .await
    }

    /// Delete an object.
    pub async fn delete(&self, key: &str) -> Result<()> {
        self.timed("delete_object", async {
            self.client
                .delete_object()
                .bucket(&self.bucket)
                .key(key)
                .send()
                .await
                .with_context(|| format!("delete_object {key}"))?;
            Ok(())
        })
        .await
    }
}
