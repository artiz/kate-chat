//! AWS SDK client construction (S3 + SQS).
//!
//! Static credentials are used when `*_ACCESS_KEY_ID` / `*_SECRET_ACCESS_KEY`
//! are provided (local dev, LocalStack); otherwise the default provider chain is
//! used (ECS task role in production). An explicit `*_ENDPOINT` overrides the AWS
//! endpoint (LocalStack / MinIO), in which case S3 uses path-style addressing.

use aws_config::{BehaviorVersion, Region};
use aws_sdk_s3::config::Credentials;

use crate::config::Config;

async fn base_config(
    region: &str,
    endpoint: &Option<String>,
    access: &Option<String>,
    secret: &Option<String>,
) -> aws_config::SdkConfig {
    let mut loader =
        aws_config::defaults(BehaviorVersion::latest()).region(Region::new(region.to_string()));

    if let (Some(a), Some(s)) = (access, secret) {
        loader = loader.credentials_provider(Credentials::new(
            a.clone(),
            s.clone(),
            None,
            None,
            "katechat-static",
        ));
    }
    if let Some(ep) = endpoint {
        loader = loader.endpoint_url(ep.clone());
    }
    loader.load().await
}

/// Build the S3 client. Uses path-style addressing when a custom endpoint is set.
pub async fn s3_client(cfg: &Config) -> aws_sdk_s3::Client {
    let base = base_config(
        &cfg.s3_region,
        &cfg.s3_endpoint,
        &cfg.s3_access_key_id,
        &cfg.s3_secret_access_key,
    )
    .await;

    let mut builder = aws_sdk_s3::config::Builder::from(&base);
    if cfg.s3_endpoint.is_some() {
        builder = builder.force_path_style(true);
    }
    aws_sdk_s3::Client::from_conf(builder.build())
}

/// Build the SQS client.
pub async fn sqs_client(cfg: &Config) -> aws_sdk_sqs::Client {
    let base = base_config(
        &cfg.sqs_region,
        &cfg.sqs_endpoint,
        &cfg.sqs_access_key_id,
        &cfg.sqs_secret_access_key,
    )
    .await;
    aws_sdk_sqs::Client::new(&base)
}
