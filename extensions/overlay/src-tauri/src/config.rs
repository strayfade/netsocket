use serde::{Deserialize, Serialize};
use std::collections::HashMap;

pub const DEFAULT_HOTKEY: &str = "Alt+Space";
pub const DEFAULT_COPY_LAST_RESPONSE_HOTKEY: &str = "Alt+Shift+C";
pub const DEFAULT_TYPE_LAST_RESPONSE_HOTKEY: &str = "Alt+Shift+T";
pub const DEFAULT_PROFILE: &str = "production";
pub const DEFAULT_RESPONSE_TIMEOUT_SECONDS: u32 = 120;
pub const MIN_RESPONSE_TIMEOUT_SECONDS: u32 = 5;
pub const MAX_RESPONSE_TIMEOUT_SECONDS: u32 = 300;
pub const RECONNECT_DELAY_MS: u64 = 1750;
pub const PING_INTERVAL_MS: u64 = 10000;
pub const HIDE_ANIMATION_MS: u64 = 260;
pub const TYPE_RESPONSE_DELAY_MS: u64 = 500;

pub const HOTKEY_SETTING_KEYS: [&str; 3] = [
    "hotkey",
    "copyLastResponseHotkey",
    "typeLastResponseHotkey",
];

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProfileConfig {
    pub url: String,
    pub secret: String,
}

impl Default for ProfileConfig {
    fn default() -> Self {
        Self {
            url: "ws://127.0.0.1:4675".to_string(),
            secret: String::new(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Settings {
    pub hotkey: String,
    pub copyLastResponseHotkey: String,
    pub typeLastResponseHotkey: String,
    pub openAtLogin: bool,
    pub activeProfile: String,
    pub responseTimeoutSeconds: u32,
    pub profiles: HashMap<String, ProfileConfig>,
}

impl Default for Settings {
    fn default() -> Self {
        let mut profiles = HashMap::new();
        profiles.insert("production".to_string(), ProfileConfig::default());
        profiles.insert("development".to_string(), ProfileConfig::default());
        Self {
            hotkey: DEFAULT_HOTKEY.to_string(),
            copyLastResponseHotkey: DEFAULT_COPY_LAST_RESPONSE_HOTKEY.to_string(),
            typeLastResponseHotkey: DEFAULT_TYPE_LAST_RESPONSE_HOTKEY.to_string(),
            openAtLogin: false,
            activeProfile: DEFAULT_PROFILE.to_string(),
            responseTimeoutSeconds: DEFAULT_RESPONSE_TIMEOUT_SECONDS,
            profiles,
        }
    }
}

impl Settings {
    pub fn clamp_response_timeout(value: u32) -> u32 {
        value.clamp(MIN_RESPONSE_TIMEOUT_SECONDS, MAX_RESPONSE_TIMEOUT_SECONDS)
    }

    pub fn normalize_hotkey(value: &str, fallback: &str) -> String {
        let trimmed = value.trim();
        if trimmed.is_empty() {
            fallback.to_string()
        } else {
            trimmed.to_string()
        }
    }

    pub fn active_connection(&self) -> (String, String, String) {
        let profile_name = if self.activeProfile == "development" {
            "development"
        } else {
            "production"
        };
        let profile = self
            .profiles
            .get(profile_name)
            .cloned()
            .unwrap_or_default();
        (
            profile_name.to_string(),
            profile.url.trim().to_string(),
            profile.secret.trim().to_string(),
        )
    }

    pub fn from_saved(raw: Settings) -> Self {
        Settings {
            hotkey: Self::normalize_hotkey(&raw.hotkey, DEFAULT_HOTKEY),
            copyLastResponseHotkey: Self::normalize_hotkey(
                &raw.copyLastResponseHotkey,
                DEFAULT_COPY_LAST_RESPONSE_HOTKEY,
            ),
            typeLastResponseHotkey: Self::normalize_hotkey(
                &raw.typeLastResponseHotkey,
                DEFAULT_TYPE_LAST_RESPONSE_HOTKEY,
            ),
            openAtLogin: raw.openAtLogin,
            activeProfile: if raw.activeProfile == "development" {
                "development".to_string()
            } else {
                "production".to_string()
            },
            responseTimeoutSeconds: Self::clamp_response_timeout(raw.responseTimeoutSeconds),
            profiles: {
                let mut profiles = HashMap::new();
                profiles.insert(
                    "production".to_string(),
                    raw.profiles
                        .get("production")
                        .cloned()
                        .unwrap_or_default(),
                );
                profiles.insert(
                    "development".to_string(),
                    raw.profiles
                        .get("development")
                        .cloned()
                        .unwrap_or_default(),
                );
                profiles
            },
        }
    }
}

#[derive(Debug, Clone, Serialize)]
pub struct ConnectionState {
    pub connected: bool,
    pub connecting: bool,
    pub lastError: String,
    pub url: String,
    pub profile: String,
}

impl Default for ConnectionState {
    fn default() -> Self {
        Self {
            connected: false,
            connecting: false,
            lastError: String::new(),
            url: String::new(),
            profile: DEFAULT_PROFILE.to_string(),
        }
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HotkeyCapturedPayload {
    pub ok: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub hotkey: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub target: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cancelled: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct OkPayload {
    pub ok: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub conversationId: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct CommandSendPayload {
    pub command: String,
    #[serde(rename = "conversationId", default)]
    pub conversation_id: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct CompleteHotkeyCapturePayload {
    pub target: String,
    #[serde(default)]
    pub hotkey: Option<String>,
    #[serde(default)]
    pub cancelled: bool,
}

pub fn parse_overlay_broadcast(parsed: &serde_json::Value) -> Option<(String, Option<String>)> {
    if parsed.get("broadcastPurpose")?.as_str()? != "overlay" {
        return None;
    }
    let data = parsed.get("broadcastData")?;
    if let Some(text) = data.as_str() {
        return Some((text.to_string(), None));
    }
    if let Some(obj) = data.as_object() {
        let text = obj
            .get("text")
            .or_else(|| obj.get("message"))
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();
        let conversation_id = obj
            .get("conversationId")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string());
        if text.is_empty() {
            return None;
        }
        return Some((text, conversation_id));
    }
    None
}

pub fn is_external_url(url: &str) -> bool {
    url.starts_with("http://") || url.starts_with("https://") || url.starts_with("mailto:")
}
