export const SETTINGS_PAGES = [
  { name: "Windows Settings", uri: "ms-settings:" },
  { name: "Display", uri: "ms-settings:display" },
  { name: "Night light", uri: "ms-settings:nightlight" },
  { name: "Sound", uri: "ms-settings:sound" },
  { name: "Notifications", uri: "ms-settings:notifications" },
  { name: "Focus assist", uri: "ms-settings:quiethours" },
  { name: "Power and sleep", uri: "ms-settings:powersleep" },
  { name: "Storage", uri: "ms-settings:storagesense" },
  { name: "About", uri: "ms-settings:about" },
  { name: "Bluetooth", uri: "ms-settings:bluetooth" },
  { name: "Printers and scanners", uri: "ms-settings:printers" },
  { name: "Mouse", uri: "ms-settings:mousetouchpad" },
  { name: "Touchpad", uri: "ms-settings:devices-touchpad" },
  { name: "USB", uri: "ms-settings:usb" },
  { name: "Wi-Fi", uri: "ms-settings:network-wifi" },
  { name: "Ethernet", uri: "ms-settings:network-ethernet" },
  { name: "VPN", uri: "ms-settings:network-vpn" },
  { name: "Airplane mode", uri: "ms-settings:network-airplanemode" },
  { name: "Mobile hotspot", uri: "ms-settings:network-mobilehotspot" },
  { name: "Proxy", uri: "ms-settings:network-proxy" },
  { name: "Installed apps", uri: "ms-settings:appsfeatures" },
  { name: "Default apps", uri: "ms-settings:defaultapps" },
  { name: "Startup apps", uri: "ms-settings:startupapps" },
  { name: "Optional features", uri: "ms-settings:optionalfeatures" },
  { name: "Date and time", uri: "ms-settings:dateandtime" },
  { name: "Language and region", uri: "ms-settings:regionlanguage" },
  { name: "Windows Update", uri: "ms-settings:windowsupdate" },
  { name: "Windows Security", uri: "ms-settings:windowsdefender" },
  { name: "Backup", uri: "ms-settings:backup" },
  { name: "Recovery", uri: "ms-settings:recovery" },
  { name: "Activation", uri: "ms-settings:activation" },
  { name: "For developers", uri: "ms-settings:developers" },
  { name: "Personalization", uri: "ms-settings:personalization" },
  { name: "Background", uri: "ms-settings:personalization-background" },
  { name: "Colors", uri: "ms-settings:colors" },
  { name: "Lock screen", uri: "ms-settings:lockscreen" },
  { name: "Themes", uri: "ms-settings:themes" },
  { name: "Fonts", uri: "ms-settings:fonts" },
  { name: "Start", uri: "ms-settings:personalization-start" },
  { name: "Taskbar", uri: "ms-settings:taskbar" },
  { name: "Your info", uri: "ms-settings:yourinfo" },
  { name: "Email and accounts", uri: "ms-settings:emailandaccounts" },
  { name: "Sign-in options", uri: "ms-settings:signinoptions" },
  { name: "Game bar", uri: "ms-settings:gaming-gamebar" },
  { name: "Game mode", uri: "ms-settings:gaming-gamemode" },
  { name: "Accessibility", uri: "ms-settings:easeofaccess" },
  { name: "Multitasking", uri: "ms-settings:multitasking" },
  { name: "Clipboard", uri: "ms-settings:clipboard" },
  { name: "Remote desktop", uri: "ms-settings:remotedesktop" },
  { name: "Privacy", uri: "ms-settings:privacy" },
  { name: "Camera privacy", uri: "ms-settings:privacy-webcam" },
  { name: "Microphone privacy", uri: "ms-settings:privacy-microphone" },
  { name: "Location privacy", uri: "ms-settings:privacy-location" },
];

const POPULAR = ["Display", "Wi-Fi", "Bluetooth", "Windows Update", "About", "Sound"];

function pageResult(page, score, direct) {
  return {
    id: `settings:${page.uri}`,
    title: page.name,
    subtitle: "Open settings",
    category: "Settings",
    score,
    direct,
    action: { type: "invoke", invoke: "open-uri", target: page.uri },
  };
}

export function settingsResults(query, scoreText) {
  const raw = String(query || "").trim();
  const prefixed = raw.startsWith("$");
  const text = prefixed ? raw.slice(1).trim() : raw;
  if (!prefixed && !text) return [];

  if (prefixed && !text) {
    return POPULAR.map((name, index) => {
      const page = SETTINGS_PAGES.find((item) => item.name === name);
      return pageResult(page, 900 - index, index === 0);
    }).filter(Boolean);
  }

  const ranked = SETTINGS_PAGES.map((page) => ({
    page,
    score: scoreText(text, page.name),
  }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score);

  return ranked.slice(0, 6).map((item, index) => {
    const direct = prefixed
      ? index === 0
      : item.score >= 1000 || (item.score >= 800 && text.length >= 4 && index === 0);
    return pageResult(item.page, 1500 + item.score, direct && index === 0);
  });
}
