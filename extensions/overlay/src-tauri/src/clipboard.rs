use crate::config::ConnectionState;
use crate::settings_store::SettingsHandle;
use base64::{engine::general_purpose::STANDARD as B64, Engine as _};
use parking_lot::Mutex;
use std::io::Cursor;
use std::sync::atomic::{AtomicBool, AtomicU32, Ordering};
use std::sync::Arc;
use std::time::Duration;
use tauri::AppHandle;
use tauri_plugin_clipboard_manager::ClipboardExt;

pub const MAX_ENCODED_CHARS: usize = 8 * 1024 * 1024;

static WRITE_IN_PROGRESS: AtomicBool = AtomicBool::new(false);
static HAS_SUPPRESSED_SEQUENCE: AtomicBool = AtomicBool::new(false);
static SUPPRESSED_SEQUENCE: AtomicU32 = AtomicU32::new(0);

/// Polls the Windows clipboard sequence number and reports user copies.
/// Sequence changes caused by [write_text] / [write_content] are ignored.
pub fn start_watcher(
    app: AppHandle,
    settings: SettingsHandle,
    connection: Arc<Mutex<ConnectionState>>,
    on_change: impl Fn(String) + Send + 'static,
) {
    #[cfg(windows)]
    {
        std::thread::Builder::new()
            .name("clipboard-watch".into())
            .spawn(move || watch_loop(app, settings, connection, on_change))
            .ok();
    }
    #[cfg(not(windows))]
    {
        let _ = (app, settings, connection, on_change);
    }
}

pub fn write_text(app: &AppHandle, text: &str) -> Result<(), String> {
    begin_write();
    let result = app.clipboard().write_text(text).map_err(|e| e.to_string());
    finish_write();
    result
}

/// Writes plain text, or an image when `content` is a `data:image/...;base64,` URL.
pub fn write_content(app: &AppHandle, content: &str) -> Result<(), String> {
    if content.len() > MAX_ENCODED_CHARS {
        return Err("Clipboard content exceeds size limit.".to_string());
    }
    match decode_image_data_url(content)? {
        Some(bytes) => write_image_bytes(app, &bytes),
        None => write_text(app, content),
    }
}

#[cfg(windows)]
fn watch_loop(
    app: AppHandle,
    settings: SettingsHandle,
    connection: Arc<Mutex<ConnectionState>>,
    on_change: impl Fn(String),
) {
    let mut last_seq = current_sequence();
    loop {
        std::thread::sleep(Duration::from_millis(250));
        if WRITE_IN_PROGRESS.load(Ordering::SeqCst) {
            continue;
        }
        let seq = current_sequence();
        if seq == last_seq {
            continue;
        }
        if is_suppressed(seq) {
            last_seq = seq;
            continue;
        }
        if !settings.get().sendClipboard || connection.lock().authStatus != "approved" {
            last_seq = seq;
            continue;
        }
        let content = read_encoded(&app);
        if WRITE_IN_PROGRESS.load(Ordering::SeqCst) {
            continue;
        }
        let seq_after = current_sequence();
        if seq_after != seq || is_suppressed(seq_after) {
            if is_suppressed(seq_after) {
                last_seq = seq_after;
            }
            continue;
        }
        last_seq = seq;
        let Some(content) = content else {
            continue;
        };
        on_change(content);
    }
}

fn read_encoded(app: &AppHandle) -> Option<String> {
    if let Ok(text) = app.clipboard().read_text() {
        if !text.is_empty() {
            return limit(text);
        }
    }
    let image = app.clipboard().read_image().ok()?;
    encode_png_data_url(&image)
}

fn encode_png_data_url(image: &tauri::image::Image<'_>) -> Option<String> {
    let width = image.width();
    let height = image.height();
    if width == 0 || height == 0 {
        return None;
    }
    let buffer = image::RgbaImage::from_raw(width, height, image.rgba().to_vec())?;
    let dynamic = image::DynamicImage::ImageRgba8(buffer);
    let mut cursor = Cursor::new(Vec::new());
    dynamic.write_to(&mut cursor, image::ImageFormat::Png).ok()?;
    let encoded = B64.encode(cursor.into_inner());
    limit(format!("data:image/png;base64,{encoded}"))
}

fn write_image_bytes(app: &AppHandle, bytes: &[u8]) -> Result<(), String> {
    let decoded = image::load_from_memory(bytes).map_err(|e| e.to_string())?;
    let rgba = decoded.to_rgba8();
    let (width, height) = rgba.dimensions();
    let image = tauri::image::Image::new_owned(rgba.into_raw(), width, height);
    begin_write();
    let result = app.clipboard().write_image(&image).map_err(|e| e.to_string());
    finish_write();
    result
}

fn decode_image_data_url(content: &str) -> Result<Option<Vec<u8>>, String> {
    let Some(rest) = content.strip_prefix("data:image/") else {
        return Ok(None);
    };
    let Some((subtype, payload)) = rest.split_once(";base64,") else {
        return Ok(None);
    };
    let subtype = subtype.to_ascii_lowercase();
    if !matches!(subtype.as_str(), "png" | "jpeg" | "jpg" | "webp") {
        return Ok(None);
    }
    B64.decode(payload.trim())
        .map(Some)
        .map_err(|e| format!("Clipboard image was not valid base64: {e}"))
}

fn limit(value: String) -> Option<String> {
    if value.len() > MAX_ENCODED_CHARS {
        None
    } else {
        Some(value)
    }
}

fn begin_write() {
    WRITE_IN_PROGRESS.store(true, Ordering::SeqCst);
}

fn finish_write() {
    let seq = current_sequence();
    SUPPRESSED_SEQUENCE.store(seq, Ordering::SeqCst);
    HAS_SUPPRESSED_SEQUENCE.store(true, Ordering::SeqCst);
    WRITE_IN_PROGRESS.store(false, Ordering::SeqCst);
}

fn is_suppressed(seq: u32) -> bool {
    HAS_SUPPRESSED_SEQUENCE.load(Ordering::SeqCst)
        && SUPPRESSED_SEQUENCE.load(Ordering::SeqCst) == seq
}

#[cfg(windows)]
fn current_sequence() -> u32 {
    unsafe { windows::Win32::System::DataExchange::GetClipboardSequenceNumber() }
}

#[cfg(not(windows))]
fn current_sequence() -> u32 {
    0
}

#[cfg(test)]
mod tests {
    use super::decode_image_data_url;

    #[test]
    fn plain_text_is_not_an_image() {
        assert!(decode_image_data_url("hello").unwrap().is_none());
    }

    #[test]
    fn decodes_png_data_url() {
        let bytes = decode_image_data_url("data:image/png;base64,aGk=").unwrap();
        assert_eq!(bytes.unwrap(), b"hi");
    }
}
