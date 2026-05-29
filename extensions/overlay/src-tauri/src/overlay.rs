use parking_lot::Mutex;
use std::sync::Arc;
use tauri::{AppHandle, Emitter, Manager, PhysicalPosition, PhysicalSize, WebviewWindow};

use crate::config::HIDE_ANIMATION_MS;
use crate::platform::{capture_previous_focus, restore_previous_focus};

pub struct OverlayState {
    pub overlay_visible: bool,
    pub notification_mode: bool,
    pub awaiting_response: bool,
    pub renderer_ready: bool,
    pub pending_show: bool,
    pub last_server_notification_text: String,
    pub hotkey_capture_active: bool,
    pub hotkey_capture_target: String,
    pub hotkey_suppress_until: i64,
}

impl Default for OverlayState {
    fn default() -> Self {
        Self {
            overlay_visible: false,
            notification_mode: false,
            awaiting_response: false,
            renderer_ready: false,
            pending_show: false,
            last_server_notification_text: String::new(),
            hotkey_capture_active: false,
            hotkey_capture_target: "hotkey".to_string(),
            hotkey_suppress_until: 0,
        }
    }
}

pub struct OverlayHandle {
    inner: Arc<Mutex<OverlayState>>,
}

impl OverlayHandle {
    pub fn new() -> Self {
        Self {
            inner: Arc::new(Mutex::new(OverlayState::default())),
        }
    }

    pub fn lock(&self) -> parking_lot::MutexGuard<'_, OverlayState> {
        self.inner.lock()
    }
}

pub fn main_window(app: &AppHandle) -> Option<WebviewWindow> {
    app.get_webview_window("main")
}

pub fn apply_overlay_bounds(window: &WebviewWindow) -> Result<(), String> {
    let monitor = window
        .cursor_position()
        .ok()
        .and_then(|cursor| {
            window
                .monitor_from_point(cursor.x, cursor.y)
                .ok()
                .flatten()
        })
        .or_else(|| window.current_monitor().ok().flatten())
        .or_else(|| window.primary_monitor().ok().flatten())
        .ok_or_else(|| "No monitor found".to_string())?;
    let size = monitor.size();
    let position = monitor.position();
    window
        .set_size(PhysicalSize::new(size.width, size.height))
        .map_err(|e| e.to_string())?;
    window
        .set_position(PhysicalPosition::new(position.x, position.y))
        .map_err(|e| e.to_string())?;
    Ok(())
}

pub fn enter_notification_standby(app: &AppHandle) -> Result<bool, String> {
    let Some(window) = main_window(app) else {
        return Ok(false);
    };
    {
        let handle = app.state::<OverlayHandle>();
        handle.lock().notification_mode = true;
    }
    apply_overlay_bounds(&window)?;
    let _ = window.set_always_on_top(true);
    window.show().map_err(|e| e.to_string())?;
    window
        .set_ignore_cursor_events(true)
        .map_err(|e| e.to_string())?;
    Ok(true)
}

pub fn send_show_to_renderer(app: &AppHandle) {
    if let Some(window) = main_window(app) {
        let _ = window.emit("overlay:show", ());
    }
}

pub fn send_hide_intent_to_renderer(app: &AppHandle) {
    if let Some(window) = main_window(app) {
        let _ = window.emit("overlay:hide-intent", ());
    }
}

pub fn overlay_interactive(app: &AppHandle) -> bool {
    let handle = app.state::<OverlayHandle>();
    let state = handle.lock();
    state.overlay_visible && !state.notification_mode
}

pub fn show_overlay(app: &AppHandle) {
    let Some(window) = main_window(app) else {
        return;
    };

    capture_previous_focus();

    {
        let handle = app.state::<OverlayHandle>();
        let mut state = handle.lock();
        state.overlay_visible = true;
        state.notification_mode = false;
        if !state.renderer_ready {
            state.pending_show = true;
        }
    }

    let _ = apply_overlay_bounds(&window);
    let _ = window.set_always_on_top(true);
    let _ = window.show();
    let _ = window.set_focus();
    let _ = window.set_ignore_cursor_events(false);

    send_show_to_renderer(app);
}

pub fn hide_overlay_now(app: &AppHandle, force: bool) {
    let Some(window) = main_window(app) else {
        return;
    };

    let awaiting = {
        let handle = app.state::<OverlayHandle>();
        let mut state = handle.lock();
        state.overlay_visible = false;
        state.pending_show = false;
        if state.awaiting_response && !force {
            true
        } else {
            state.notification_mode = false;
            false
        }
    };

    if awaiting {
        let _ = enter_notification_standby(app);
        restore_previous_focus();
        return;
    }

    let _ = window.hide();
    restore_previous_focus();
}

pub fn hide_overlay(app: &AppHandle) {
    {
        let handle = app.state::<OverlayHandle>();
        let mut state = handle.lock();
        state.overlay_visible = false;
        state.pending_show = false;
    }
    let _ = send_hide_intent_to_renderer(app);
    let app_handle = app.clone();
    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(std::time::Duration::from_millis(
            HIDE_ANIMATION_MS + 40,
        ))
        .await;
        hide_overlay_now(&app_handle, false);
    });
}

pub fn toggle_overlay(app: &AppHandle) {
    let visible = {
        let handle = app.state::<OverlayHandle>();
        let visible = handle.lock().overlay_visible;
        visible
    };
    if visible {
        hide_overlay(app);
    } else {
        show_overlay(app);
    }
}

pub fn copy_last_response(app: &AppHandle) -> Result<(), String> {
    use tauri_plugin_clipboard_manager::ClipboardExt;
    let text = {
        let handle = app.state::<OverlayHandle>();
        let text = handle.lock().last_server_notification_text.clone();
        text
    };
    if text.is_empty() {
        return Err("No response to copy.".to_string());
    }
    app.clipboard()
        .write_text(text)
        .map_err(|e| e.to_string())
}

pub fn type_last_response(app: &AppHandle) -> Result<(), String> {
    let text = {
        let handle = app.state::<OverlayHandle>();
        let text = handle.lock().last_server_notification_text.clone();
        text
    };
    if text.is_empty() {
        return Err("No response to type.".to_string());
    }
    crate::platform::type_text(&text)
}

pub fn handle_overlay_message(app: &AppHandle, text: &str) {
    {
        let handle = app.state::<OverlayHandle>();
        let mut state = handle.lock();
        state.last_server_notification_text = text.to_string();
        state.awaiting_response = false;
    }
    let visible = {
        let handle = app.state::<OverlayHandle>();
        let visible = handle.lock().overlay_visible;
        visible
    };
    if !visible {
        let _ = enter_notification_standby(app);
    }
}

pub fn set_awaiting_response(app: &AppHandle, awaiting: bool) {
    let handle = app.state::<OverlayHandle>();
    handle.lock().awaiting_response = awaiting;
}

pub fn notify_ready(app: &AppHandle) {
    let should_show = {
        let handle = app.state::<OverlayHandle>();
        let mut state = handle.lock();
        state.renderer_ready = true;
        let pending = state.pending_show;
        state.pending_show = false;
        pending || state.overlay_visible
    };
    if should_show {
        send_show_to_renderer(app);
    }
}

pub fn should_suppress_hotkey(app: &AppHandle) -> bool {
    let handle = app.state::<OverlayHandle>();
    let state = handle.lock();
    let now = now_ms();
    now < state.hotkey_suppress_until
}

pub fn set_hotkey_suppress(app: &AppHandle, ms: i64) {
    let handle = app.state::<OverlayHandle>();
    handle.lock().hotkey_suppress_until = now_ms() + ms;
}

fn now_ms() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}
