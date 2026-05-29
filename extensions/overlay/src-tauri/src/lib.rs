mod config;
mod hotkeys;
mod overlay;
mod platform;
mod settings_store;
mod websocket;

use config::{CommandSendPayload, CompleteHotkeyCapturePayload, OkPayload, Settings};
use hotkeys::{apply_autostart, complete_hotkey_capture, hotkey_matches, register_all_hotkeys, start_hotkey_capture};
use overlay::{
    enter_notification_standby, hide_overlay_now, main_window, notify_ready, overlay_interactive,
    set_awaiting_response, OverlayHandle,
};
use settings_store::{save_settings, SettingsHandle};
use tauri::{AppHandle, Manager};
use tauri_plugin_global_shortcut::ShortcutState;
use websocket::{emit_connection, WsCommand, WsRuntime};

fn emit_connection_for_app(app: &AppHandle) {
    let runtime = app.state::<WsRuntime>();
    let settings = app.state::<SettingsHandle>();
    emit_connection(app, &runtime, &settings);
}

#[tauri::command]
fn settings_get(app: AppHandle) -> Settings {
    app.state::<SettingsHandle>().get()
}

#[tauri::command]
fn settings_save(app: AppHandle, next_settings: Settings) -> Result<Settings, String> {
    let safe = Settings::from_saved(next_settings);
    app.state::<SettingsHandle>().update(safe.clone());
    save_settings(&app, &safe)?;
    apply_autostart(&app, safe.openAtLogin)?;
    register_all_hotkeys(&app, &safe)?;
    let _ = app
        .state::<WsRuntime>()
        .command_tx
        .send(WsCommand::Reconnect);
    Ok(safe)
}

#[tauri::command]
fn settings_start_hotkey_capture(app: AppHandle, target: String) -> Result<serde_json::Value, String> {
    start_hotkey_capture(&app, target.clone())?;
    Ok(serde_json::json!({ "ok": true, "target": target }))
}

#[tauri::command]
fn settings_complete_hotkey_capture(
    app: AppHandle,
    payload: CompleteHotkeyCapturePayload,
) -> Result<OkPayload, String> {
    complete_hotkey_capture(
        &app,
        payload.target,
        payload.hotkey,
        payload.cancelled,
    )?;
    Ok(OkPayload {
        ok: true,
        error: None,
        conversationId: None,
    })
}

#[tauri::command]
fn connection_get(app: AppHandle) -> config::ConnectionState {
    emit_connection_for_app(&app);
    app.state::<WsRuntime>().connection.lock().clone()
}

#[tauri::command]
fn command_send(app: AppHandle, payload: CommandSendPayload) -> Result<OkPayload, String> {
    let text = payload.command.trim().to_string();
    if text.is_empty() {
        return Ok(OkPayload {
            ok: false,
            error: Some("Cannot send an empty query.".to_string()),
            conversationId: None,
        });
    }

    let runtime = app.state::<WsRuntime>();
    let connected = runtime.connection.lock().connected;
    if !connected {
        emit_connection_for_app(&app);
        return Ok(OkPayload {
            ok: false,
            error: Some("Websocket is not connected.".to_string()),
            conversationId: None,
        });
    }

    let conversation_id = payload.conversation_id.filter(|id| !id.is_empty());
    set_awaiting_response(&app, conversation_id.is_some());
    runtime
        .command_tx
        .send(WsCommand::Send {
            command: text,
            conversation_id: conversation_id.clone(),
        })
        .map_err(|e| e.to_string())?;

    {
        let mut state = runtime.connection.lock();
        state.connected = true;
        state.connecting = false;
    }
    emit_connection_for_app(&app);

    Ok(OkPayload {
        ok: true,
        error: None,
        conversationId: conversation_id,
    })
}

#[tauri::command]
fn overlay_hide_now(app: AppHandle) -> OkPayload {
    hide_overlay_now(&app, false);
    OkPayload {
        ok: true,
        error: None,
        conversationId: None,
    }
}

#[tauri::command]
fn overlay_show_for_notification(app: AppHandle) -> OkPayload {
    OkPayload {
        ok: enter_notification_standby(&app).unwrap_or(false),
        error: None,
        conversationId: None,
    }
}

#[tauri::command]
fn overlay_hide_notification(app: AppHandle) -> OkPayload {
    {
        let handle = app.state::<OverlayHandle>();
        handle.lock().notification_mode = false;
    }
    let visible = {
        let handle = app.state::<OverlayHandle>();
        let visible = handle.lock().overlay_visible;
        visible
    };
    if !visible {
        hide_overlay_now(&app, true);
    } else if let Some(window) = main_window(&app) {
        let _ = window.set_ignore_cursor_events(false);
    }
    OkPayload {
        ok: true,
        error: None,
        conversationId: None,
    }
}

#[tauri::command]
fn overlay_clear_awaiting(app: AppHandle) -> OkPayload {
    set_awaiting_response(&app, false);
    OkPayload {
        ok: true,
        error: None,
        conversationId: None,
    }
}

#[tauri::command]
fn overlay_set_ignore_mouse(app: AppHandle, ignore: bool) -> Result<OkPayload, String> {
    let window = main_window(&app).ok_or_else(|| "Window not found".to_string())?;
    window
        .set_ignore_cursor_events(ignore)
        .map_err(|e| e.to_string())?;
    Ok(OkPayload {
        ok: true,
        error: None,
        conversationId: None,
    })
}

#[tauri::command]
fn overlay_notify_ready(app: AppHandle) {
    notify_ready(&app);
    emit_connection_for_app(&app);
}

#[tauri::command]
fn overlay_get_visible(app: AppHandle) -> bool {
    overlay_interactive(&app)
}

#[tauri::command]
fn shell_open_external(app: AppHandle, url: String) -> Result<OkPayload, String> {
    if !config::is_external_url(&url) {
        return Ok(OkPayload {
            ok: false,
            error: Some("Invalid URL".to_string()),
            conversationId: None,
        });
    }
    use tauri_plugin_opener::OpenerExt;
    app.opener()
        .open_url(url, None::<&str>)
        .map_err(|e| e.to_string())?;
    Ok(OkPayload {
        ok: true,
        error: None,
        conversationId: None,
    })
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            Some(vec![]),
        ))
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, shortcut, event| {
                    if event.state != ShortcutState::Pressed {
                        return;
                    }
                    if overlay::should_suppress_hotkey(app) {
                        return;
                    }
                    let overlay_state = app.state::<OverlayHandle>();
                    if overlay_state.lock().hotkey_capture_active {
                        return;
                    }
                    let settings = app.state::<SettingsHandle>().get();
                    if hotkey_matches(&settings.hotkey, shortcut) {
                        overlay::toggle_overlay(app);
                    } else if hotkey_matches(&settings.copyLastResponseHotkey, shortcut) {
                        let _ = overlay::copy_last_response(app);
                    } else if hotkey_matches(&settings.typeLastResponseHotkey, shortcut) {
                        let _ = overlay::type_last_response(app);
                    }
                })
                .build(),
        )
        .setup(|app| {
            let settings = SettingsHandle::new(app.handle());
            app.manage(settings.clone());
            app.manage(OverlayHandle::new());

            let ws_runtime = WsRuntime::spawn(app.handle().clone(), settings.clone());
            app.manage(ws_runtime);

            if let Some(window) = main_window(app.handle()) {
                overlay::apply_overlay_bounds(&window).ok();
                let _ = window.set_always_on_top(true);
                let _ = window.hide();

                let bounds_window = window.clone();
                window.on_window_event(move |event| {
                    if matches!(
                        event,
                        tauri::WindowEvent::ScaleFactorChanged { .. }
                            | tauri::WindowEvent::ThemeChanged(_)
                    ) {
                        let _ = overlay::apply_overlay_bounds(&bounds_window);
                    }
                });
            }

            let initial = settings.get();
            apply_autostart(app.handle(), initial.openAtLogin).ok();
            if let Err(error) = register_all_hotkeys(app.handle(), &initial) {
                eprintln!("Failed to register global hotkeys: {error}");
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            settings_get,
            settings_save,
            settings_start_hotkey_capture,
            settings_complete_hotkey_capture,
            connection_get,
            command_send,
            overlay_hide_now,
            overlay_show_for_notification,
            overlay_hide_notification,
            overlay_clear_awaiting,
            overlay_set_ignore_mouse,
            overlay_notify_ready,
            overlay_get_visible,
            shell_open_external,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
