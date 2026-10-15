use crate::settings_store::SettingsHandle;
use parking_lot::Mutex;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::io::Write;
use std::sync::Arc;
use tauri::{AppHandle, Emitter, Manager};

/// Manifest served by the netsocket host at `GET /v1/updates/overlay`.
#[derive(Debug, Clone, Deserialize)]
pub struct UpdateManifest {
    pub version: String,
    #[serde(default)]
    pub versionCode: u32,
    #[serde(default)]
    pub fileName: String,
    #[serde(default)]
    pub size: u64,
    #[serde(default)]
    pub sha256: String,
    #[serde(default)]
    pub url: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct UpdateStatus {
    pub enabled: bool,
    /// idle | checking | downloading | ready | installed | up-to-date | disabled | error
    pub state: String,
    pub currentVersion: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub latestVersion: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub message: Option<String>,
}

impl UpdateStatus {
    fn new(enabled: bool, state: &str) -> Self {
        Self {
            enabled,
            state: state.to_string(),
            currentVersion: env!("CARGO_PKG_VERSION").to_string(),
            latestVersion: None,
            message: None,
        }
    }
}

#[derive(Clone)]
pub struct UpdaterHandle {
    inner: Arc<Mutex<UpdateStatus>>,
}

impl UpdaterHandle {
    pub fn new(enabled: bool) -> Self {
        Self {
            inner: Arc::new(Mutex::new(UpdateStatus::new(enabled, "idle"))),
        }
    }

    pub fn get(&self) -> UpdateStatus {
        self.inner.lock().clone()
    }

    pub fn set(&self, status: UpdateStatus) {
        *self.inner.lock() = status;
    }

    pub fn set_enabled(&self, enabled: bool) {
        let mut status = self.inner.lock();
        status.enabled = enabled;
        if !enabled {
            status.state = "disabled".to_string();
            status.latestVersion = None;
            status.message = None;
        } else if status.state == "disabled" {
            status.state = "idle".to_string();
        }
    }
}

fn parse_semver(version: &str) -> (u64, u64, u64) {
    let mut parts = version
        .trim()
        .trim_start_matches(['v', 'V'])
        .split('.')
        .map(|part| {
            part.chars()
                .take_while(|c| c.is_ascii_digit())
                .collect::<String>()
                .parse::<u64>()
                .unwrap_or(0)
        });
    (
        parts.next().unwrap_or(0),
        parts.next().unwrap_or(0),
        parts.next().unwrap_or(0),
    )
}

/// True when `latest` is strictly newer than `current`.
pub fn is_newer_version(current: &str, latest: &str) -> bool {
    parse_semver(latest) > parse_semver(current)
}

/// Derives the host HTTP(S) origin from a configured WebSocket URL, e.g.
/// `ws://127.0.0.1:4675/` -> `http://127.0.0.1:4675`.
/// Returns None when the URL cannot be parsed.
pub fn http_origin_from_ws(ws_url: &str) -> Option<String> {
    let trimmed = ws_url.trim();
    let (scheme, rest) = if let Some(rest) = trimmed.strip_prefix("wss://") {
        ("https://", rest)
    } else if let Some(rest) = trimmed.strip_prefix("ws://") {
        ("http://", rest)
    } else if let Some(rest) = trimmed.strip_prefix("https://") {
        ("https://", rest)
    } else if let Some(rest) = trimmed.strip_prefix("http://") {
        ("http://", rest)
    } else {
        return None;
    };
    let authority = rest.split('/').next().unwrap_or("").trim();
    if authority.is_empty() {
        return None;
    }
    Some(format!("{scheme}{authority}"))
}

fn emit_status(app: &AppHandle, status: &UpdateStatus) {
    if let Some(window) = crate::overlay::main_window(app) {
        let _ = window.emit("overlay:update-status", status.clone());
    } else {
        let _ = app.emit("overlay:update-status", status.clone());
    }
}

fn fetch_manifest(origin: &str) -> Result<Option<UpdateManifest>, String> {
    let url = format!("{origin}/v1/updates/overlay");
    let response = reqwest::blocking::Client::builder()
        .timeout(std::time::Duration::from_secs(25))
        .build()
        .map_err(|e| e.to_string())?
        .get(&url)
        .send()
        .map_err(|e| e.to_string())?;
    if response.status() == reqwest::StatusCode::NOT_FOUND {
        return Ok(None);
    }
    if !response.status().is_success() {
        return Err(format!("update check failed: HTTP {}", response.status()));
    }
    response.json::<UpdateManifest>().map(Some).map_err(|e| e.to_string())
}

fn download_and_verify(origin: &str, manifest: &UpdateManifest) -> Result<std::path::PathBuf, String> {
    let url = if manifest.url.starts_with("http://") || manifest.url.starts_with("https://") {
        manifest.url.clone()
    } else {
        format!("{origin}{}", manifest.url)
    };
    let mut response = reqwest::blocking::Client::builder()
        .timeout(std::time::Duration::from_secs(30))
        .build()
        .map_err(|e| e.to_string())?
        .get(&url)
        .send()
        .map_err(|e| e.to_string())?;
    if !response.status().is_success() {
        return Err(format!("update download failed: HTTP {}", response.status()));
    }

    let dir = std::env::temp_dir().join("netsocket-overlay-update");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let file_name = if manifest.fileName.trim().is_empty() {
        "netsocket-overlay-setup.exe".to_string()
    } else {
        // Never let a hostile manifest escape the staging directory.
        std::path::Path::new(&manifest.fileName)
            .file_name()
            .map(|name| name.to_string_lossy().to_string())
            .filter(|name| !name.trim().is_empty())
            .unwrap_or_else(|| "netsocket-overlay-setup.exe".to_string())
    };
    let dest = dir.join(file_name);
    let mut file = std::fs::File::create(&dest).map_err(|e| e.to_string())?;
    let mut hasher = Sha256::new();
    let mut total: u64 = 0;
    loop {
        use std::io::Read;
        let mut chunk = [0u8; 65536];
        let read = response
            .by_ref()
            .read(&mut chunk)
            .map_err(|e| e.to_string())?;
        if read == 0 {
            break;
        }
        file.write_all(&chunk[..read]).map_err(|e| e.to_string())?;
        hasher.update(&chunk[..read]);
        total += read as u64;
    }
    file.flush().map_err(|e| e.to_string())?;
    drop(file);

    if manifest.size > 0 && total != manifest.size {
        let _ = std::fs::remove_file(&dest);
        return Err(format!(
            "update installer size mismatch (expected {}, got {})",
            manifest.size, total
        ));
    }
    if !manifest.sha256.trim().is_empty() {
        let actual = format!("{:x}", hasher.finalize());
        if !constant_time_eq(&actual, manifest.sha256.trim()) {
            let _ = std::fs::remove_file(&dest);
            return Err("update installer checksum mismatch".to_string());
        }
    }
    Ok(dest)
}

fn constant_time_eq(a: &str, b: &str) -> bool {
    if a.len() != b.len() {
        return false;
    }
    a.bytes()
        .zip(b.bytes())
        .fold(0u8, |acc, (x, y)| acc | (x ^ y))
        == 0
}

/// Silently reinstalls and restarts. The installer runs detached so it
/// survives this process exiting; the overlay quits first so files are
/// not locked. Only Windows NSIS (`/S`) is fully silent today — other
/// platforms stage the installer and report `ready` instead.
fn install_silently(installer: &std::path::Path) -> Result<&'static str, String> {
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const DETACHED_PROCESS: u32 = 0x08000000;
        std::process::Command::new(installer)
            .arg("/S")
            .creation_flags(DETACHED_PROCESS)
            .spawn()
            .map_err(|e| format!("failed to launch installer: {e}"))?;
        // Give the detached installer a moment to start, then quit so it
        // can replace our files.
        std::thread::sleep(std::time::Duration::from_millis(750));
        std::process::exit(0);
    }
    #[cfg(not(windows))]
    {
        let _ = installer;
        return Err(
            "automatic install is only supported on Windows; the new installer is staged in the temp directory."
                .to_string(),
        );
    }
}

pub fn refresh_enabled(app: &AppHandle) {
    let enabled = app.state::<SettingsHandle>().get().autoUpdateEnabled;
    app.state::<UpdaterHandle>().set_enabled(enabled);
}

fn run_check(app: &AppHandle, install_when_ready: bool) -> UpdateStatus {
    let settings = app.state::<SettingsHandle>().get();
    let current = env!("CARGO_PKG_VERSION").to_string();
    if !settings.autoUpdateEnabled {
        let status = UpdateStatus {
            enabled: false,
            state: "disabled".to_string(),
            currentVersion: current,
            latestVersion: None,
            message: None,
        };
        app.state::<UpdaterHandle>().set(status.clone());
        emit_status(app, &status);
        return status;
    }

    let mut status = UpdateStatus {
        enabled: true,
        state: "checking".to_string(),
        currentVersion: current.clone(),
        latestVersion: None,
        message: None,
    };
    app.state::<UpdaterHandle>().set(status.clone());
    emit_status(app, &status);

    let (_, ws_url, _) = settings.active_connection();
    let Some(origin) = http_origin_from_ws(&ws_url) else {
        status.state = "error".to_string();
        status.message = Some("Could not derive the host address from the WebSocket URL.".to_string());
        app.state::<UpdaterHandle>().set(status.clone());
        emit_status(app, &status);
        return status;
    };

    let manifest = match fetch_manifest(&origin) {
        Ok(manifest) => manifest,
        Err(error) => {
            status.state = "error".to_string();
            status.message = Some(error);
            app.state::<UpdaterHandle>().set(status.clone());
            emit_status(app, &status);
            return status;
        }
    };

    let Some(manifest) = manifest else {
        status.state = "up-to-date".to_string();
        status.message = Some("No update published on this host.".to_string());
        app.state::<UpdaterHandle>().set(status.clone());
        emit_status(app, &status);
        return status;
    };

    if !is_newer_version(&current, &manifest.version) {
        status.state = "up-to-date".to_string();
        status.latestVersion = Some(manifest.version.clone());
        status.message = Some(format!("Overlay {current} is up to date."));
        app.state::<UpdaterHandle>().set(status.clone());
        emit_status(app, &status);
        return status;
    }

    status.state = "downloading".to_string();
    status.latestVersion = Some(manifest.version.clone());
    status.message = Some(format!("Downloading overlay {}…", manifest.version));
    app.state::<UpdaterHandle>().set(status.clone());
    emit_status(app, &status);

    let installer = match download_and_verify(&origin, &manifest) {
        Ok(path) => path,
        Err(error) => {
            status.state = "error".to_string();
            status.message = Some(error);
            app.state::<UpdaterHandle>().set(status.clone());
            emit_status(app, &status);
            return status;
        }
    };

    if !install_when_ready {
        status.state = "ready".to_string();
        status.message = Some(format!(
            "Overlay {} downloaded — it will install quietly overnight.",
            manifest.version
        ));
        app.state::<UpdaterHandle>().set(status.clone());
        emit_status(app, &status);
        return status;
    }

    match install_silently(&installer) {
        Ok(_) => {
            status.state = "installed".to_string();
            status.message = Some(format!("Overlay {} installed.", manifest.version));
        }
        Err(error) => {
            // Non-Windows (or a failed launch): keep the staged file and
            // report it instead of failing loudly overnight.
            status.state = "ready".to_string();
            status.message = Some(error);
        }
    }
    app.state::<UpdaterHandle>().set(status.clone());
    emit_status(app, &status);
    status
}

pub async fn check_now(app: AppHandle, install_when_ready: bool) -> UpdateStatus {
    // reqwest::blocking must not run on the async runtime.
    let handle = tokio::task::spawn_blocking(move || run_check(&app, install_when_ready));
    match handle.await {
        Ok(status) => status,
        Err(error) => UpdateStatus {
            enabled: true,
            state: "error".to_string(),
            currentVersion: env!("CARGO_PKG_VERSION").to_string(),
            latestVersion: None,
            message: Some(error.to_string()),
        },
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn newer_versions_compare_numerically() {
        assert!(is_newer_version("1.0.0", "1.0.1"));
        assert!(is_newer_version("1.0.0", "1.1.0"));
        assert!(is_newer_version("1.0.0", "2.0.0"));
        assert!(is_newer_version("1.9.9", "1.10.0"));
        assert!(!is_newer_version("1.0.1", "1.0.1"));
        assert!(!is_newer_version("1.0.1", "1.0.0"));
        assert!(!is_newer_version("2.0.0", "1.99.99"));
    }

    #[test]
    fn ws_urls_map_to_http_origins() {
        assert_eq!(
            http_origin_from_ws("ws://127.0.0.1:4675/").as_deref(),
            Some("http://127.0.0.1:4675")
        );
        assert_eq!(
            http_origin_from_ws("wss://example.com:443/path?x=1").as_deref(),
            Some("https://example.com:443")
        );
        assert_eq!(
            http_origin_from_ws("  ws://host  ").as_deref(),
            Some("http://host")
        );
        assert_eq!(http_origin_from_ws("not a url"), None);
        assert_eq!(http_origin_from_ws(""), None);
    }
}
