use aws_sdk_costexplorer::{
    types::{Dimension, Expression, Granularity, GroupDefinition, GroupDefinitionType},
    Client as CostExplorerClient,
};
use chrono::{DateTime, Utc};
use tracing::debug;

use super::BedrockService;
use crate::services::ai::{Amount, ServiceCostInfo};
use crate::utils::errors::AppError;

impl BedrockService {
    pub async fn fetch_cost_data(
        &self,
        start_date: DateTime<Utc>,
        end_date: DateTime<Utc>,
    ) -> Result<Vec<ServiceCostInfo>, AppError> {
        // Create cost explorer client using the shared AWS config
        let aws_config = self.build_aws_config().await?;
        let cost_explorer_client = CostExplorerClient::new(&aws_config);

        // Format dates in YYYY-MM-DD format required by Cost Explorer
        let formatted_start_date = start_date.format("%Y-%m-%d").to_string();
        let formatted_end_date = end_date.format("%Y-%m-%d").to_string();

        debug!(
            "Fetching AWS Bedrock costs from {} to {}",
            formatted_start_date, formatted_end_date
        );

        let mut service_costs: Vec<ServiceCostInfo> = Vec::new();

        // First query: Get overall service costs
        let service_command = cost_explorer_client
            .get_cost_and_usage()
            .time_period(
                aws_sdk_costexplorer::types::DateInterval::builder()
                    .start(&formatted_start_date)
                    .end(&formatted_end_date)
                    .build()
                    .map_err(|e| AppError::Aws(format!("Failed to build date interval: {}", e)))?,
            )
            .granularity(Granularity::Daily)
            .metrics("BlendedCost")
            .metrics("UsageQuantity")
            .group_by(
                GroupDefinition::builder()
                    .r#type(GroupDefinitionType::Dimension)
                    .key("SERVICE")
                    .build(),
            );

        let service_response = service_command
            .send()
            .await
            .map_err(|e| AppError::Aws(format!("Failed to get service costs: {}", e)))?;

        // Process service costs
        let mut total_cost = 0.0;
        for result in service_response.results_by_time() {
            if !result.groups().is_empty() {
                for group in result.groups() {
                    let metrics = group.metrics();
                    let keys = group.keys();
                    if metrics.is_none() {
                        continue;
                    }

                    let blended_cost_val = metrics.unwrap().get("BlendedCost");

                    if blended_cost_val.is_some() {
                        let blended_cost = blended_cost_val.unwrap();
                        if let Some(amount_str) = blended_cost.amount() {
                            if let Ok(cost) = amount_str.parse::<f64>() {
                                total_cost += cost;

                                // Extract service name
                                let service_name = keys
                                    .first()
                                    .unwrap_or(&"Amazon Bedrock".to_string())
                                    .clone();

                                // Find or create service cost entry
                                if let Some(service_cost) = service_costs
                                    .iter_mut()
                                    .find(|sc| sc.name == service_name && sc.r#type == "service")
                                {
                                    // Update existing entry
                                    let currency = blended_cost.unit().unwrap_or("USD");
                                    if let Some(amount) = service_cost
                                        .amounts
                                        .iter_mut()
                                        .find(|a| a.currency == currency)
                                    {
                                        amount.amount += cost;
                                    } else {
                                        service_cost.amounts.push(Amount {
                                            amount: cost,
                                            currency: currency.to_string(),
                                        });
                                    }
                                } else {
                                    // Create new entry
                                    service_costs.push(ServiceCostInfo {
                                        name: service_name,
                                        r#type: "service".to_string(),
                                        amounts: vec![Amount {
                                            amount: cost,
                                            currency: blended_cost
                                                .unit()
                                                .unwrap_or("USD")
                                                .to_string(),
                                        }],
                                    });
                                }
                            }
                        }
                    }
                }
            }
        }

        // Second query: Get model-specific costs
        let model_command = cost_explorer_client
            .get_cost_and_usage()
            .time_period(
                aws_sdk_costexplorer::types::DateInterval::builder()
                    .start(&formatted_start_date)
                    .end(&formatted_end_date)
                    .build()
                    .map_err(|e| AppError::Aws(format!("Failed to build date interval: {}", e)))?,
            )
            .granularity(Granularity::Daily)
            .metrics("BlendedCost")
            .metrics("UsageQuantity")
            .group_by(
                GroupDefinition::builder()
                    .r#type(GroupDefinitionType::Dimension)
                    .key("USAGE_TYPE")
                    .build(),
            )
            .filter(
                Expression::builder()
                    .dimensions(
                        aws_sdk_costexplorer::types::DimensionValues::builder()
                            .key(Dimension::Service)
                            .values("Amazon Bedrock")
                            .build(),
                    )
                    .build(),
            );

        let model_response = model_command
            .send()
            .await
            .map_err(|e| AppError::Aws(format!("Failed to get model costs: {}", e)))?;

        // Process model-specific costs
        for result in model_response.results_by_time() {
            for group in result.groups() {
                let metrics = group.metrics();
                let keys = group.keys();
                if metrics.is_none() {
                    continue;
                }

                let blended_cost_val = metrics.unwrap().get("BlendedCost");

                if blended_cost_val.is_some() {
                    let blended_cost = blended_cost_val.unwrap();
                    if let Some(amount_str) = blended_cost.amount() {
                        if let Ok(cost) = amount_str.parse::<f64>() {
                            let usage_type = keys.first().map_or("Other", |v| v);
                            let currency = blended_cost.unit().unwrap_or("USD");

                            // Map usage types to model families
                            let model_family = if usage_type.contains("Claude") {
                                "Anthropic Claude Models"
                            } else if usage_type.contains("Titan") {
                                "Amazon Titan Models"
                            } else if usage_type.contains("Jurassic") {
                                "AI21 Jurassic Models"
                            } else if usage_type.contains("Command") {
                                "Cohere Command Models"
                            } else if usage_type.contains("Llama") {
                                "Meta Llama Models"
                            } else if usage_type.contains("Mistral") {
                                "Mistral AI Models"
                            } else {
                                "Other Models"
                            };

                            // Find or create model family cost entry
                            if let Some(model_cost) = service_costs
                                .iter_mut()
                                .find(|sc| sc.name == model_family && sc.r#type == "model_family")
                            {
                                // Update existing entry
                                if let Some(amount) = model_cost
                                    .amounts
                                    .iter_mut()
                                    .find(|a| a.currency == currency)
                                {
                                    amount.amount += cost;
                                } else {
                                    model_cost.amounts.push(Amount {
                                        amount: cost,
                                        currency: currency.to_string(),
                                    });
                                }
                            } else {
                                // Create new entry
                                service_costs.push(ServiceCostInfo {
                                    name: model_family.to_string(),
                                    r#type: "model_family".to_string(),
                                    amounts: vec![Amount {
                                        amount: cost,
                                        currency: currency.to_string(),
                                    }],
                                });
                            }
                        }
                    }
                }
            }
        }

        // If no detailed costs were found but we have total costs, add a generic entry
        if service_costs.is_empty() && total_cost > 0.0 {
            service_costs.push(ServiceCostInfo {
                name: "Amazon Bedrock".to_string(),
                r#type: "service".to_string(),
                amounts: vec![Amount {
                    amount: total_cost,
                    currency: "USD".to_string(),
                }],
            });
        }

        // Sort by name
        service_costs.sort_by(|a, b| a.name.cmp(&b.name));

        Ok(service_costs)
    }
}
