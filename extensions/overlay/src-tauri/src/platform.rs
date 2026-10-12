#[cfg(windows)]
use std::sync::atomic::{AtomicBool, AtomicIsize, Ordering};
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

/// Arm or release Escape-to-dismiss for the top-right alert.
///
/// The alert window is click-through and does not take focus, so a DOM listener
/// cannot see Escape while the user is in another app. Windows installs a
/// low-level keyboard hook for that case. Other platforms register a temporary
/// global shortcut.
pub fn set_notification_escape_dismiss(app: &tauri::AppHandle, enabled: bool) -> Result<(), String> {
    use tauri::Manager;

    #[cfg(windows)]
    set_windows_escape_hook(app, enabled)?;

    app.state::<crate::overlay::OverlayHandle>()
        .lock()
        .escape_dismiss_armed = enabled;

    #[cfg(not(windows))]
    if let Err(error) = crate::hotkeys::sync_escape_dismiss_shortcut(app) {
        app.state::<crate::overlay::OverlayHandle>()
            .lock()
            .escape_dismiss_armed = false;
        return Err(error);
    }

    Ok(())
}

#[cfg(windows)]
static ESCAPE_DISMISS_APP: parking_lot::Mutex<Option<tauri::AppHandle>> = parking_lot::Mutex::new(None);
#[cfg(windows)]
static ESCAPE_HOOK: AtomicIsize = AtomicIsize::new(0);
#[cfg(windows)]
static ESCAPE_DISMISS_ARMED: AtomicBool = AtomicBool::new(false);
#[cfg(windows)]
static ESCAPE_SWALLOW: AtomicBool = AtomicBool::new(false);

#[cfg(windows)]
fn set_windows_escape_hook(app: &tauri::AppHandle, enabled: bool) -> Result<(), String> {
    if !enabled {
        remove_windows_escape_hook();
        return Ok(());
    }

    *ESCAPE_DISMISS_APP.lock() = Some(app.clone());
    if ESCAPE_HOOK.load(Ordering::SeqCst) == 0 {
        let installed = unsafe {
            windows::Win32::UI::WindowsAndMessaging::SetWindowsHookExW(
                windows::Win32::UI::WindowsAndMessaging::WH_KEYBOARD_LL,
                Some(escape_dismiss_proc),
                windows::Win32::Foundation::HINSTANCE(std::ptr::null_mut()),
                0,
            )
        };
        let hook = match installed {
            Ok(hook) => hook,
            Err(error) => {
                *ESCAPE_DISMISS_APP.lock() = None;
                return Err(error.to_string());
            }
        };
        ESCAPE_HOOK.store(hook.0 as isize, Ordering::SeqCst);
    }
    ESCAPE_DISMISS_ARMED.store(true, Ordering::SeqCst);
    Ok(())
}

#[cfg(windows)]
fn remove_windows_escape_hook() {
    ESCAPE_DISMISS_ARMED.store(false, Ordering::SeqCst);
    ESCAPE_SWALLOW.store(false, Ordering::SeqCst);
    let raw = ESCAPE_HOOK.swap(0, Ordering::SeqCst);
    if raw != 0 {
        unsafe {
            let _ = windows::Win32::UI::WindowsAndMessaging::UnhookWindowsHookEx(
                windows::Win32::UI::WindowsAndMessaging::HHOOK(raw as *mut core::ffi::c_void),
            );
        }
    }
    *ESCAPE_DISMISS_APP.lock() = None;
}

#[cfg(windows)]
fn unmodified_escape(info: &windows::Win32::UI::WindowsAndMessaging::KBDLLHOOKSTRUCT) -> bool {
    use windows::Win32::UI::Input::KeyboardAndMouse::{
        GetAsyncKeyState, VK_CONTROL, VK_LWIN, VK_MENU, VK_RWIN, VK_SHIFT,
    };
    use windows::Win32::UI::WindowsAndMessaging::LLKHF_ALTDOWN;

    if info.vkCode != 0x1B || (info.flags.0 & LLKHF_ALTDOWN.0) != 0 {
        return false;
    }
    let held = |vk: windows::Win32::UI::Input::KeyboardAndMouse::VIRTUAL_KEY| unsafe {
        GetAsyncKeyState(i32::from(vk.0)) < 0
    };
    !held(VK_CONTROL) && !held(VK_SHIFT) && !held(VK_MENU) && !held(VK_LWIN) && !held(VK_RWIN)
}

#[cfg(windows)]
unsafe extern "system" fn escape_dismiss_proc(
    code: i32,
    wparam: windows::Win32::Foundation::WPARAM,
    lparam: windows::Win32::Foundation::LPARAM,
) -> windows::Win32::Foundation::LRESULT {
    use windows::Win32::Foundation::LRESULT;
    use windows::Win32::UI::WindowsAndMessaging::{
        CallNextHookEx, HHOOK, HC_ACTION, KBDLLHOOKSTRUCT, WM_KEYDOWN, WM_KEYUP, WM_SYSKEYDOWN,
        WM_SYSKEYUP,
    };

    if code == HC_ACTION as i32 && ESCAPE_DISMISS_ARMED.load(Ordering::SeqCst) {
        let message = wparam.0 as u32;
        let info = &*(lparam.0 as *const KBDLLHOOKSTRUCT);
        if unmodified_escape(info) {
            if message == WM_KEYDOWN || message == WM_SYSKEYDOWN {
                if !ESCAPE_SWALLOW.swap(true, Ordering::SeqCst) {
                    emit_escape_dismiss();
                }
                return LRESULT(1);
            }
            if message == WM_KEYUP || message == WM_SYSKEYUP {
                ESCAPE_SWALLOW.store(false, Ordering::SeqCst);
                return LRESULT(1);
            }
        }
    }

    CallNextHookEx(HHOOK::default(), code, wparam, lparam)
}

#[cfg(windows)]
fn emit_escape_dismiss() {
    use tauri::{Emitter, Manager};
    let app = ESCAPE_DISMISS_APP.lock().clone();
    let Some(app) = app else {
        return;
    };
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.emit("overlay:dismiss-notification", ());
    }
}
