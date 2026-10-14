use parking_lot::Mutex;
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::Arc;
use std::time::{Duration, Instant};
use tauri::Manager;
use tauri_plugin_store::StoreExt;

const FILE_LIMIT: usize = 4000;
const FILE_DEPTH: usize = 4;
const SEARCH_LIMIT: usize = 6;
const HISTORY_LIMIT: usize = 50;
const REFRESH_INTERVAL: Duration = Duration::from_secs(120);
const STORE_PATH: &str = "overlay-settings.json";
const HISTORY_KEY: &str = "paletteHistory";

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AppEntry {
    pub id: String,
    pub name: String,
    pub target: String,
    pub kind: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct FileHit {
    pub name: String,
    pub path: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct WindowHit {
    pub hwnd: String,
    pub title: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PaletteSnapshot {
    pub apps: Vec<AppEntry>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HistoryEntry {
    pub title: String,
    #[serde(default)]
    pub subtitle: String,
    #[serde(default)]
    pub category: String,
    #[serde(default)]
    pub action: serde_json::Value,
    #[serde(default)]
    pub confirm: bool,
    #[serde(default)]
    pub query: String,
    #[serde(default)]
    pub at: i64,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExecutePayload {
    pub invoke: String,
    #[serde(default)]
    pub target: String,
    #[serde(default)]
    pub elevated: bool,
    #[serde(default)]
    pub confirmed: bool,
}

struct PaletteCache {
    apps: Vec<AppEntry>,
    files: Vec<FileHit>,
    refreshed: Option<Instant>,
}

pub struct PaletteHandle {
    inner: Arc<Mutex<PaletteCache>>,
}

impl PaletteHandle {
    pub fn new() -> Self {
        Self {
            inner: Arc::new(Mutex::new(PaletteCache {
                apps: Vec::new(),
                files: Vec::new(),
                refreshed: None,
            })),
        }
    }
}

pub fn name_score(query: &str, name: &str) -> i32 {
    let q = query.trim().to_lowercase();
    let n = name.trim().to_lowercase();
    if q.is_empty() || n.is_empty() {
        return 0;
    }
    if n == q {
        return 1000;
    }
    if n.starts_with(&q) {
        return 800;
    }
    if n.contains(&q) {
        return 500;
    }
    let query_chars: Vec<char> = q.chars().collect();
    let mut index = 0;
    for ch in n.chars() {
        if index < query_chars.len() && ch == query_chars[index] {
            index += 1;
        }
        if index == query_chars.len() {
            return 200;
        }
    }
    0
}

pub fn sanitize_search_query(query: &str) -> String {
    let mut raw = String::new();
    for ch in query.chars() {
        if ch.is_ascii_alphanumeric() || ch == ' ' || ch == '.' || ch == '-' || ch == '_' {
            raw.push(ch);
        }
    }
    let collapsed = raw.split_whitespace().collect::<Vec<_>>().join(" ");
    collapsed.chars().take(80).collect()
}

pub fn requires_confirmation(action: &str) -> bool {
    matches!(action, "shutdown" | "restart" | "signout" | "recycle")
}

pub fn ensure_confirmed(action: &str, confirmed: bool) -> Result<(), String> {
    if requires_confirmation(action) && !confirmed {
        Err("Confirmation required.".to_string())
    } else {
        Ok(())
    }
}

pub fn filter_file_hits(files: &[FileHit], query: &str, limit: usize) -> Vec<FileHit> {
    let mut scored: Vec<(i32, usize)> = files
        .iter()
        .enumerate()
        .map(|(index, file)| (name_score(query, &file.name), index))
        .filter(|(score, _)| *score > 0)
        .collect();
    scored.sort_by(|a, b| b.0.cmp(&a.0).then(a.1.cmp(&b.1)));
    scored.truncate(limit);
    scored
        .into_iter()
        .map(|(_, index)| files[index].clone())
        .collect()
}

fn history_key(entry: &HistoryEntry) -> String {
    let action = &entry.action;
    let invoke = action
        .get("invoke")
        .and_then(|value| value.as_str())
        .unwrap_or("");
    let target = action
        .get("target")
        .and_then(|value| value.as_str())
        .or_else(|| action.get("name").and_then(|value| value.as_str()))
        .or_else(|| action.get("url").and_then(|value| value.as_str()))
        .or_else(|| action.get("text").and_then(|value| value.as_str()))
        .unwrap_or("");
    format!("{}|{}|{}|{}", entry.category, action.get("type").and_then(|v| v.as_str()).unwrap_or(""), invoke, target)
}

pub fn push_history(mut items: Vec<HistoryEntry>, entry: HistoryEntry) -> Vec<HistoryEntry> {
    let key = history_key(&entry);
    items.retain(|item| history_key(item) != key);
    items.insert(0, entry);
    items.truncate(HISTORY_LIMIT);
    items
}

fn merge_files(primary: Vec<FileHit>, extra: Vec<FileHit>, limit: usize) -> Vec<FileHit> {
    let mut seen = std::collections::HashSet::new();
    let mut merged = Vec::new();
    for file in primary.into_iter().chain(extra) {
        let key = file.path.to_lowercase();
        if key.is_empty() || !seen.insert(key) {
            continue;
        }
        merged.push(file);
        if merged.len() >= limit {
            break;
        }
    }
    merged
}

pub async fn refresh(app: tauri::AppHandle) -> Result<PaletteSnapshot, String> {
    let handle = app.state::<PaletteHandle>().inner.clone();
    let snapshot = tokio::task::spawn_blocking(move || refresh_blocking(handle))
        .await
        .map_err(|error| error.to_string())?;
    Ok(snapshot)
}

fn refresh_blocking(handle: Arc<Mutex<PaletteCache>>) -> PaletteSnapshot {
    {
        let cache = handle.lock();
        if let Some(refreshed) = cache.refreshed {
            if refreshed.elapsed() < REFRESH_INTERVAL && !cache.apps.is_empty() {
                return PaletteSnapshot {
                    apps: cache.apps.clone(),
                };
            }
        }
    }

    let apps = collect_apps();
    let files = collect_files();
    let mut cache = handle.lock();
    cache.apps = apps.clone();
    cache.files = files;
    cache.refreshed = Some(Instant::now());
    PaletteSnapshot { apps }
}

pub async fn files(app: tauri::AppHandle, query: String) -> Result<Vec<FileHit>, String> {
    let handle = app.state::<PaletteHandle>().inner.clone();
    tokio::task::spawn_blocking(move || search_files(handle, &query))
        .await
        .map_err(|error| error.to_string())
}

fn search_files(handle: Arc<Mutex<PaletteCache>>, query: &str) -> Vec<FileHit> {
    let cached = {
        let cache = handle.lock();
        cache.files.clone()
    };
    let local = filter_file_hits(&cached, query, SEARCH_LIMIT);
    if local.len() >= 4 {
        return local;
    }
    let remote = windows_search(query).unwrap_or_default();
    merge_files(local, remote, SEARCH_LIMIT)
}

pub fn windows_list(overlay_hwnd: Option<isize>) -> Vec<WindowHit> {
    #[cfg(windows)]
    {
        list_windows(overlay_hwnd.unwrap_or(0))
    }
    #[cfg(not(windows))]
    {
        let _ = overlay_hwnd;
        Vec::new()
    }
}

pub fn execute(payload: &ExecutePayload) -> Result<(), String> {
    match payload.invoke.as_str() {
        "launch-app" => open_target(&payload.target),
        "open-file" => open_target(&payload.target),
        "open-uri" => {
            if !is_settings_uri(&payload.target) {
                return Err("Unsupported settings link.".to_string());
            }
            open_target(&payload.target)
        }
        "focus-window" => focus_window(&payload.target),
        "shell" => run_shell(&payload.target, payload.elevated),
        "system" => {
            ensure_confirmed(&payload.target, payload.confirmed)?;
            run_system(&payload.target)
        }
        _ => Err("Unknown palette action.".to_string()),
    }
}

pub fn load_history(app: &tauri::AppHandle) -> Vec<HistoryEntry> {
    let Ok(store) = app.store(STORE_PATH) else {
        return Vec::new();
    };
    let Some(raw) = store.get(HISTORY_KEY) else {
        return Vec::new();
    };
    serde_json::from_value(raw).unwrap_or_default()
}

pub fn record_history(app: &tauri::AppHandle, entry: HistoryEntry) -> Result<Vec<HistoryEntry>, String> {
    let store = app.store(STORE_PATH).map_err(|error| error.to_string())?;
    let current = store
        .get(HISTORY_KEY)
        .and_then(|value| serde_json::from_value(value).ok())
        .unwrap_or_default();
    let next = push_history(current, entry);
    store.set(
        HISTORY_KEY,
        serde_json::to_value(&next).map_err(|error| error.to_string())?,
    );
    store.save().map_err(|error| error.to_string())?;
    Ok(next)
}

fn is_settings_uri(uri: &str) -> bool {
    let lower = uri.trim().to_ascii_lowercase();
    lower.starts_with("ms-settings:") || lower.starts_with("shell:")
}

fn collect_apps() -> Vec<AppEntry> {
    #[cfg(windows)]
    {
        let mut apps = Vec::new();
        let mut seen = std::collections::HashSet::new();
        for dir in start_menu_dirs() {
            collect_shortcuts(&dir, &mut apps, &mut seen);
        }
        for app in packaged_apps() {
            let key = app.name.to_lowercase();
            if seen.insert(key) {
                apps.push(app);
            }
        }
        apps.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
        apps
    }
    #[cfg(not(windows))]
    {
        Vec::new()
    }
}

fn collect_files() -> Vec<FileHit> {
    #[cfg(windows)]
    {
        let mut files = Vec::new();
        for dir in user_dirs() {
            walk_files(&dir, 0, &mut files);
            if files.len() >= FILE_LIMIT {
                break;
            }
        }
        files
    }
    #[cfg(not(windows))]
    {
        Vec::new()
    }
}

#[cfg(windows)]
fn user_dirs() -> Vec<PathBuf> {
    let mut dirs = Vec::new();
    if let Ok(profile) = std::env::var("USERPROFILE") {
        let root = PathBuf::from(profile);
        for name in ["Desktop", "Documents", "Downloads"] {
            let path = root.join(name);
            if path.is_dir() {
                dirs.push(path);
            }
        }
    }
    dirs
}

#[cfg(windows)]
fn start_menu_dirs() -> Vec<PathBuf> {
    let mut dirs = Vec::new();
    if let Ok(appdata) = std::env::var("APPDATA") {
        dirs.push(PathBuf::from(appdata).join(r"Microsoft\Windows\Start Menu\Programs"));
    }
    if let Ok(program_data) = std::env::var("ProgramData") {
        dirs.push(PathBuf::from(program_data).join(r"Microsoft\Windows\Start Menu\Programs"));
    }
    dirs
}

#[cfg(windows)]
fn walk_files(dir: &Path, depth: usize, out: &mut Vec<FileHit>) {
    if depth > FILE_DEPTH || out.len() >= FILE_LIMIT {
        return;
    }
    let entries = match std::fs::read_dir(dir) {
        Ok(entries) => entries,
        Err(_) => return,
    };
    for entry in entries.flatten() {
        if out.len() >= FILE_LIMIT {
            return;
        }
        let name = entry.file_name().to_string_lossy().to_string();
        if name.starts_with('.') || name.eq_ignore_ascii_case("node_modules") || name.eq_ignore_ascii_case("$RECYCLE.BIN") {
            continue;
        }
        let path = entry.path();
        let Ok(file_type) = entry.file_type() else {
            continue;
        };
        if file_type.is_dir() {
            walk_files(&path, depth + 1, out);
        } else if file_type.is_file() {
            out.push(FileHit {
                name,
                path: path.display().to_string(),
            });
        }
    }
}

#[cfg(windows)]
fn collect_shortcuts(dir: &Path, apps: &mut Vec<AppEntry>, seen: &mut std::collections::HashSet<String>) {
    let entries = match std::fs::read_dir(dir) {
        Ok(entries) => entries,
        Err(_) => return,
    };
    for entry in entries.flatten() {
        let path = entry.path();
        let Ok(file_type) = entry.file_type() else {
            continue;
        };
        if file_type.is_dir() {
            collect_shortcuts(&path, apps, seen);
            continue;
        }
        let Some(ext) = path.extension().and_then(|value| value.to_str()) else {
            continue;
        };
        if !ext.eq_ignore_ascii_case("lnk") {
            continue;
        }
        let Some(stem) = path.file_stem().and_then(|value| value.to_str()) else {
            continue;
        };
        let key = stem.to_lowercase();
        if !seen.insert(key) {
            continue;
        }
        apps.push(AppEntry {
            id: path.display().to_string(),
            name: stem.to_string(),
            target: path.display().to_string(),
            kind: "shortcut".to_string(),
        });
    }
}

#[cfg(windows)]
fn packaged_apps() -> Vec<AppEntry> {
    let output = hidden_command("powershell")
        .args([
            "-NoProfile",
            "-NonInteractive",
            "-Command",
            "Get-StartApps | Select-Object Name, AppID | ConvertTo-Json -Compress",
        ])
        .output();
    let Ok(output) = output else {
        return Vec::new();
    };
    if !output.status.success() {
        return Vec::new();
    }
    let text = String::from_utf8_lossy(&output.stdout);
    let value: serde_json::Value = match serde_json::from_str(text.trim()) {
        Ok(value) => value,
        Err(_) => return Vec::new(),
    };
    let items = match value {
        serde_json::Value::Array(items) => items,
        serde_json::Value::Object(_) => vec![value],
        _ => return Vec::new(),
    };
    items
        .into_iter()
        .filter_map(|item| {
            let name = item.get("Name").and_then(|value| value.as_str())?.trim();
            let app_id = item.get("AppID").and_then(|value| value.as_str())?.trim();
            if name.is_empty() || app_id.is_empty() {
                return None;
            }
            Some(AppEntry {
                id: app_id.to_string(),
                name: name.to_string(),
                target: format!("shell:AppsFolder\\{app_id}"),
                kind: "packaged".to_string(),
            })
        })
        .collect()
}

fn windows_search(query: &str) -> Result<Vec<FileHit>, String> {
    #[cfg(windows)]
    {
        let safe = sanitize_search_query(query);
        if safe.chars().count() < 2 {
            return Ok(Vec::new());
        }
        let mut child = hidden_command("powershell")
            .env("NETSOCKET_PALETTE_QUERY", &safe)
            .args(["-NoProfile", "-NonInteractive", "-Command", SEARCH_SCRIPT])
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::null())
            .spawn()
            .map_err(|error| error.to_string())?;
        let started = Instant::now();
        loop {
            if child.try_wait().map_err(|error| error.to_string())?.is_some() {
                break;
            }
            if started.elapsed() > Duration::from_millis(1500) {
                let _ = child.kill();
                return Ok(Vec::new());
            }
            std::thread::sleep(Duration::from_millis(30));
        }
        let output = child.wait_with_output().map_err(|error| error.to_string())?;
        if !output.status.success() {
            return Ok(Vec::new());
        }
        parse_file_json(&String::from_utf8_lossy(&output.stdout))
    }
    #[cfg(not(windows))]
    {
        let _ = query;
        Ok(Vec::new())
    }
}

fn parse_file_json(text: &str) -> Result<Vec<FileHit>, String> {
    let trimmed = text.trim();
    if trimmed.is_empty() || trimmed == "null" {
        return Ok(Vec::new());
    }
    let value: serde_json::Value = serde_json::from_str(trimmed).unwrap_or(serde_json::Value::Null);
    let items = match value {
        serde_json::Value::Array(items) => items,
        serde_json::Value::Object(_) => vec![value],
        _ => return Ok(Vec::new()),
    };
    Ok(items
        .into_iter()
        .filter_map(|item| {
            let name = item.get("name").and_then(|value| value.as_str()).unwrap_or("").trim().to_string();
            let path = item.get("path").and_then(|value| value.as_str()).unwrap_or("").trim().to_string();
            if name.is_empty() || path.is_empty() {
                None
            } else {
                Some(FileHit { name, path })
            }
        })
        .collect())
}

#[cfg(windows)]
fn hidden_command(program: &str) -> Command {
    use std::os::windows::process::CommandExt;
    const CREATE_NO_WINDOW: u32 = 0x08000000;
    let mut command = Command::new(program);
    command.creation_flags(CREATE_NO_WINDOW);
    command
}

#[cfg(windows)]
const SEARCH_SCRIPT: &str = r#"
$ErrorActionPreference = 'Stop'
$q = $env:NETSOCKET_PALETTE_QUERY
if ([string]::IsNullOrWhiteSpace($q)) { '[]'; exit 0 }
$limit = 6
function Invoke-Index([string]$sql) {
  $conn = New-Object -ComObject ADODB.Connection
  $conn.Open("Provider=Search.CollatorDSO;Extended Properties='Application=Windows';")
  $rs = $conn.Execute($sql)
  $rows = @()
  while ($rs -and -not $rs.EOF) {
    $name = [string]$rs.Fields.Item('System.ItemName').Value
    $path = [string]$rs.Fields.Item('System.ItemPathDisplay').Value
    if ($path) { $rows += [pscustomobject]@{ name = $name; path = $path } }
    [void]$rs.MoveNext()
    if ($rows.Count -ge $limit) { break }
  }
  return ,$rows
}
$safe = $q.Replace("'", "''")
$terms = @($q -split '\s+' | Where-Object { $_ })
$word = ($terms | ForEach-Object { '"{0}"' -f $_ }) -join ' AND '
$rows = $null
try {
  $contains = "SELECT TOP $limit System.ItemName, System.ItemPathDisplay FROM SystemIndex WHERE SCOPE='file:' AND CONTAINS(*, '$word')"
  $rows = Invoke-Index $contains
} catch {}
if (-not $rows -or $rows.Count -eq 0) {
  try {
    $like = "SELECT TOP $limit System.ItemName, System.ItemPathDisplay FROM SystemIndex WHERE SCOPE='file:' AND System.FileName LIKE '%$safe%'"
    $rows = Invoke-Index $like
  } catch {}
}
if (-not $rows) { '[]' } else { @($rows) | ConvertTo-Json -Compress }
"#;

#[cfg(windows)]
fn list_windows(overlay_hwnd: isize) -> Vec<WindowHit> {
    use windows::Win32::Foundation::LPARAM;
    use windows::Win32::UI::WindowsAndMessaging::EnumWindows;

    let mut windows: Vec<WindowHit> = Vec::new();
    let pointer = &mut windows as *mut Vec<WindowHit>;
    unsafe {
        let _ = EnumWindows(Some(enum_window), LPARAM(pointer as isize));
    }
    windows.retain(|window| window.hwnd != overlay_hwnd.to_string());
    windows
}

#[cfg(windows)]
unsafe extern "system" fn enum_window(
    hwnd: windows::Win32::Foundation::HWND,
    lparam: windows::Win32::Foundation::LPARAM,
) -> windows::Win32::Foundation::BOOL {
    use windows::Win32::Foundation::BOOL;
    use windows::Win32::UI::WindowsAndMessaging::{GetWindowTextLengthW, GetWindowTextW, IsWindowVisible};

    if !IsWindowVisible(hwnd).as_bool() {
        return BOOL(1);
    }
    let length = GetWindowTextLengthW(hwnd);
    if length <= 0 {
        return BOOL(1);
    }
    let mut buffer = vec![0u16; (length as usize) + 1];
    let copied = GetWindowTextW(hwnd, &mut buffer);
    if copied <= 0 {
        return BOOL(1);
    }
    let title = String::from_utf16_lossy(&buffer[..copied as usize]).trim().to_string();
    if title.is_empty() {
        return BOOL(1);
    }
    let list = &mut *(lparam.0 as *mut Vec<WindowHit>);
    list.push(WindowHit {
        hwnd: (hwnd.0 as isize).to_string(),
        title,
    });
    BOOL(1)
}

#[cfg(windows)]
fn open_target(target: &str) -> Result<(), String> {
    use windows::Win32::Foundation::HWND;
    use windows::Win32::UI::Shell::ShellExecuteW;
    use windows::Win32::UI::WindowsAndMessaging::SW_SHOWNORMAL;
    use windows::core::{PCWSTR, w};

    let trimmed = target.trim();
    if trimmed.is_empty() {
        return Err("Nothing to open.".to_string());
    }
    let wide = wide_string(trimmed);
    let code = unsafe {
        ShellExecuteW(
            HWND(std::ptr::null_mut()),
            w!("open"),
            PCWSTR(wide.as_ptr()),
            PCWSTR::null(),
            PCWSTR::null(),
            SW_SHOWNORMAL,
        )
    };
    if (code.0 as isize) <= 32 {
        return Err("Could not open that item.".to_string());
    }
    Ok(())
}

#[cfg(not(windows))]
fn open_target(target: &str) -> Result<(), String> {
    let _ = target;
    Err("Palette actions are only available on Windows.".to_string())
}

#[cfg(windows)]
fn run_shell(command: &str, elevated: bool) -> Result<(), String> {
    use windows::Win32::Foundation::HWND;
    use windows::Win32::UI::Shell::ShellExecuteW;
    use windows::Win32::UI::WindowsAndMessaging::SW_SHOWNORMAL;
    use windows::core::{PCWSTR, w};

    let trimmed = command.trim();
    if trimmed.is_empty() {
        return Err("Type a command after >.".to_string());
    }
    if elevated {
        let params = wide_string(&format!("/C {trimmed}"));
        let code = unsafe {
            ShellExecuteW(
                HWND(std::ptr::null_mut()),
                w!("runas"),
                w!("cmd.exe"),
                PCWSTR(params.as_ptr()),
                PCWSTR::null(),
                SW_SHOWNORMAL,
            )
        };
        if (code.0 as isize) <= 32 {
            return Err("Could not run that command.".to_string());
        }
        return Ok(());
    }

    let mut cmd = Command::new("cmd");
    if let Ok(profile) = std::env::var("USERPROFILE") {
        cmd.current_dir(profile);
    }
    cmd.args(["/C", trimmed])
        .spawn()
        .map_err(|error| error.to_string())?;
    Ok(())
}

#[cfg(not(windows))]
fn run_shell(command: &str, elevated: bool) -> Result<(), String> {
    let _ = (command, elevated);
    Err("Palette actions are only available on Windows.".to_string())
}

#[cfg(windows)]
fn run_system(action: &str) -> Result<(), String> {
    use windows::Win32::System::Power::SetSuspendState;
    use windows::Win32::System::Shutdown::LockWorkStation;
    use windows::Win32::UI::Shell::{SHEmptyRecycleBinW, SHERB_NOCONFIRMATION, SHERB_NOPROGRESSUI, SHERB_NOSOUND};

    match action {
        "lock" => unsafe {
            LockWorkStation().map_err(|error| error.to_string())?;
        },
        "sleep" => unsafe {
            let suspended = SetSuspendState(false, false, false);
            if suspended.0 == 0 {
                return Err("Could not sleep.".to_string());
            }
        },
        "hibernate" => unsafe {
            let suspended = SetSuspendState(true, false, false);
            if suspended.0 == 0 {
                return Err("Could not hibernate.".to_string());
            }
        },
        "shutdown" => {
            Command::new("shutdown")
                .args(["/s", "/t", "0"])
                .spawn()
                .map_err(|error| error.to_string())?;
        }
        "restart" => {
            Command::new("shutdown")
                .args(["/r", "/t", "0"])
                .spawn()
                .map_err(|error| error.to_string())?;
        }
        "signout" => {
            Command::new("shutdown")
                .args(["/l"])
                .spawn()
                .map_err(|error| error.to_string())?;
        }
        "recycle" => unsafe {
            let flags = SHERB_NOCONFIRMATION | SHERB_NOPROGRESSUI | SHERB_NOSOUND;
            SHEmptyRecycleBinW(None, None, flags).map_err(|error| error.to_string())?;
        },
        "taskmgr" => {
            Command::new("taskmgr")
                .spawn()
                .map_err(|error| error.to_string())?;
        }
        "settings" => open_target("ms-settings:")?,
        _ => return Err("Unknown system action.".to_string()),
    }
    Ok(())
}

#[cfg(not(windows))]
fn run_system(action: &str) -> Result<(), String> {
    ensure_confirmed(action, true)?;
    Err("Palette actions are only available on Windows.".to_string())
}

#[cfg(windows)]
fn focus_window(hwnd_text: &str) -> Result<(), String> {
    use windows::Win32::Foundation::HWND;
    use windows::Win32::UI::Input::KeyboardAndMouse::{KEYEVENTF_KEYUP, VK_MENU, keybd_event};
    use windows::Win32::UI::WindowsAndMessaging::{SW_RESTORE, SetForegroundWindow, ShowWindow};

    let hwnd_value: isize = hwnd_text
        .trim()
        .parse()
        .map_err(|_| "Missing window.".to_string())?;
    if hwnd_value == 0 {
        return Err("Missing window.".to_string());
    }
    let hwnd = HWND(hwnd_value as *mut core::ffi::c_void);
    unsafe {
        let _ = ShowWindow(hwnd, SW_RESTORE);
        keybd_event(VK_MENU.0 as u8, 0, Default::default(), 0);
        let _ = SetForegroundWindow(hwnd);
        keybd_event(VK_MENU.0 as u8, 0, KEYEVENTF_KEYUP, 0);
    }
    Ok(())
}

#[cfg(not(windows))]
fn focus_window(hwnd_text: &str) -> Result<(), String> {
    let _ = hwnd_text;
    Err("Palette actions are only available on Windows.".to_string())
}

#[cfg(windows)]
fn wide_string(value: &str) -> Vec<u16> {
    value.encode_utf16().chain(std::iter::once(0)).collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn destructive_actions_require_confirmation() {
        assert!(requires_confirmation("shutdown"));
        assert!(requires_confirmation("restart"));
        assert!(requires_confirmation("signout"));
        assert!(requires_confirmation("recycle"));
        assert!(!requires_confirmation("lock"));
        assert!(!requires_confirmation("sleep"));
        assert!(!requires_confirmation("hibernate"));
        assert!(ensure_confirmed("shutdown", false).is_err());
        assert!(ensure_confirmed("shutdown", true).is_ok());
        assert!(ensure_confirmed("lock", false).is_ok());
    }

    #[test]
    fn sanitize_search_query_strips_operators() {
        assert_eq!(sanitize_search_query("foo' OR 1=1"), "foo OR 11");
        assert_eq!(sanitize_search_query("  hello   world  "), "hello world");
        assert!(sanitize_search_query(&"a".repeat(200)).chars().count() <= 80);
    }

    #[test]
    fn filter_file_hits_prefers_exact_name() {
        let files = vec![
            FileHit {
                name: "notes.txt".into(),
                path: "C:\\notes.txt".into(),
            },
            FileHit {
                name: "budget.xlsx".into(),
                path: "C:\\budget.xlsx".into(),
            },
            FileHit {
                name: "Budget draft.xlsx".into(),
                path: "C:\\Budget draft.xlsx".into(),
            },
        ];
        let hits = filter_file_hits(&files, "budget.xlsx", 6);
        assert_eq!(hits[0].name, "budget.xlsx");
        assert!(hits.iter().all(|file| file.name.to_lowercase().contains("budget")));
    }

    #[test]
    fn push_history_dedupes_and_caps() {
        let mut items = Vec::new();
        for index in 0..55 {
            items = push_history(
                items,
                HistoryEntry {
                    title: format!("Item {index}"),
                    subtitle: String::new(),
                    category: "Value".into(),
                    action: serde_json::json!({ "type": "copy", "text": format!("{index}") }),
                    confirm: false,
                    query: format!("{index}"),
                    at: index,
                },
            );
        }
        assert_eq!(items.len(), 50);
        assert_eq!(items[0].title, "Item 54");

        items = push_history(
            items,
            HistoryEntry {
                title: "Item 54".into(),
                subtitle: "again".into(),
                category: "Value".into(),
                action: serde_json::json!({ "type": "copy", "text": "54" }),
                confirm: false,
                query: "54".into(),
                at: 99,
            },
        );
        assert_eq!(items.len(), 50);
        assert_eq!(items[0].at, 99);
        assert_eq!(items.iter().filter(|item| item.title == "Item 54").count(), 1);
    }
}
