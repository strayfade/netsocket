#[cfg(windows)]
use std::sync::atomic::{AtomicIsize, Ordering};
#[cfg(windows)]
use windows::Win32::Foundation::HWND;
#[cfg(windows)]
use windows::Win32::UI::WindowsAndMessaging::{GetForegroundWindow, SetForegroundWindow};

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
