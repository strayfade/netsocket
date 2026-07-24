use crate::config::{
    alert_targets_device, parse_overlay_broadcast, ConnectionState, PING_INTERVAL_MS,
    RECONNECT_DELAY_MS,
};
use crate::device_crypto::{
    build_challenge_message, decrypt_payload, encrypt_payload, verify_ed25519, DeviceIdentity,
    EphemeralEcdh,
};
use crate::overlay::main_window;
use crate::overlay::handle_overlay_message;
use crate::settings_store::{save_settings, SettingsHandle};
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
        device_id: Option<String>,
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

fn ping_payload(device_id: &str) -> serde_json::Value {
    if device_id.trim().is_empty() {
        serde_json::json!({ "broadcastPurpose": "ping" })
    } else {
        serde_json::json!({
            "broadcastPurpose": "ping",
            "broadcastData": {
                "deviceId": device_id,
            }
        })
    }
}

async fn send_app_message(
    write: &mut futures_util::stream::SplitSink<
        tokio_tungstenite::WebSocketStream<
            tokio_tungstenite::MaybeTlsStream<tokio::net::TcpStream>,
        >,
        Message,
    >,
    session_key: &Option<[u8; 32]>,
    approved: bool,
    message: serde_json::Value,
) -> Result<(), ()> {
    let outbound = if approved {
        if let Some(key) = session_key {
            match encrypt_payload(key, &message) {
                Ok((nonce, ciphertext)) => serde_json::json!({
                    "broadcastPurpose": "encrypted",
                    "broadcastData": {
                        "nonce": nonce,
                        "ciphertext": ciphertext,
                    }
                }),
                Err(_) => return Err(()),
            }
        } else {
            message
        }
    } else {
        message
    };
    write
        .send(Message::Text(outbound.to_string().into()))
        .await
        .map_err(|_| ())
}

async fn ws_loop(
    app: AppHandle,
    settings: SettingsHandle,
    connection: Arc<Mutex<ConnectionState>>,
    mut command_rx: mpsc::UnboundedReceiver<WsCommand>,
) {
    loop {
        let snapshot = settings.get();
        let (profile, url, secret) = snapshot.active_connection();
        let device_id = snapshot.deviceId.clone();
        let identity = DeviceIdentity::from_stored(
            &snapshot.identityPublicKey,
            &snapshot.identityPrivateKey,
        );
        update_connection(
            &connection,
            false,
            true,
            "",
            &url,
            &profile,
            "connecting",
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
                "",
                &app,
            );
            tokio::time::sleep(std::time::Duration::from_millis(RECONNECT_DELAY_MS)).await;
            continue;
        }

        let Some(identity) = identity else {
            update_connection(
                &connection,
                false,
                false,
                "Device identity keys missing. Reopen settings to regenerate.",
                &url,
                &profile,
                "",
                &app,
            );
            tokio::time::sleep(std::time::Duration::from_millis(RECONNECT_DELAY_MS)).await;
            continue;
        };

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
                    "",
                    &app,
                );
                tokio::time::sleep(std::time::Duration::from_millis(RECONNECT_DELAY_MS)).await;
                continue;
            }
        };

        // Legacy shared-secret fallback (optional). Preferred path is device pairing.
        if !secret.trim().is_empty() {
            if let Ok(header_value) = HeaderValue::from_str(&secret) {
                request.headers_mut().insert("x-socket-auth", header_value);
            }
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
                "",
                &app,
            );
            tokio::time::sleep(std::time::Duration::from_millis(RECONNECT_DELAY_MS)).await;
            continue;
        };

        update_connection(
            &connection,
            false,
            true,
            "",
            &url,
            &profile,
            "handshaking",
            &app,
        );

        let (mut write, mut read) = ws_stream.split();
        let ecdh = EphemeralEcdh::generate();
        let hello = serde_json::json!({
            "broadcastPurpose": "deviceHello",
            "broadcastData": {
                "deviceId": device_id,
                "identityPublicKey": identity.public_key_b64,
                "ecdhPublicKey": ecdh.public_key_b64,
                "platform": "overlay",
                "name": format!("Desktop overlay ({profile})"),
            }
        });
        if write
            .send(Message::Text(hello.to_string().into()))
            .await
            .is_err()
        {
            update_connection(
                &connection,
                false,
                false,
                "Failed to start device handshake.",
                &url,
                &profile,
                "",
                &app,
            );
            tokio::time::sleep(std::time::Duration::from_millis(RECONNECT_DELAY_MS)).await;
            continue;
        }

        let mut session_key: Option<[u8; 32]> = None;
        let mut approved = false;
        let mut handshake_complete = false;
        let mut pending_ecdh = Some(ecdh);

        let mut ping_interval =
            tokio::time::interval(std::time::Duration::from_millis(PING_INTERVAL_MS));
        ping_interval.tick().await;

        loop {
            tokio::select! {
                command = command_rx.recv() => {
                    match command {
                        Some(WsCommand::Send { command, conversation_id, device_id }) => {
                            if !approved {
                                update_connection(
                                    &connection,
                                    false,
                                    false,
                                    "Waiting for approval in the netsocket dashboard (Settings → Devices).",
                                    &url,
                                    &profile,
                                    "pending",
                                    &app,
                                );
                                continue;
                            }
                            let payload = serde_json::json!({
                                "broadcastPurpose": "command",
                                "broadcastData": {
                                    "command": command,
                                    "conversationId": conversation_id,
                                    "deviceId": device_id,
                                }
                            });
                            if send_app_message(&mut write, &session_key, approved, payload).await.is_err() {
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
                            let parsed = match serde_json::from_str::<serde_json::Value>(text.as_ref()) {
                                Ok(v) => v,
                                Err(_) => continue,
                            };
                            let purpose = parsed
                                .get("broadcastPurpose")
                                .and_then(|v| v.as_str())
                                .unwrap_or("")
                                .to_string();

                            if purpose.as_str() == "deviceChallenge" {
                                let data = parsed.get("broadcastData").cloned().unwrap_or(serde_json::json!({}));
                                let challenge = data.get("challenge").and_then(|v| v.as_str()).unwrap_or("");
                                let server_identity = data.get("serverIdentityPublicKey").and_then(|v| v.as_str()).unwrap_or("");
                                let server_ecdh = data.get("serverEcdhPublicKey").and_then(|v| v.as_str()).unwrap_or("");
                                let server_signature = data.get("serverSignature").and_then(|v| v.as_str()).unwrap_or("");
                                let status = data.get("status").and_then(|v| v.as_str()).unwrap_or("pending");

                                let Some(ecdh) = pending_ecdh.take() else {
                                    break;
                                };
                                let challenge_message = build_challenge_message(
                                    challenge,
                                    &device_id,
                                    &identity.public_key_b64,
                                    &ecdh.public_key_b64,
                                    server_identity,
                                    server_ecdh,
                                );
                                if !verify_ed25519(server_identity, &challenge_message, server_signature) {
                                    update_connection(
                                        &connection,
                                        false,
                                        false,
                                        "Server identity signature invalid.",
                                        &url,
                                        &profile,
                                        "",
                                        &app,
                                    );
                                    break;
                                }

                                let mut current = settings.get();
                                if current.pinnedServerIdentityPublicKey.trim().is_empty() {
                                    current.pinnedServerIdentityPublicKey = server_identity.to_string();
                                    settings.update(current.clone());
                                    let _ = save_settings(&app, &current);
                                } else if current.pinnedServerIdentityPublicKey != server_identity {
                                    update_connection(
                                        &connection,
                                        false,
                                        false,
                                        "Server identity changed. Clear pinned key in settings if this host is trusted.",
                                        &url,
                                        &profile,
                                        "",
                                        &app,
                                    );
                                    break;
                                }

                                let Ok(key) = ecdh.derive_session_key(server_ecdh, challenge) else {
                                    update_connection(
                                        &connection,
                                        false,
                                        false,
                                        "Failed to derive session key.",
                                        &url,
                                        &profile,
                                        "",
                                        &app,
                                    );
                                    break;
                                };
                                session_key = Some(key);

                                let Ok(signature) = identity.sign(&challenge_message) else {
                                    break;
                                };
                                let auth = serde_json::json!({
                                    "broadcastPurpose": "deviceAuth",
                                    "broadcastData": { "signature": signature }
                                });
                                if write.send(Message::Text(auth.to_string().into())).await.is_err() {
                                    break;
                                }

                                handshake_complete = true;
                                if status == "approved" {
                                    approved = true;
                                    update_connection(
                                        &connection,
                                        true,
                                        false,
                                        "",
                                        &url,
                                        &profile,
                                        "approved",
                                        &app,
                                    );
                                } else {
                                    update_connection(
                                        &connection,
                                        false,
                                        false,
                                        "Waiting for approval in the netsocket dashboard (Settings → Devices).",
                                        &url,
                                        &profile,
                                        "pending",
                                        &app,
                                    );
                                }
                                continue;
                            }

                            if purpose == "deviceStatus" {
                                let status = parsed
                                    .pointer("/broadcastData/status")
                                    .and_then(|v| v.as_str())
                                    .unwrap_or("");
                                if status == "approved" {
                                    approved = true;
                                    update_connection(
                                        &connection,
                                        true,
                                        false,
                                        "",
                                        &url,
                                        &profile,
                                        "approved",
                                        &app,
                                    );
                                } else if status == "pending" {
                                    approved = false;
                                    update_connection(
                                        &connection,
                                        false,
                                        false,
                                        "Waiting for approval in the netsocket dashboard (Settings → Devices).",
                                        &url,
                                        &profile,
                                        "pending",
                                        &app,
                                    );
                                } else if status == "denied" {
                                    update_connection(
                                        &connection,
                                        false,
                                        false,
                                        "This device was denied access.",
                                        &url,
                                        &profile,
                                        "denied",
                                        &app,
                                    );
                                    break;
                                }
                                continue;
                            }

                            if purpose == "deviceError" {
                                let msg = parsed
                                    .pointer("/broadcastData/message")
                                    .and_then(|v| v.as_str())
                                    .or_else(|| parsed.pointer("/broadcastData/error").and_then(|v| v.as_str()))
                                    .unwrap_or("Device authentication error");
                                update_connection(
                                    &connection,
                                    false,
                                    false,
                                    msg,
                                    &url,
                                    &profile,
                                    "",
                                    &app,
                                );
                                break;
                            }

                            let mut message = parsed;
                            if purpose == "encrypted" {
                                let Some(key) = session_key.as_ref() else { continue };
                                let nonce = message.pointer("/broadcastData/nonce").and_then(|v| v.as_str()).unwrap_or("");
                                let ciphertext = message.pointer("/broadcastData/ciphertext").and_then(|v| v.as_str()).unwrap_or("");
                                match decrypt_payload(key, nonce, ciphertext) {
                                    Ok(inner) => message = inner,
                                    Err(_) => continue,
                                }
                            }

                            handle_incoming_message(&app, &connection, &settings, &message);
                        }
                        Some(Ok(Message::Ping(payload))) => {
                            let _ = write.send(Message::Pong(payload)).await;
                        }
                        Some(Ok(Message::Close(frame))) => {
                            update_connection(
                                &connection,
                                false,
                                false,
                                &close_error_message(frame.as_ref()),
                                &url,
                                &profile,
                                "",
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
                    if !handshake_complete {
                        continue;
                    }
                    let current_device_id = settings.get().deviceId;
                    if send_app_message(
                        &mut write,
                        &session_key,
                        approved,
                        ping_payload(&current_device_id),
                    )
                    .await
                    .is_err()
                    {
                        break;
                    }
                }
            }
        }

        let mut last_error = connection.lock().lastError.clone();
        let auth_status = connection.lock().authStatus.clone();
        if last_error.is_empty() {
            last_error = "Connection lost.".to_string();
        }
        update_connection(
            &connection,
            false,
            false,
            &last_error,
            &url,
            &profile,
            &auth_status,
            &app,
        );
        tokio::time::sleep(std::time::Duration::from_millis(RECONNECT_DELAY_MS)).await;
    }
}

fn close_error_message(close_frame: Option<&CloseFrame>) -> String {
    match close_frame.map(|frame| frame.code) {
        Some(CloseCode::Library(4403)) => "This device was denied access.".to_string(),
        Some(CloseCode::Library(4401)) => "Device authentication failed.".to_string(),
        _ => "Connection lost.".to_string(),
    }
}

fn update_connection(
    connection: &Arc<Mutex<ConnectionState>>,
    connected: bool,
    connecting: bool,
    last_error: &str,
    url: &str,
    profile: &str,
    auth_status: &str,
    app: &AppHandle,
) {
    {
        let mut state = connection.lock();
        state.connected = connected;
        state.connecting = connecting;
        state.lastError = last_error.to_string();
        state.url = url.to_string();
        state.profile = profile.to_string();
        if !auth_status.is_empty() {
            state.authStatus = auth_status.to_string();
        }
    }
    let _ = emit_to_renderer(app, "overlay:connection", connection.lock().clone());
}

fn handle_incoming_message(
    app: &AppHandle,
    connection: &Arc<Mutex<ConnectionState>>,
    settings: &SettingsHandle,
    parsed: &serde_json::Value,
) {
    if parsed.get("broadcastPurpose").and_then(|v| v.as_str()) == Some("pong") {
        let mut state = connection.lock();
        if state.authStatus == "approved" || state.authStatus.is_empty() {
            state.connected = true;
            state.connecting = false;
            state.lastError = String::new();
            state.authStatus = "approved".to_string();
        }
        emit_to_renderer(app, "overlay:connection", state.clone());
    }

    if let Some(broadcast) = parse_overlay_broadcast(parsed) {
        let local_device_id = settings.get().deviceId;
        let allow = broadcast.conversation_id.is_some()
            || alert_targets_device(&local_device_id, broadcast.device_id.as_deref());
        if allow {
            handle_overlay_message(app, &broadcast.text);
            emit_to_renderer(app, "overlay:server-message", parsed.clone());
        }
    } else {
        emit_to_renderer(app, "overlay:server-message", parsed.clone());
    }
}
