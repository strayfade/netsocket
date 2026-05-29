use crate::config::Settings;
use parking_lot::Mutex;
use std::sync::Arc;
use tauri_plugin_store::StoreExt;

const STORE_PATH: &str = "overlay-settings.json";

pub fn load_settings(app: &tauri::AppHandle) -> Settings {
    let Ok(store) = app.store(STORE_PATH) else {
        return Settings::default();
    };

    let Some(raw) = store.get("settings") else {
        return Settings::default();
    };

    serde_json::from_value(raw).unwrap_or_default()
}

pub fn save_settings(app: &tauri::AppHandle, settings: &Settings) -> Result<(), String> {
    let store = app.store(STORE_PATH).map_err(|e| e.to_string())?;
    store.set("settings", serde_json::to_value(settings).map_err(|e| e.to_string())?);
    store.save().map_err(|e| e.to_string())
}

#[derive(Clone)]
pub struct SettingsHandle {
    inner: Arc<Mutex<Settings>>,
}

impl SettingsHandle {
    pub fn new(app: &tauri::AppHandle) -> Self {
        Self {
            inner: Arc::new(Mutex::new(load_settings(app))),
        }
    }

    pub fn get(&self) -> Settings {
        self.inner.lock().clone()
    }

    pub fn update(&self, settings: Settings) {
        *self.inner.lock() = settings;
    }

    pub fn arc(&self) -> Arc<Mutex<Settings>> {
        self.inner.clone()
    }
}
