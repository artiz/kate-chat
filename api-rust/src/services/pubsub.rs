use async_graphql::Result;
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::{broadcast, RwLock};
use tracing::{debug, info, warn};

use crate::models::{GqlDocumentStatusMessage, GqlNewMessage};

type ChatSubscriptions = Arc<RwLock<HashMap<String, broadcast::Sender<GqlNewMessage>>>>;

#[derive(Clone)]
pub struct PubSubService {
    subscriptions: ChatSubscriptions,
    /// Single global channel for document status updates; the subscription
    /// resolver filters by document ids (Node parity: one Redis channel).
    document_status: broadcast::Sender<GqlDocumentStatusMessage>,
}

impl PubSubService {
    pub fn new() -> Self {
        let (document_status, _) = broadcast::channel(1000);
        Self {
            subscriptions: Arc::new(RwLock::new(HashMap::new())),
            document_status,
        }
    }

    pub fn subscribe_to_document_status(&self) -> broadcast::Receiver<GqlDocumentStatusMessage> {
        self.document_status.subscribe()
    }

    pub fn publish_document_status(&self, message: GqlDocumentStatusMessage) {
        // Send fails only when nobody listens — not an error
        let _ = self.document_status.send(message);
    }

    pub async fn subscribe_to_chat(
        &self,
        chat_id: &str,
    ) -> Result<broadcast::Receiver<GqlNewMessage>> {
        let mut subscriptions = self.subscriptions.write().await;

        // Get or create the broadcast channel for this chat
        let sender = subscriptions.entry(chat_id.to_string()).or_insert_with(|| {
            debug!("Creating new broadcast channel for chat_id: {}", chat_id);
            let (tx, _) = broadcast::channel(1000); // Buffer up to 1000 messages
            tx
        });

        let receiver = sender.subscribe();
        info!("New subscriber added to chat_id: {}", chat_id);

        Ok(receiver)
    }

    pub async fn publish_to_chat(&self, chat_id: &str, message: GqlNewMessage) -> Result<()> {
        let subscriptions = self.subscriptions.read().await;

        if let Some(sender) = subscriptions.get(chat_id) {
            match sender.send(message) {
                Ok(_subscriber_count) => {}
                Err(e) => {
                    warn!("Failed to publish message to chat_id {}: {}", chat_id, e);
                }
            }
        } else {
            debug!("No subscribers found for chat_id: {}", chat_id);
        }
        Ok(())
    }

    // pub async fn get_subscriber_count(&self, chat_id: &str) -> usize {
    //     let subscriptions = self.subscriptions.read().await;
    //     subscriptions
    //         .get(chat_id)
    //         .map(|sender| sender.receiver_count())
    //         .unwrap_or(0)
    // }

    // pub async fn cleanup_empty_channels(&self) {
    //     let mut subscriptions = self.subscriptions.write().await;
    //     let empty_channels: Vec<String> = subscriptions
    //         .iter()
    //         .filter_map(|(chat_id, sender)| {
    //             if sender.receiver_count() == 0 {
    //                 Some(chat_id.clone())
    //             } else {
    //                 None
    //             }
    //         })
    //         .collect();

    //     for chat_id in empty_channels {
    //         subscriptions.remove(&chat_id);
    //         debug!("Cleaned up empty channel for chat_id: {}", chat_id);
    //     }
    // }
}

impl Default for PubSubService {
    fn default() -> Self {
        Self::new()
    }
}

// Singleton instance for global access
lazy_static::lazy_static! {
    static ref GLOBAL_PUBSUB: PubSubService = PubSubService::new();
}

pub fn get_global_pubsub() -> &'static PubSubService {
    &GLOBAL_PUBSUB
}
