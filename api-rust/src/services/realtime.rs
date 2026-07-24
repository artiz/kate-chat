//! Realtime voice sessions (Node's realtime.service): mint an OpenAI
//! ephemeral WebRTC session, or fall back to a server-side WebSocket
//! proxy (`/realtime/proxy` on the subscriptions server) used for
//! Yandex Speech Realtime and as the OpenAI fallback.

use futures_util::{SinkExt, StreamExt};
use serde::{Deserialize, Serialize};
use tracing::{info, warn};

use crate::config::AppConfig;
use crate::models::{Chat, Model};
use crate::utils::errors::AppError;

pub const OPENAI_API_URL: &str = "https://api.openai.com/v1";
pub const OPENAI_REALTIME_VOICES: &[&str] = &[
    "marin", "cedar", "alloy", "ash", "ballad", "coral", "echo", "sage", "shimmer", "verse",
];
pub const OPENAI_REALTIME_DEFAULT_VOICE: &str = "shimmer";
pub const YANDEX_REALTIME_VOICES: &[&str] = &[
    "alena", "marina", "jane", "omazh", "filipp", "ermil", "zahar", "madirus",
];
pub const YANDEX_REALTIME_DEFAULT_VOICE: &str = "marina";
pub const YANDEX_REALTIME_API_URL: &str = "wss://ai.api.cloud.yandex.net/v1/realtime";
pub const REALTIME_PROXY_PATH: &str = "/realtime/proxy";
pub const OPENAI_REALTIME_TRANSCRIPTION_MODEL: &str = "whisper-1";

#[derive(Debug, Clone, Serialize, Deserialize, async_graphql::SimpleObject)]
#[graphql(name = "RealtimeSessionResponse")]
#[serde(rename_all = "camelCase")]
pub struct RealtimeSessionResponse {
    pub transport: String,
    pub model: String,
    pub client_secret: Option<String>,
    pub sdp_url: Option<String>,
    pub ws_url: Option<String>,
}

/// Pick the assistant voice: the requested one when the provider
/// supports it, else the provider default (Node parity; api-rust has
/// no per-chat voice column yet, so `requested` is currently None).
pub fn pick_voice(model: &Model, requested: Option<&str>) -> String {
    let (voices, default) = if model.api_provider == "YANDEX_AI" {
        (YANDEX_REALTIME_VOICES, YANDEX_REALTIME_DEFAULT_VOICE)
    } else {
        (OPENAI_REALTIME_VOICES, OPENAI_REALTIME_DEFAULT_VOICE)
    };
    requested
        .filter(|v| voices.contains(v))
        .unwrap_or(default)
        .to_string()
}

/// Mint an OpenAI ephemeral client secret for a WebRTC realtime session.
pub async fn create_openai_ephemeral_session(
    config: &AppConfig,
    model: &Model,
    voice: &str,
) -> Result<RealtimeSessionResponse, AppError> {
    let api_key = config
        .openai_api_key
        .as_deref()
        .ok_or_else(|| AppError::Validation("OpenAI API key not configured".to_string()))?;
    let base = OPENAI_API_URL;

    let body = serde_json::json!({
        "session": {
            "type": "realtime",
            "model": model.model_id,
            "audio": {
                "input": { "transcription": { "model": OPENAI_REALTIME_TRANSCRIPTION_MODEL } },
                "output": { "voice": voice },
            },
        }
    });
    let response = reqwest::Client::new()
        .post(format!("{}/realtime/client_secrets", base))
        .bearer_auth(api_key)
        .json(&body)
        .send()
        .await
        .map_err(|e| AppError::Internal(format!("Realtime session request failed: {}", e)))?;
    if !response.status().is_success() {
        let status = response.status();
        let text = response.text().await.unwrap_or_default();
        return Err(AppError::Internal(format!(
            "Realtime session request failed ({}): {}",
            status,
            text.chars().take(300).collect::<String>()
        )));
    }
    let session: serde_json::Value = response
        .json()
        .await
        .map_err(|e| AppError::Internal(format!("Realtime session response: {}", e)))?;
    let client_secret = session
        .get("value")
        .and_then(|v| v.as_str())
        .or_else(|| {
            session
                .get("client_secret")
                .and_then(|c| c.get("value"))
                .and_then(|v| v.as_str())
        })
        .ok_or_else(|| AppError::Internal("Realtime session response without value".to_string()))?
        .to_string();

    Ok(RealtimeSessionResponse {
        transport: "webrtc".to_string(),
        model: model.model_id.clone(),
        client_secret: Some(client_secret),
        sdp_url: Some(format!("{}/realtime/calls?model={}", base, model.model_id)),
        ws_url: None,
    })
}

/// Upstream WS target for the proxy path.
pub struct UpstreamTarget {
    pub url: String,
    pub headers: Vec<(String, String)>,
    /// whisper transcription only applies to OpenAI upstreams
    pub with_transcription: bool,
}

pub fn upstream_target(config: &AppConfig, model: &Model) -> Result<UpstreamTarget, AppError> {
    if model.api_provider == "YANDEX_AI" {
        let key = config
            .yandex_api_key
            .as_deref()
            .ok_or_else(|| AppError::Validation("Yandex API key not configured".to_string()))?;
        let folder = config.yandex_folder_id.clone().unwrap_or_default();
        let model_uri = model.model_id.replace("{folder}", &folder);
        let auth = if key.starts_with("t1.") {
            format!("Bearer {}", key)
        } else {
            format!("Api-Key {}", key)
        };
        Ok(UpstreamTarget {
            url: format!("{}?model={}", YANDEX_REALTIME_API_URL, model_uri),
            headers: vec![
                ("Authorization".to_string(), auth),
                ("OpenAI-Project".to_string(), folder.clone()),
                ("x-folder-id".to_string(), folder),
            ],
            with_transcription: false,
        })
    } else {
        let key = config
            .openai_api_key
            .as_deref()
            .ok_or_else(|| AppError::Validation("OpenAI API key not configured".to_string()))?;
        let ws_base = OPENAI_API_URL.replacen("http", "ws", 1);
        Ok(UpstreamTarget {
            url: format!("{}/realtime?model={}", ws_base, model.model_id),
            headers: vec![("Authorization".to_string(), format!("Bearer {}", key))],
            with_transcription: true,
        })
    }
}

fn session_update(chat: &Chat, voice: &str, with_transcription: bool) -> serde_json::Value {
    let mut input = serde_json::json!({
        "format": { "type": "audio/pcm", "rate": 24000 },
        "turn_detection": { "type": "server_vad", "silence_duration_ms": 800, "threshold": 0.5 },
    });
    if with_transcription {
        input["transcription"] =
            serde_json::json!({ "model": OPENAI_REALTIME_TRANSCRIPTION_MODEL });
    }
    let mut session = serde_json::json!({
        "type": "realtime",
        "output_modalities": ["audio"],
        "audio": {
            "input": input,
            "output": {
                "voice": voice,
                "format": { "type": "audio/pcm", "rate": 24000 },
                "speed": 1,
            },
        },
    });
    if let Some(prompt) = chat.system_prompt.as_deref().filter(|p| !p.is_empty()) {
        session["instructions"] = serde_json::json!(prompt);
    }
    serde_json::json!({ "type": "session.update", "session": session })
}

/// Relay a client WebSocket to the provider's realtime endpoint. Client
/// messages are buffered until the upstream reports `session.created`
/// (3s cap), then a `session.update` with our audio config is injected
/// before the buffer flushes. Frames are always forwarded as text —
/// providers drop binary frames (Node parity).
pub async fn run_proxy(
    client_ws: warp::ws::WebSocket,
    config: AppConfig,
    chat: Chat,
    model: Model,
) {
    use tokio_tungstenite::tungstenite::client::IntoClientRequest;
    use tokio_tungstenite::tungstenite::Message as TMessage;
    use warp::ws::Message as WMessage;

    let target = match upstream_target(&config, &model) {
        Ok(target) => target,
        Err(e) => {
            warn!("Realtime proxy: no upstream target: {}", e);
            return;
        }
    };
    let voice = pick_voice(&model, None);

    let mut request = match target.url.clone().into_client_request() {
        Ok(request) => request,
        Err(e) => {
            warn!("Realtime proxy: bad upstream URL: {}", e);
            return;
        }
    };
    for (name, value) in &target.headers {
        if let (Ok(name), Ok(value)) = (
            name.parse::<tokio_tungstenite::tungstenite::http::header::HeaderName>(),
            value.parse(),
        ) {
            request.headers_mut().insert(name, value);
        }
    }

    let (upstream, _) = match tokio_tungstenite::connect_async(request).await {
        Ok(pair) => pair,
        Err(e) => {
            warn!("Realtime proxy: upstream connect failed: {}", e);
            return;
        }
    };
    info!("Realtime proxy connected to {}", target.url);

    let (mut up_tx, mut up_rx) = upstream.split();
    let (mut client_tx, mut client_rx) = client_ws.split();

    let mut buffered: Vec<String> = Vec::new();
    let mut session_ready = false;
    let update = session_update(&chat, &voice, target.with_transcription);
    let deadline = tokio::time::Instant::now() + std::time::Duration::from_secs(3);

    // Phase 1: wait for session.created (or timeout), buffering client input
    while !session_ready {
        tokio::select! {
            up_message = up_rx.next() => {
                match up_message {
                    Some(Ok(TMessage::Text(text))) => {
                        let created = serde_json::from_str::<serde_json::Value>(&text)
                            .ok()
                            .and_then(|v| v.get("type").and_then(|t| t.as_str()).map(String::from))
                            .is_some_and(|t| t == "session.created");
                        let _ = client_tx.send(WMessage::text(text)).await;
                        if created {
                            session_ready = true;
                        }
                    }
                    Some(Ok(_)) => {}
                    _ => return,
                }
            }
            client_message = client_rx.next() => {
                match client_message {
                    Some(Ok(message)) if message.is_text() => {
                        buffered.push(message.to_str().unwrap_or_default().to_string());
                    }
                    Some(Ok(_)) => {}
                    _ => return,
                }
            }
            _ = tokio::time::sleep_until(deadline) => { session_ready = true; }
        }
    }

    let _ = up_tx.send(TMessage::Text(update.to_string())).await;
    for message in buffered.drain(..) {
        let _ = up_tx.send(TMessage::Text(message)).await;
    }

    // Phase 2: bidirectional relay (text frames only)
    let client_to_up = async {
        while let Some(Ok(message)) = client_rx.next().await {
            if message.is_text() {
                if up_tx
                    .send(TMessage::Text(
                        message.to_str().unwrap_or_default().to_string(),
                    ))
                    .await
                    .is_err()
                {
                    break;
                }
            } else if message.is_close() {
                let _ = up_tx.send(TMessage::Close(None)).await;
                break;
            }
        }
    };
    let up_to_client = async {
        while let Some(Ok(message)) = up_rx.next().await {
            match message {
                TMessage::Text(text) => {
                    if client_tx.send(WMessage::text(text)).await.is_err() {
                        break;
                    }
                }
                TMessage::Binary(bytes) => {
                    // forward as text — clients expect JSON events
                    if let Ok(text) = String::from_utf8(bytes) {
                        if client_tx.send(WMessage::text(text)).await.is_err() {
                            break;
                        }
                    }
                }
                TMessage::Close(_) => {
                    let _ = client_tx.send(WMessage::close()).await;
                    break;
                }
                _ => {}
            }
        }
    };

    tokio::select! {
        _ = client_to_up => {},
        _ = up_to_client => {},
    }
    info!("Realtime proxy session closed for chat {}", chat.id);
}
