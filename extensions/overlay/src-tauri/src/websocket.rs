use crate::config::{parse_overlay_broadcast, ConnectionState, PING_INTERVAL_MS, RECONNECT_DELAY_MS};
use crate::overlay::main_window;
use crate::overlay::handle_overlay_message;
use crate::settings_store::SettingsHandle;
use futures_util::{SinkExt, StreamExt};
use parking_lot::Mutex;
use serde::Serialize;
use std::sync::Arc;
use tauri::{AppHandle, Emitter};
use tokio::sync::mpsc;
use tokio_tungstenite::{
    connect_async,
    tungstenite::{
        client::IntoClientRequest,
        http::HeaderValue,
        protocol::frame::coding::CloseCode,
        protocol::CloseFrame,
        Message,
    },
};

#[derive(Debug)]
pub enum WsCommand {
    Send {
        command: String,
        conversation_id: Option<String>,
    },
    Reconnect,
}

pub struct WsRuntime {
    pub connection: Arc<Mutex<ConnectionState>>,
    pub command_tx: mpsc::UnboundedSender<WsCommand>,
}

impl WsRuntime {
    pub fn spawn(app: AppHandle, settings: SettingsHandle) -> Self {
        let connection = Arc::new(Mutex::new(ConnectionState::default()));
        let (command_tx, command_rx) = mpsc::unbounded_channel();
        let runtime = Self {
            connection: connection.clone(),
            command_tx,
        };

        tauri::async_runtime::spawn(ws_loop(app, settings, connection, command_rx));
        runtime
    }
}

pub fn emit_connection(app: &AppHandle, runtime: &WsRuntime, settings: &SettingsHandle) {
    let (profile, url, _) = settings.get().active_connection();
    {
        let mut state = runtime.connection.lock();
        state.profile = profile;
        if state.url.is_empty() {
            state.url = url;
        }
    }
    emit_to_renderer(app, "overlay:connection", runtime.connection.lock().clone());
}

fn emit_to_renderer<S: Serialize + Clone>(app: &AppHandle, event: &str, payload: S) {
    if let Some(window) = main_window(app) {
        let _ = window.emit(event, payload);
    }
}

async fn ws_loop(
    app: AppHandle,
    settings: SettingsHandle,
    connection: Arc<Mutex<ConnectionState>>,
    mut command_rx: mpsc::UnboundedReceiver<WsCommand>,
) {
    loop {
        let (profile, url, secret) = settings.get().active_connection();
        update_connection(
            &connection,
            false,
            true,
            "",
            &url,
            &profile,
            &app,
        );

        if url.is_empty() {
            update_connection(
                &connection,
                false,
                false,
                "No websocket URL configured.",
                &url,
                &profile,
                &app,
            );
            tokio::time::sleep(std::time::Duration::from_millis(RECONNECT_DELAY_MS)).await;
            continue;
        }

        let mut request = match url.as_str().into_client_request() {
            Ok(request) => request,
            Err(error) => {
                update_connection(
                    &connection,
                    false,
                    false,
                    &error.to_string(),
                    &url,
                    &profile,
                    &app,
                );
                tokio::time::sleep(std::time::Duration::from_millis(RECONNECT_DELAY_MS)).await;
                continue;
            }
        };

        if let Ok(header_value) = HeaderValue::from_str(&secret).or_else(|_| HeaderValue::from_str("")) {
            request.headers_mut().insert("x-socket-auth", header_value);
        }

        let connect_result = connect_async(request).await;
        let Ok((ws_stream, _)) = connect_result else {
            let error = connect_result
                .err()
                .map(|e| e.to_string())
                .unwrap_or_default();
            update_connection(
                &connection,
                false,
                false,
                &error,
                &url,
                &profile,
                &app,
            );
            tokio::time::sleep(std::time::Duration::from_millis(RECONNECT_DELAY_MS)).await;
            continue;
        };

        update_connection(&connection, false, true, "", &url, &profile, &app);

        let (mut write, mut read) = ws_stream.split();
        if write
            .send(Message::Text(r#"{"broadcastPurpose":"ping"}"#.to_string().into()))
            .await
            .is_err()
        {
            update_connection(
                &connection,
                false,
                false,
                &auth_error_message(&secret, None),
                &url,
                &profile,
                &app,
            );
            tokio::time::sleep(std::time::Duration::from_millis(RECONNECT_DELAY_MS)).await;
            continue;
        }

        let mut ping_interval =
            tokio::time::interval(std::time::Duration::from_millis(PING_INTERVAL_MS));
        ping_interval.tick().await;

        loop {
            tokio::select! {
                command = command_rx.recv() => {
                    match command {
                        Some(WsCommand::Send { command, conversation_id }) => {
                            let payload = serde_json::json!({
                                "broadcastPurpose": "command",
                                "broadcastData": {
                                    "command": command,
                                    "conversationId": conversation_id,
                                }
                            });
                            if write.send(Message::Text(payload.to_string().into())).await.is_err() {
                                break;
                            }
                        }
                        Some(WsCommand::Reconnect) | None => {
                            break;
                        }
                    }
                }
                incoming = read.next() => {
                    match incoming {
                        Some(Ok(Message::Text(text))) => {
                            handle_incoming_text(&app, &connection, text.as_ref());
                        }
                        Some(Ok(Message::Ping(payload))) => {
                            let _ = write.send(Message::Pong(payload)).await;
                        }
                        Some(Ok(Message::Close(frame))) => {
                            update_connection(
                                &connection,
                                false,
                                false,
                                &auth_error_message(&secret, frame.as_ref()),
                                &url,
                                &profile,
                                &app,
                            );
                            break;
                        }
                        Some(Err(_)) | None => {
                            break;
                        }
                        _ => {}
                    }
                }
                _ = ping_interval.tick() => {
                    if write
                        .send(Message::Text(r#"{"broadcastPurpose":"ping"}"#.to_string().into()))
                        .await
                        .is_err()
                    {
                        break;
                    }
                }
            }
        }

        update_connection(
            &connection,
            false,
            false,
            &auth_error_message(&secret, None),
            &url,
            &profile,
            &app,
        );
        tokio::time::sleep(std::time::Duration::from_millis(RECONNECT_DELAY_MS)).await;
    }
}

fn auth_error_message(secret: &str, close_frame: Option<&CloseFrame>) -> String {
    let session_required = close_frame
        .map(|frame| frame.code == CloseCode::Library(4401))
        .unwrap_or(true);

    if session_required {
        if secret.trim().is_empty() {
            return "Authentication required: set the Command Palette secret in overlay settings (Dashboard → Preferences → Command Palette).".to_string();
        }
        return "Authentication failed: secret does not match the server's Command Palette secret.".to_string();
    }

    "Connection lost.".to_string()
}

fn update_connection(
    connection: &Arc<Mutex<ConnectionState>>,
    connected: bool,
    connecting: bool,
    last_error: &str,
    url: &str,
    profile: &str,
    app: &AppHandle,
) {
    {
        let mut state = connection.lock();
        state.connected = connected;
        state.connecting = connecting;
        state.lastError = last_error.to_string();
        state.url = url.to_string();
        state.profile = profile.to_string();
    }
    let _ = emit_to_renderer(app, "overlay:connection", connection.lock().clone());
}

fn handle_incoming_text(app: &AppHandle, connection: &Arc<Mutex<ConnectionState>>, text: &str) {
    match serde_json::from_str::<serde_json::Value>(text) {
        Ok(parsed) => {
            if parsed.get("broadcastPurpose").and_then(|v| v.as_str()) == Some("pong") {
                let mut state = connection.lock();
                state.connected = true;
                state.connecting = false;
                state.lastError = String::new();
                emit_to_renderer(app, "overlay:connection", state.clone());
            }

            if let Some((message, _)) = parse_overlay_broadcast(&parsed) {
                handle_overlay_message(app, &message);
            }

            emit_to_renderer(app, "overlay:server-message", parsed);
        }
        Err(_) => {
            let payload = serde_json::json!({
                "broadcastPurpose": "raw",
                "broadcastData": text,
            });
            emit_to_renderer(app, "overlay:server-message", payload);
        }
    }
}
