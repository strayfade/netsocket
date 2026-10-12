use crate::config::{is_valid_overlay_hotkey, Settings};
use crate::overlay::{set_hotkey_suppress, OverlayHandle};
use crate::settings_store::SettingsHandle;
use std::str::FromStr;
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut};

pub fn hotkey_matches(stored: &str, shortcut: &Shortcut) -> bool {
    Shortcut::from_str(stored.trim())
        .map(|parsed| parsed.id() == shortcut.id())
        .unwrap_or(false)
}

pub fn canonical_hotkey_string(hotkey: &str) -> String {
    Shortcut::from_str(hotkey.trim())
        .map(|parsed| parsed.to_string())
        .unwrap_or_else(|_| hotkey.trim().to_string())
}

pub fn register_all_hotkeys(app: &AppHandle, settings: &Settings) -> Result<(), String> {
    let gs = app.global_shortcut();
    gs.unregister_all().map_err(|e| e.to_string())?;

    register_if_set(app, &settings.hotkey)?;
    register_if_set(app, &settings.copyLastResponseHotkey)?;
    register_if_set(app, &settings.typeLastResponseHotkey)?;

    // unregister_all above drops the temporary Escape binding used to dismiss alerts.
    #[cfg(not(windows))]
    sync_escape_dismiss_shortcut(app)?;

    Ok(())
}

/// Register or release the plain Escape shortcut used to dismiss a visible alert.
/// Windows uses a low-level keyboard hook instead; RegisterHotKey cannot reliably
/// claim Escape while other apps are focused.
#[cfg(not(windows))]
pub fn sync_escape_dismiss_shortcut(app: &AppHandle) -> Result<(), String> {
    let armed = app.state::<OverlayHandle>().lock().escape_dismiss_armed;
    let gs = app.global_shortcut();
    if armed {
        if !gs.is_registered("Escape") {
            gs.register("Escape").map_err(|e| e.to_string())?;
        }
        return Ok(());
    }
    if gs.is_registered("Escape") && !settings_bind_escape(app) {
        gs.unregister("Escape").map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[cfg(not(windows))]
fn settings_bind_escape(app: &AppHandle) -> bool {
    let settings = app.state::<SettingsHandle>().get();
    let Ok(escape) = Shortcut::from_str("Escape") else {
        return false;
    };
    [
        settings.hotkey.as_str(),
        settings.copyLastResponseHotkey.as_str(),
        settings.typeLastResponseHotkey.as_str(),
    ]
    .into_iter()
    .any(|stored| hotkey_matches(stored, &escape))
}

fn register_if_set(app: &AppHandle, hotkey: &str) -> Result<(), String> {
    let trimmed = hotkey.trim();
    if trimmed.is_empty() {
        return Ok(());
    }
    let canonical = canonical_hotkey_string(trimmed);
    app.global_shortcut()
        .register(canonical.as_str())
        .map_err(|e| e.to_string())
}

pub fn start_hotkey_capture(app: &AppHandle, target: String) -> Result<(), String> {
    {
        let overlay = app.state::<OverlayHandle>();
        let mut state = overlay.lock();
        state.hotkey_capture_active = true;
        state.hotkey_capture_target = target;
    }
    app.global_shortcut()
        .unregister_all()
        .map_err(|e| e.to_string())
}

pub fn complete_hotkey_capture(
    app: &AppHandle,
    target: String,
    hotkey: Option<String>,
    cancelled: bool,
) -> Result<(), String> {
    {
        let overlay = app.state::<OverlayHandle>();
        let mut state = overlay.lock();
        state.hotkey_capture_active = false;
    }

    if cancelled {
        let settings = app.state::<SettingsHandle>().get();
        register_all_hotkeys(app, &settings)?;
        let _ = app.emit(
            "overlay:hotkey-captured",
            serde_json::json!({
                "ok": false,
                "cancelled": true,
                "target": target,
            }),
        );
        return Ok(());
    }

    let Some(hotkey) = hotkey.filter(|value| !value.trim().is_empty()) else {
        let settings = app.state::<SettingsHandle>().get();
        register_all_hotkeys(app, &settings)?;
        return Ok(());
    };

    set_hotkey_suppress(app, 900);

    let canonical = canonical_hotkey_string(&hotkey);
    if target == "hotkey" {
        if let Err(error) = is_valid_overlay_hotkey(&canonical) {
            let settings = app.state::<SettingsHandle>().get();
            register_all_hotkeys(app, &settings)?;
            let _ = app.emit(
                "overlay:hotkey-captured",
                serde_json::json!({
                    "ok": false,
                    "error": error,
                    "target": target,
                }),
            );
            return Ok(());
        }
    }

    let mut settings = app.state::<SettingsHandle>().get();
    match target.as_str() {
        "hotkey" => settings.hotkey = canonical.clone(),
        "copyLastResponseHotkey" => settings.copyLastResponseHotkey = canonical.clone(),
        "typeLastResponseHotkey" => settings.typeLastResponseHotkey = canonical.clone(),
        _ => settings.hotkey = canonical.clone(),
    }

    app.state::<SettingsHandle>().update(settings.clone());
    crate::settings_store::save_settings(app, &settings)?;
    register_all_hotkeys(app, &settings)?;

    let _ = app.emit(
        "overlay:hotkey-captured",
        serde_json::json!({
            "ok": true,
            "hotkey": canonical,
            "target": target,
        }),
    );

    Ok(())
}

pub fn apply_autostart(app: &AppHandle, enabled: bool) -> Result<(), String> {
    use tauri_plugin_autostart::ManagerExt;
    if enabled {
        app.autolaunch().enable().map_err(|e| e.to_string())
    } else {
        app.autolaunch().disable().map_err(|e| e.to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::str::FromStr;

    #[test]
    fn hotkey_matches_ignores_modifier_casing() {
        let shortcut = Shortcut::from_str("Alt+Space").unwrap();
        assert!(hotkey_matches("Alt+Space", &shortcut));
        assert!(hotkey_matches("alt+space", &shortcut));
    }

    #[test]
    fn hotkey_matches_plain_escape_only() {
        let escape = Shortcut::from_str("Escape").unwrap();
        assert!(hotkey_matches("Escape", &escape));
        assert!(!hotkey_matches("Ctrl+Escape", &escape));
        assert!(!hotkey_matches("", &escape));
    }
}
