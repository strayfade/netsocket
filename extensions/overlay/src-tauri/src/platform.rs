#[cfg(windows)]
use std::sync::atomic::{AtomicIsize, Ordering};
#[cfg(windows)]
use windows::Win32::Foundation::HWND;
#[cfg(windows)]
use windows::Win32::UI::WindowsAndMessaging::{
    GetForegroundWindow, GetWindowLongPtrW, SetForegroundWindow, SetWindowLongPtrW, SetWindowPos,
    GWL_EXSTYLE, SWP_FRAMECHANGED, SWP_NOACTIVATE, SWP_NOMOVE, SWP_NOSIZE, SWP_NOZORDER,
    WS_EX_APPWINDOW, WS_EX_TOOLWINDOW,
};

#[cfg(windows)]
static PREVIOUS_FOREGROUND: AtomicIsize = AtomicIsize::new(0);

pub fn capture_previous_focus() {
    #[cfg(windows)]
    unsafe {
        let hwnd = GetForegroundWindow();
        PREVIOUS_FOREGROUND.store(hwnd.0 as isize, Ordering::SeqCst);
    }
}

pub fn restore_previous_focus() {
    #[cfg(windows)]
    unsafe {
        let previous = PREVIOUS_FOREGROUND.swap(0, Ordering::SeqCst);
        if previous != 0 {
            let _ = SetForegroundWindow(HWND(previous as _));
        }
    }
}

/// Mark the overlay as a tool window so browsers do not treat it as an opaque
/// occluder. Firefox and Chromium both skip `WS_EX_TOOLWINDOW` when deciding
/// whether to pause painting under a covering window — without this, a
/// fullscreen translucent WebView freezes apps like Firefox underneath.
pub fn configure_overlay_occlusion_bypass(window: &tauri::WebviewWindow) -> Result<(), String> {
    #[cfg(windows)]
    {
        let hwnd = HWND(window.hwnd().map_err(|e| e.to_string())?.0 as _);
        unsafe {
            let current = GetWindowLongPtrW(hwnd, GWL_EXSTYLE);
            let mut next = current;
            next |= WS_EX_TOOLWINDOW.0 as isize;
            // Prefer tool-window semantics over app-window for occlusion trackers.
            next &= !(WS_EX_APPWINDOW.0 as isize);
            if next != current {
                SetWindowLongPtrW(hwnd, GWL_EXSTYLE, next);
                let _ = SetWindowPos(
                    hwnd,
                    None,
                    0,
                    0,
                    0,
                    0,
                    SWP_NOMOVE | SWP_NOSIZE | SWP_NOZORDER | SWP_NOACTIVATE | SWP_FRAMECHANGED,
                );
            }
        }
        return Ok(());
    }

    #[cfg(not(windows))]
    {
        let _ = window;
        Ok(())
    }
}

const TYPE_RESPONSE_DELAY_MS: u64 = 500;

pub fn type_text(text: &str) -> Result<(), String> {
    let content = text.to_string();
    if content.is_empty() {
        return Err("Nothing to type.".to_string());
    }

    #[cfg(windows)]
    {
        std::thread::spawn(move || {
            std::thread::sleep(std::time::Duration::from_millis(TYPE_RESPONSE_DELAY_MS));
            let escaped = content.replace('\'', "''");
            let script = format!(
                "$wshell = New-Object -ComObject wscript.shell; $wshell.SendKeys('{}')",
                escaped
            );
            let _ = std::process::Command::new("powershell.exe")
                .args([
                    "-NoProfile",
                    "-WindowStyle",
                    "Hidden",
                    "-Command",
                    &script,
                ])
                .spawn();
        });
        return Ok(());
    }

    #[cfg(not(windows))]
    {
        let _ = content;
        Err("Typing is only supported on Windows.".to_string())
    }
}
