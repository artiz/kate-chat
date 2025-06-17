use async_graphql::{Context, Subscription, Result};
use futures_util::{Stream, StreamExt};
use std::time::Duration;
use tokio_stream::wrappers::BroadcastStream;
use tracing::{info, debug, error};

use crate::models::message::{GqlNewMessage};
use crate::services::pubsub::{get_global_pubsub};
use crate::models::MessageType;


#[derive(Default)]
pub struct SubscriptionRoot;

#[Subscription]
impl SubscriptionRoot {
    async fn new_message(
        &self,
        _ctx: &Context<'_>,
        chat_id: String,
    ) -> Result<impl Stream<Item = GqlNewMessage>> {
        // TODO: Validate authentication
        // let context = ctx.data::<GraphQLContext>()?;
        // if context.user.is_none() {
        //     return Err(async_graphql::Error::new("Authentication required for subscriptions"));
        // }

        debug!("Setting up subscription for chat_id: {}", chat_id);

        // Get the global PubSub service
        let pubsub = get_global_pubsub();
        
        // Subscribe to the specific chat channel
        let subscription = pubsub.subscribe_to_chat(&chat_id).await?;
        
        info!("New subscription established for chat_id: {}", chat_id);
        
        // Send initial system message after a short delay
        let pubsub_clone = pubsub.clone();
        
        tokio::spawn(async move {
            tokio::time::sleep(Duration::from_millis(300)).await;
            let system_message = GqlNewMessage {
                r#type: String::from(MessageType::System),
                error: None,
                message: None,
                streaming: None,
            };
            if let Err(e) = pubsub_clone.publish_to_chat(&chat_id, system_message).await {
                error!("Failed to send initial system message: {:?}", e);
            }
        });


        Ok(BroadcastStream::new(subscription)
            .filter_map(|result| async move {
                match result {
                    Ok(msg) => Some(msg),
                    Err(e) => {
                        error!("Error in subscription stream: {:?}", e);
                        None
                    }
                }
            }))
    }
}
