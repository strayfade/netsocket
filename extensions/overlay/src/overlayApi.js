import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";

const subscribe = async (event, handler) => {
  const window = getCurrentWindow();
  return window.listen(event, (payload) => {
    handler(payload.payload);
  });
};

export async function bindOverlayEvents(handlers) {
  const unsubs = await Promise.all([
    subscribe("overlay:show", () => handlers.onShow?.()),
    subscribe("overlay:hide-intent", () => handlers.onHideIntent?.()),
    subscribe("overlay:connection", (payload) => handlers.onConnectionState?.(payload)),
    subscribe("overlay:server-message", (payload) => handlers.onServerMessage?.(payload)),
    subscribe("overlay:hotkey-captured", (payload) => handlers.onHotkeyCaptured?.(payload)),
  ]);

  return () => {
    unsubs.forEach((unlisten) => unlisten());
  };
}

export const overlayApi = {
  getSettings: () => invoke("settings_get"),
  saveSettings: (settings) => invoke("settings_save", { nextSettings: settings }),
  startHotkeyCapture: (target) => invoke("settings_start_hotkey_capture", { target }),
  completeHotkeyCapture: (payload) =>
    invoke("settings_complete_hotkey_capture", { payload }),
  getConnectionState: () => invoke("connection_get"),
  getOverlayVisible: () => invoke("overlay_get_visible"),
  openExternal: (url) => invoke("shell_open_external", { url }),
  sendCommand: (query) => invoke("command_send", { payload: query }),
  hideNow: () => invoke("overlay_hide_now"),
  showForNotification: () => invoke("overlay_show_for_notification"),
  hideNotification: () => invoke("overlay_hide_notification"),
  clearAwaiting: () => invoke("overlay_clear_awaiting"),
  setIgnoreMouse: (ignore) => invoke("overlay_set_ignore_mouse", { ignore }),
  notifyReady: () => invoke("overlay_notify_ready"),
  bindOverlayEvents,
};

if (typeof window !== "undefined") {
  window.overlayApi = overlayApi;
}
