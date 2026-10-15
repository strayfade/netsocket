import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { overlayApi as tauriOverlayApi } from "./overlayApi.js";
import ResponseMarkdown from "./ResponseMarkdown";
import OtpPanel from "./OtpPanel";
import HistoryPanel from "./HistoryPanel";
import {
  createSlashCommands,
  matchSlashCommand,
  unknownSlashHelp,
} from "./slashCommands.js";
import { runPaletteAction } from "./palette/actions.js";
import { evaluateExpression } from "./palette/calculator.js";
import { collectAsyncResults } from "./palette/asyncResults.js";
import { readLocalHistory, remember, writeLocalHistory } from "./palette/history.js";
import { rankPalette } from "./palette/rank.js";
import { isModeQuery } from "./palette/score.js";
import { normalizeSearchEngine } from "./palette/web.js";
import { recordReceivedAlert } from "./alertHistory.js";
import {
  AUTO_UPDATE_CHECK_INTERVAL_MS,
  shouldAutoUpdateNow,
} from "./autoUpdate.js";
import {
  DEFAULT_PREFERRED,
  computeTileRects,
  computeTileRegion,
} from "./tileLayout.js";

const HIDE_ANIMATION_MS = 180;
const PANEL_ANIMATION_MS = 180;
const FLY_IN_ANIMATION_MS = 180;
const FLY_IN_AUTO_DISMISS_MS = 12000;
const MIN_RESPONSE_TIMEOUT_SECONDS = 5;
const MAX_RESPONSE_TIMEOUT_SECONDS = 300;
const DEFAULT_RESPONSE_TIMEOUT_SECONDS = 120;

const PANEL_TITLES = {
  settings: "Settings",
  otp: "Authenticator",
  history: "Alerts",
  response: "Response",
};

const defaultSettings = {
  hotkey: "Ctrl+Shift+Space",
  copyLastResponseHotkey: "Alt+Shift+C",
  typeLastResponseHotkey: "Alt+Shift+T",
  openAtLogin: false,
  activeProfile: "production",
  responseTimeoutSeconds: DEFAULT_RESPONSE_TIMEOUT_SECONDS,
  deviceId: "",
  deviceName: "",
  animationsEnabled: true,
  autoUpdateEnabled: true,
  searchEngine: "google",
  sendClipboard: false,
  receiveClipboard: false,
  profiles: {
    production: { url: "ws://127.0.0.1:4675", secret: "" },
    development: { url: "ws://127.0.0.1:4675", secret: "" },
  },
};

const fallbackApi = {
  getSettings: async () => defaultSettings,
  saveSettings: async (next) => next,
  startHotkeyCapture: async () => ({ ok: true }),
  completeHotkeyCapture: async () => ({ ok: true }),
  getConnectionState: async () => ({ connected: false, connecting: false }),
  sendCommand: async () => ({ ok: true }),
  getOtpAccounts: async () => ({ ok: false, error: "Not connected" }),
  getRecentAlerts: async () => ({ ok: false, error: "Not connected" }),
  reorderOtpAccounts: async () => ({ ok: false, error: "Not connected" }),
  writeClipboard: async () => ({ ok: true }),
  hideNow: async () => ({ ok: true }),
  showForNotification: async () => ({ ok: true }),
  hideNotification: async () => ({ ok: true }),
  setEscapeDismiss: async () => ({ ok: true }),
  clearAwaiting: async () => ({ ok: true }),
  setIgnoreMouse: async () => ({ ok: true }),
  openExternal: async () => ({ ok: true }),
  notifyReady: () => {},
  getOverlayVisible: async () => false,
  getUpdaterStatus: async () => ({ enabled: true, state: "idle", currentVersion: "dev" }),
  checkForUpdates: async () => ({ enabled: true, state: "idle", currentVersion: "dev" }),
  bindOverlayEvents: async () => () => {},
  paletteRefresh: async () => ({ apps: [] }),
  paletteFiles: async () => [],
  paletteWindows: async () => [],
  paletteExecute: async () => ({ ok: false, error: "Palette actions need the desktop app." }),
  paletteHistoryGet: async () => readLocalHistory(),
  paletteHistoryRecord: async (entry) => writeLocalHistory(remember(readLocalHistory(), entry)),
};

const api =
  typeof window !== "undefined" && "__TAURI_INTERNALS__" in window
    ? tauriOverlayApi
    : fallbackApi;

const HOTKEY_FIELDS = [
  { key: "hotkey", label: "Global hotkey" },
  { key: "copyLastResponseHotkey", label: "Copy last response" },
  { key: "typeLastResponseHotkey", label: "Type last response" },
];

const formatHotkeyLabel = (value) => value || "Not set";

const isValidOverlayHotkey = (accelerator) => {
  const parts = accelerator.split("+").map((part) => part.trim()).filter(Boolean);
  const hasAlt = parts.some((part) => part.toLowerCase() === "alt");
  if (!hasAlt) return true;
  const hasShift = parts.some((part) => part.toLowerCase() === "shift");
  const hasCtrl = parts.some((part) => {
    const lower = part.toLowerCase();
    return lower === "control" || lower === "ctrl" || lower === "commandorcontrol";
  });
  return hasShift || hasCtrl;
};

const inputToAccelerator = (event) => {
  const parts = [];
  if (event.ctrlKey) parts.push("Control");
  if (event.altKey) parts.push("Alt");
  if (event.shiftKey) parts.push("Shift");
  if (event.metaKey) parts.push("CommandOrControl");

  let key = event.key;
  if (!key || key === "Process") return null;
  if (["Control", "Alt", "Shift", "Meta"].includes(key)) return null;

  if (key === " ") key = "Space";
  if (/^f\d{1,2}$/i.test(key)) key = key.toUpperCase();
  else if (key.length === 1) key = key.toUpperCase();

  if (parts.length === 0) return null;
  return [...parts, key].join("+");
};

const clone = (value) => JSON.parse(JSON.stringify(value));

const getResponseTimeoutMs = (seconds) => {
  const parsed = Number(seconds);
  const clamped = Number.isFinite(parsed)
    ? Math.min(MAX_RESPONSE_TIMEOUT_SECONDS, Math.max(MIN_RESPONSE_TIMEOUT_SECONDS, Math.round(parsed)))
    : DEFAULT_RESPONSE_TIMEOUT_SECONDS;
  return clamped * 1000;
};

const createConversationId = () => {
  if (crypto.randomUUID) return crypto.randomUUID();
  return `conv-${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

const createPanelId = () => {
  if (crypto.randomUUID) return crypto.randomUUID();
  return `panel-${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

const parseOverlayPayload = (broadcastData) => {
  if (typeof broadcastData === "string") {
    return { text: broadcastData, conversationId: null, deviceId: null };
  }
  if (broadcastData && typeof broadcastData === "object") {
    const deviceIdRaw = broadcastData.deviceId ?? broadcastData.device_id ?? null;
    const deviceId =
      typeof deviceIdRaw === "string" && deviceIdRaw.trim() ? deviceIdRaw.trim() : null;
    return {
      text: String(broadcastData.text ?? broadcastData.message ?? ""),
      conversationId: broadcastData.conversationId ?? null,
      deviceId,
    };
  }
  return { text: "", conversationId: null, deviceId: null };
};

const alertTargetsDevice = (localDeviceId, alertDeviceId) => {
  if (!alertDeviceId) return true;
  const local = String(localDeviceId || "").trim();
  return Boolean(local) && local === alertDeviceId;
};

const defaultPreferredFor = (kind) =>
  DEFAULT_PREFERRED[kind] || DEFAULT_PREFERRED.response;

const estimateResponsePreferred = (text) => {
  const length = String(text || "").length;
  const lines = Math.max(3, String(text || "").split("\n").length);
  const height = Math.min(640, Math.max(180, 120 + lines * 22 + Math.min(200, length / 8)));
  const width = length > 600 ? 520 : length > 200 ? 440 : 380;
  return { width, height };
};

export default function App() {
  const [phase, setPhase] = useState("hidden");
  const [query, setQuery] = useState("");
  const [sendError, setSendError] = useState("");
  const [panels, setPanels] = useState([]);
  const [focusedPanelId, setFocusedPanelId] = useState(null);
  const [otpNotice, setOtpNotice] = useState("");
  const [capturingHotkeyTarget, setCapturingHotkeyTarget] = useState(null);
  const [saveNotice, setSaveNotice] = useState("");
  const [updateStatus, setUpdateStatus] = useState(null);
  const [settings, setSettings] = useState(defaultSettings);
  const [draftSettings, setDraftSettings] = useState(defaultSettings);
  const [connection, setConnection] = useState({
    connected: false,
    connecting: false,
    lastError: "",
    url: defaultSettings.profiles.production.url,
    authStatus: "",
  });
  const [isLoading, setIsLoading] = useState(false);
  const [flyIn, setFlyIn] = useState(null);
  const [historyEpoch, setHistoryEpoch] = useState(0);
  const [viewport, setViewport] = useState({
    width: typeof window !== "undefined" ? window.innerWidth : 1280,
    height: typeof window !== "undefined" ? window.innerHeight : 720,
  });

  const closeTimeoutRef = useRef(null);
  const queryRef = useRef(null);
  const phaseRef = useRef("hidden");
  const pendingConversationRef = useRef(null);
  const cancelledConversationIdsRef = useRef(new Set());
  const responseTimeoutRef = useRef(null);
  const flyInTimeoutRef = useRef(null);
  const flyInDismissTimeoutRef = useRef(null);
  const flyInShowIdRef = useRef(0);
  const flyInRef = useRef(null);
  const dismissFlyInRef = useRef(async () => {});
  const capturingHotkeyTargetRef = useRef(null);
  flyInRef.current = flyIn;
  capturingHotkeyTargetRef.current = capturingHotkeyTarget;
  const lastServerNotificationTextRef = useRef(null);
  const noteReceivedAlertRef = useRef(() => {});
  noteReceivedAlertRef.current = (text) => {
    recordReceivedAlert({ text, ts: Date.now() });
    setHistoryEpoch((epoch) => epoch + 1);
  };
  const settingsRef = useRef(defaultSettings);
  const panelsRef = useRef([]);
  const lastRectsRef = useRef(new Map());
  const leaveTimeoutsRef = useRef(new Map());
  const settingsHydratedRef = useRef(false);
  const settingsSaveTimeoutRef = useRef(null);
  const settingsSaveGenRef = useRef(0);
  const animationsEnabledRef = useRef(true);
  const suggestionTouchedRef = useRef(false);

  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  useEffect(() => {
    animationsEnabledRef.current = draftSettings.animationsEnabled !== false;
  }, [draftSettings.animationsEnabled]);

  const motionMs = useCallback((duration) => {
    return animationsEnabledRef.current ? duration : 0;
  }, []);

  useEffect(() => {
    if (!settingsHydratedRef.current) return;
    if (JSON.stringify(draftSettings) === JSON.stringify(settings)) return;

    if (settingsSaveTimeoutRef.current) {
      clearTimeout(settingsSaveTimeoutRef.current);
    }

    const gen = ++settingsSaveGenRef.current;
    settingsSaveTimeoutRef.current = setTimeout(async () => {
      const snapshot = draftSettings;
      const saved = await api.saveSettings(snapshot);
      if (gen !== settingsSaveGenRef.current) return;
      setSettings(saved);
      setDraftSettings((current) =>
        JSON.stringify(current) === JSON.stringify(snapshot) ? clone(saved) : current
      );
      setSaveNotice("Saved");
      setTimeout(() => {
        setSaveNotice((prev) => (prev === "Saved" ? "" : prev));
      }, 1200);
    }, 350);

    return () => {
      if (settingsSaveTimeoutRef.current) {
        clearTimeout(settingsSaveTimeoutRef.current);
        settingsSaveTimeoutRef.current = null;
      }
    };
  }, [draftSettings, settings]);

  useEffect(() => {
    panelsRef.current = panels;
  }, [panels]);

  useEffect(() => {
    return () => {
      for (const timeoutId of leaveTimeoutsRef.current.values()) {
        clearTimeout(timeoutId);
      }
      leaveTimeoutsRef.current.clear();
    };
  }, []);

  const isOverlayOpen = () => {
    const current = phaseRef.current;
    return current === "shown" || current === "showing";
  };

  const activePanels = useMemo(
    () => panels.filter((panel) => panel.phase !== "leaving"),
    [panels]
  );
  // Keep session chrome while leave animations are still on screen.
  const hasPanels = panels.length > 0;

  const resizeQueryInput = () => {
    const el = queryRef.current;
    if (!el) return;
    el.style.height = "auto";
    const maxHeight = window.innerHeight * 0.5;
    const nextHeight = Math.min(el.scrollHeight, maxHeight);
    el.style.height = `${nextHeight}px`;
    el.style.borderRadius = `${nextHeight / 2}px`;
    el.style.overflowY = el.scrollHeight > maxHeight ? "auto" : "hidden";
  };

  const activeProfile = draftSettings.activeProfile;
  const isDisconnected = !connection.connected;
  const activeProfileConfig = draftSettings.profiles[activeProfile] || {};

  const clearResponseTimeout = () => {
    if (responseTimeoutRef.current) {
      clearTimeout(responseTimeoutRef.current);
      responseTimeoutRef.current = null;
    }
  };

  const storeServerNotificationText = (text) => {
    lastServerNotificationTextRef.current = text;
  };

  const clearAwaiting = () => {
    api.clearAwaiting?.();
  };

  const clearFlyInTimeouts = () => {
    if (flyInTimeoutRef.current) {
      clearTimeout(flyInTimeoutRef.current);
      flyInTimeoutRef.current = null;
    }
    if (flyInDismissTimeoutRef.current) {
      clearTimeout(flyInDismissTimeoutRef.current);
      flyInDismissTimeoutRef.current = null;
    }
  };

  const focusPanel = useCallback((panelId) => {
    // Only update focus/z-index — do not reorder panels (that would retile under the cursor).
    setFocusedPanelId(panelId);
  }, []);

  const removePanelNow = useCallback((panelId) => {
    lastRectsRef.current.delete(panelId);
    const leaveTimeout = leaveTimeoutsRef.current.get(panelId);
    if (leaveTimeout) {
      clearTimeout(leaveTimeout);
      leaveTimeoutsRef.current.delete(panelId);
    }

    setPanels((prev) => prev.filter((panel) => panel.id !== panelId));
    setFocusedPanelId((focused) => {
      if (focused && focused !== panelId) return focused;
      const remaining = panelsRef.current.filter(
        (panel) => panel.id !== panelId && panel.phase !== "leaving"
      );
      return remaining.length ? remaining[remaining.length - 1].id : null;
    });
  }, []);

  const dismissPanel = useCallback((panelId) => {
    const panel = panelsRef.current.find((item) => item.id === panelId);
    if (!panel || panel.phase === "leaving") return;

    const exitRect = lastRectsRef.current.get(panelId) || null;
    setPanels((prev) =>
      prev.map((item) =>
        item.id === panelId ? { ...item, phase: "leaving", exitRect } : item
      )
    );
    setFocusedPanelId((focused) => {
      if (focused && focused !== panelId) return focused;
      const remaining = panelsRef.current.filter(
        (item) => item.id !== panelId && item.phase !== "leaving"
      );
      return remaining.length ? remaining[remaining.length - 1].id : null;
    });

    const timeoutId = setTimeout(() => {
      removePanelNow(panelId);
    }, motionMs(PANEL_ANIMATION_MS));
    leaveTimeoutsRef.current.set(panelId, timeoutId);
  }, [removePanelNow, motionMs]);

  const closeAllPanels = useCallback(() => {
    setCapturingHotkeyTarget(null);

    const current = panelsRef.current;
    if (!current.length) {
      setFocusedPanelId(null);
      return;
    }

    const alreadyLeaving = current.every((panel) => panel.phase === "leaving");
    if (alreadyLeaving) return;

    setPanels((prev) =>
      prev.map((panel) => ({
        ...panel,
        phase: "leaving",
        exitRect: lastRectsRef.current.get(panel.id) || panel.exitRect || null,
      }))
    );
    setFocusedPanelId(null);

    for (const panel of current) {
      if (panel.phase === "leaving") continue;
      const existing = leaveTimeoutsRef.current.get(panel.id);
      if (existing) clearTimeout(existing);
      const timeoutId = setTimeout(() => {
        removePanelNow(panel.id);
      }, motionMs(PANEL_ANIMATION_MS));
      leaveTimeoutsRef.current.set(panel.id, timeoutId);
    }
  }, [removePanelNow, motionMs]);

  const clearPanels = useCallback(() => {
    setOtpNotice("");
    setSaveNotice("");
    setQuery("");
    setSendError("");
    requestAnimationFrame(resizeQueryInput);
    closeAllPanels();
  }, [closeAllPanels]);

  const appendResponsePanel = useCallback((text, { conversationId = null, title = "Response" } = {}) => {
    clearResponseTimeout();
    clearAwaiting();
    setIsLoading(false);
    pendingConversationRef.current = null;

    const id = createPanelId();
    const panel = {
      id,
      kind: "response",
      title,
      text,
      conversationId,
      preferred: estimateResponsePreferred(text),
      phase: "entering",
    };
    setPanels((prev) => [...prev, panel]);
    setFocusedPanelId(id);
    setTimeout(() => {
      setPanels((prev) =>
        prev.map((item) =>
          item.id === id && item.phase === "entering"
            ? { ...item, phase: "shown" }
            : item
        )
      );
    }, 16);
  }, []);

  const openSingletonPanel = useCallback((kind, title) => {
    setQuery("");
    setSendError("");
    setCapturingHotkeyTarget(null);

    const existing = panelsRef.current.find(
      (panel) => panel.kind === kind && panel.phase !== "leaving"
    );
    if (existing) {
      // Focus only — keep tile order stable so the layout does not jump.
      setFocusedPanelId(existing.id);
      return;
    }

    const id = createPanelId();
    setFocusedPanelId(id);
    setPanels((prev) => [
      ...prev,
      {
        id,
        kind,
        title,
        preferred: { ...defaultPreferredFor(kind) },
        phase: "entering",
      },
    ]);

    setTimeout(() => {
      setPanels((prev) =>
        prev.map((item) =>
          item.id === id && item.phase === "entering"
            ? { ...item, phase: "shown" }
            : item
        )
      );
    }, 16);
  }, []);

  const openOtp = useCallback(() => {
    openSingletonPanel("otp", PANEL_TITLES.otp);
  }, [openSingletonPanel]);

  const openSettings = useCallback(() => {
    openSingletonPanel("settings", PANEL_TITLES.settings);
  }, [openSingletonPanel]);

  const openHistory = useCallback(() => {
    setHistoryEpoch((epoch) => epoch + 1);
    openSingletonPanel("history", PANEL_TITLES.history);
  }, [openSingletonPanel]);

  const showResponse = useCallback(
    (text) => {
      appendResponsePanel(text, { title: "Response" });
    },
    [appendResponsePanel]
  );

  const cancelQuery = useCallback(() => {
    const pendingId = pendingConversationRef.current;
    if (pendingId) cancelledConversationIdsRef.current.add(pendingId);
    pendingConversationRef.current = null;
    clearResponseTimeout();
    setIsLoading(false);
    setSendError("");
    clearAwaiting();
    if (!isOverlayOpen()) {
      api.hideNotification?.();
    }
    requestAnimationFrame(() => {
      resizeQueryInput();
      queryRef.current?.focus();
    });
  }, []);

  const slashCommands = useMemo(
    () =>
      createSlashCommands({
        openSettings,
        openOtp,
        openHistory,
        clearPanels,
        cancelQuery,
      }),
    [openSettings, openOtp, openHistory, clearPanels, cancelQuery]
  );

  const [suggestionIndex, setSuggestionIndex] = useState(0);
  const [suggestSuppressed, setSuggestSuppressed] = useState(false);
  const [pinnedSuggestions, setPinnedSuggestions] = useState([]);
  const [suggestQuery, setSuggestQuery] = useState(query);
  const [paletteApps, setPaletteApps] = useState([]);
  const [paletteWindows, setPaletteWindows] = useState([]);
  const [paletteFiles, setPaletteFiles] = useState([]);
  const [paletteExtras, setPaletteExtras] = useState([]);
  const [paletteHistory, setPaletteHistory] = useState([]);
  const [confirmId, setConfirmId] = useState(null);

  const preview = useMemo(
    () =>
      rankPalette({
        query,
        searchEngine: settings.searchEngine,
        history: paletteHistory,
        apps: paletteApps,
        windows: paletteWindows,
        files: paletteFiles,
        extras: paletteExtras,
        slashCommands,
      }),
    [
      query,
      settings.searchEngine,
      paletteHistory,
      paletteApps,
      paletteWindows,
      paletteFiles,
      paletteExtras,
      slashCommands,
    ]
  );

  if (query !== suggestQuery) {
    setSuggestQuery(query);
    setSuggestSuppressed(false);
    setConfirmId(null);
    suggestionTouchedRef.current = false;
    setSuggestionIndex(preview.index < 0 ? 0 : preview.index);
  }

  const liveResults = suggestSuppressed ? [] : preview.results;

  if (liveResults.length > 0 && pinnedSuggestions !== liveResults) {
    setPinnedSuggestions(liveResults);
  }

  const suggestOpen = liveResults.length > 0;
  const activeSuggestionIndex = suggestOpen
    ? Math.min(Math.max(suggestionIndex, 0), liveResults.length - 1)
    : -1;

  useEffect(() => {
    if (suggestionTouchedRef.current) return;
    if (preview.index >= 0) setSuggestionIndex(preview.index);
  }, [preview.index, query, paletteExtras, paletteFiles]);

  useEffect(() => {
    if (phase !== "shown" && phase !== "showing") return undefined;
    let cancelled = false;
    (async () => {
      const [snapshot, openWindows, history] = await Promise.all([
        api.paletteRefresh?.().catch(() => null),
        api.paletteWindows?.().catch(() => null),
        api.paletteHistoryGet?.().catch(() => null),
      ]);
      if (cancelled) return;
      if (Array.isArray(snapshot?.apps)) setPaletteApps(snapshot.apps);
      if (Array.isArray(openWindows)) setPaletteWindows(openWindows);
      if (Array.isArray(history)) setPaletteHistory(history);
    })();
    return () => {
      cancelled = true;
    };
  }, [phase]);

  useEffect(() => {
    const text = query.trim();
    if (text.length < 2 || text.includes("\n") || isModeQuery(text) || evaluateExpression(text)) {
      setPaletteFiles([]);
      return undefined;
    }
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const found = await api.paletteFiles?.(text);
        if (!cancelled) setPaletteFiles(Array.isArray(found) ? found : []);
      } catch {
        if (!cancelled) setPaletteFiles([]);
      }
    }, 80);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query]);

  useEffect(() => {
    let cancelled = false;
    setPaletteExtras([]);
    const timer = setTimeout(async () => {
      const extras = await collectAsyncResults(query);
      if (!cancelled) setPaletteExtras(extras);
    }, 80);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query]);

  useEffect(() => {
    if (!suggestOpen || activeSuggestionIndex < 0) return;
    document.getElementById(`command-suggest-${activeSuggestionIndex}`)?.scrollIntoView({
      block: "nearest",
    });
  }, [suggestOpen, activeSuggestionIndex, pinnedSuggestions]);

  const dismissFlyIn = async () => {
    const current = flyInRef.current;
    if (!current || current.phase === "leaving") return;
    flyInRef.current = { ...current, phase: "leaving" };
    clearFlyInTimeouts();
    clearAwaiting();
    setFlyIn({ ...current, phase: "leaving" });
    flyInDismissTimeoutRef.current = setTimeout(async () => {
      setFlyIn(null);
      if (!isOverlayOpen()) {
        await api.hideNotification?.();
      } else {
        await api.setIgnoreMouse?.(false);
      }
    }, motionMs(FLY_IN_ANIMATION_MS));
  };
  dismissFlyInRef.current = dismissFlyIn;

  const showFlyInNotification = async (text) => {
    clearResponseTimeout();
    pendingConversationRef.current = null;
    setIsLoading(false);
    clearAwaiting();
    clearFlyInTimeouts();
    const showId = ++flyInShowIdRef.current;
    const nextFlyIn = { text, phase: "entering" };
    flyInRef.current = nextFlyIn;
    setFlyIn(nextFlyIn);
    await api.showForNotification?.();
    if (showId !== flyInShowIdRef.current || flyInRef.current?.phase === "leaving") return;
    setTimeout(() => {
      if (showId !== flyInShowIdRef.current) return;
      setFlyIn((prev) =>
        prev && prev.phase === "entering" ? { ...prev, phase: "visible" } : prev
      );
    }, 16);
    flyInTimeoutRef.current = setTimeout(() => {
      if (showId !== flyInShowIdRef.current) return;
      dismissFlyIn();
    }, FLY_IN_AUTO_DISMISS_MS);
  };

  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  const startClose = useCallback(async () => {
    if (phaseRef.current === "hidden" || phaseRef.current === "hiding") return;
    closeAllPanels();
    setPhase("hiding");
    closeTimeoutRef.current = setTimeout(async () => {
      setCapturingHotkeyTarget(null);
      setOtpNotice("");
      setSaveNotice("");
      setPhase("hidden");
      await api.hideNow();
    }, motionMs(HIDE_ANIMATION_MS));
  }, [motionMs, closeAllPanels]);

  const handleShow = useCallback(() => {
    if (closeTimeoutRef.current) {
      clearTimeout(closeTimeoutRef.current);
      closeTimeoutRef.current = null;
    }
    flyInShowIdRef.current += 1;
    flyInRef.current = null;
    clearFlyInTimeouts();
    setFlyIn(null);
    setPhase("showing");
    setSendError("");
    setOtpNotice("");
    api.getConnectionState?.().then((state) => {
      if (state) setConnection((prev) => ({ ...prev, ...state }));
    });
    setTimeout(() => setPhase("shown"), 16);
  }, []);

  const syncInteractiveState = useCallback(async () => {
    const visible = await api.getOverlayVisible?.();
    if (visible && phaseRef.current === "hidden") {
      handleShow();
    }
  }, [handleShow]);

  useEffect(() => {
    let cancelled = false;
    let unbindEvents = () => {};
    let unlistenFocus = () => {};

    const init = async () => {
      const unbind = await api.bindOverlayEvents({
        onShow: handleShow,
        onHideIntent: startClose,
        onConnectionState: (nextState) => {
          setConnection((prev) => ({ ...prev, ...nextState }));
        },
        onServerMessage: (payload) => {
          if (payload?.broadcastPurpose !== "overlay") return;

          const { text, conversationId, deviceId } = parseOverlayPayload(payload.broadcastData);
          if (!text) return;

          if (conversationId && cancelledConversationIdsRef.current.has(conversationId)) {
            cancelledConversationIdsRef.current.delete(conversationId);
            return;
          }

          const pendingId = pendingConversationRef.current;
          const isPendingReply = Boolean(
            conversationId && pendingId && conversationId === pendingId
          );
          if (!isPendingReply && !alertTargetsDevice(settingsRef.current?.deviceId, deviceId)) {
            return;
          }
          if (conversationId && pendingId && conversationId !== pendingId) return;

          storeServerNotificationText(text);

          if (!conversationId) {
            noteReceivedAlertRef.current(text);
          }

          if (isOverlayOpen()) {
            showResponse(text);
            return;
          }

          showFlyInNotification(text);
        },
        onDismissNotification: () => {
          dismissFlyInRef.current();
        },
        onUpdateStatus: (status) => {
          if (status) setUpdateStatus(status);
        },
        onHotkeyCaptured: (result) => {
          setCapturingHotkeyTarget(null);
          if (result?.cancelled) return;
          if (result?.ok && result.hotkey && result.target) {
            setDraftSettings((prev) => ({ ...prev, [result.target]: result.hotkey }));
            setSaveNotice(`Hotkey set to ${result.hotkey}`);
            setTimeout(() => setSaveNotice(""), 1800);
            return;
          }
          setSaveNotice(result?.error || "Hotkey unavailable");
          setTimeout(() => setSaveNotice(""), 1800);
        },
      });
      if (cancelled) {
        unbind();
        return;
      }
      unbindEvents = unbind;

      try {
        const unlisten = await getCurrentWindow().onFocusChanged(({ payload: focused }) => {
          if (focused) syncInteractiveState();
        });
        if (cancelled) {
          unlisten();
          return;
        }
        unlistenFocus = unlisten;
      } catch {
        // Browser preview fallback.
      }

      const loaded = await api.getSettings();
      if (cancelled) return;
      const safe = loaded || defaultSettings;
      settingsHydratedRef.current = false;
      setSettings(safe);
      setDraftSettings(clone(safe));
      // Defer so the draft sync does not trigger an autosave write-back.
      requestAnimationFrame(() => {
        settingsHydratedRef.current = true;
      });

      await api.notifyReady?.();
      if (cancelled) return;
      try {
        const status = await api.getUpdaterStatus?.();
        if (!cancelled && status) setUpdateStatus(status);
      } catch {
        // Updater status is best-effort in browser preview.
      }
      if (cancelled) return;
      await syncInteractiveState();
    };

    init();

    return () => {
      cancelled = true;
      if (closeTimeoutRef.current) clearTimeout(closeTimeoutRef.current);
      clearResponseTimeout();
      clearFlyInTimeouts();
      unbindEvents();
      unlistenFocus();
    };
  }, [handleShow, startClose, syncInteractiveState, showResponse]);

  useEffect(() => {
    if (phase === "shown" && queryRef.current && !capturingHotkeyTarget) {
      queryRef.current.focus();
      queryRef.current.setSelectionRange(query.length, query.length);
    }
    if (phase === "showing" || phase === "shown") {
      requestAnimationFrame(resizeQueryInput);
    }
  }, [phase, query.length, hasPanels, capturingHotkeyTarget, isLoading]);

  useEffect(() => {
    resizeQueryInput();
    const onResize = () => {
      resizeQueryInput();
      setViewport({ width: window.innerWidth, height: window.innerHeight });
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [query]);

  useEffect(() => {
    if (!capturingHotkeyTarget) return undefined;

    const onKeyDown = async (event) => {
      event.preventDefault();
      event.stopPropagation();

      if (event.key === "Escape") {
        await api.completeHotkeyCapture?.({
          target: capturingHotkeyTarget,
          cancelled: true,
        });
        return;
      }

      const accelerator = inputToAccelerator(event);
      if (!accelerator) return;

      if (capturingHotkeyTarget === "hotkey" && !isValidOverlayHotkey(accelerator)) {
        setSaveNotice("Show/hide hotkey cannot use Alt without Shift or Control.");
        setTimeout(() => setSaveNotice(""), 2200);
        return;
      }

      await api.completeHotkeyCapture?.({
        target: capturingHotkeyTarget,
        hotkey: accelerator,
        cancelled: false,
      });
    };

    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [capturingHotkeyTarget]);

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key !== "Escape" || event.repeat) return;
      const current = flyInRef.current;
      if (!current || current.phase === "leaving") return;
      if (capturingHotkeyTargetRef.current) return;
      event.preventDefault();
      event.stopPropagation();
      dismissFlyInRef.current();
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, []);

  useEffect(() => {
    const enabled = Boolean(flyIn && flyIn.phase !== "leaving");
    api.setEscapeDismiss?.(enabled)?.catch?.(() => {});
  }, [flyIn]);

  useEffect(() => {
    return () => {
      api.setEscapeDismiss?.(false)?.catch?.(() => {});
    };
  }, []);

  // Silent overnight self-updates: the check only runs while the overlay
  // is fully hidden with nothing pending, inside the 01:00–05:00 window.
  // The native side downloads, verifies, and reinstalls without prompts.
  useEffect(() => {
    let cancelled = false;
    let running = false;
    const tick = async () => {
      if (cancelled || running) return;
      if (!settingsHydratedRef.current) return;
      const enabled = settingsRef.current?.autoUpdateEnabled !== false;
      const awaitingResponse =
        pendingConversationRef.current != null || flyInRef.current != null;
      if (!shouldAutoUpdateNow({ enabled, phase: phaseRef.current, awaitingResponse })) {
        return;
      }
      running = true;
      try {
        const status = await api.checkForUpdates?.(true);
        if (!cancelled && status) setUpdateStatus(status);
      } catch {
        // Best-effort: the next tick retries.
      } finally {
        running = false;
      }
    };
    const timer = setInterval(tick, AUTO_UPDATE_CHECK_INTERVAL_MS);
    const initial = setTimeout(tick, 60 * 1000);
    return () => {
      cancelled = true;
      clearInterval(timer);
      clearTimeout(initial);
    };
  }, []);

  const sendQuery = async (overrideText) => {
    const text = String(overrideText ?? query).trim();
    if (!text.length) {
      setSendError("");
      startClose();
      return;
    }

    if (text.startsWith("/")) {
      const matched = matchSlashCommand(text, slashCommands);
      if (matched) {
        matched.run({ commands: slashCommands });
        setQuery("");
        requestAnimationFrame(resizeQueryInput);
        return;
      }
      setSendError(unknownSlashHelp(slashCommands));
      return;
    }

    const conversationId = createConversationId();
    const previousId = pendingConversationRef.current;
    if (previousId && previousId !== conversationId) {
      cancelledConversationIdsRef.current.add(previousId);
    }
    pendingConversationRef.current = conversationId;
    setIsLoading(true);
    setSendError("");
    clearResponseTimeout();
    responseTimeoutRef.current = setTimeout(() => {
      if (pendingConversationRef.current === conversationId) {
        pendingConversationRef.current = null;
        setIsLoading(false);
        clearAwaiting();
        if (!isOverlayOpen()) {
          api.hideNotification?.();
        }
        setSendError("Timed out waiting for a response.");
      }
    }, getResponseTimeoutMs(settings.responseTimeoutSeconds));

    const result = await api.sendCommand({ command: text, conversationId });
    if (!result?.ok) {
      clearResponseTimeout();
      pendingConversationRef.current = null;
      setIsLoading(false);
      setSendError(result?.error || "Failed to send query.");
      return;
    }

    setQuery("");
    requestAnimationFrame(resizeQueryInput);
  };

  const activateResult = async (result) => {
    if (!result) {
      await sendQuery();
      return;
    }
    if (result.confirm && confirmId !== result.id) {
      setConfirmId(result.id);
      setOtpNotice(result.subtitle || "Press Enter again to confirm.");
      return;
    }
    setConfirmId(null);
    await runPaletteAction(result, {
      query,
      confirmed: Boolean(result.confirm),
      writeClipboard: (text) => api.writeClipboard(text),
      openExternal: (url) => api.openExternal(url),
      execute: (payload) => api.paletteExecute(payload),
      runSlash: (name) => {
        const matched = matchSlashCommand(name, slashCommands);
        matched?.run({ commands: slashCommands });
        setQuery("");
        requestAnimationFrame(resizeQueryInput);
      },
      ask: (text) => sendQuery(text),
      notice: (text) => {
        setSendError("");
        setOtpNotice(text);
        setTimeout(() => {
          setOtpNotice((prev) => (prev === text ? "" : prev));
        }, 1600);
      },
      hide: async () => {
        await api.hideNow?.();
        await startClose();
      },
      record: async (entry) => {
        setPaletteHistory((prev) => remember(prev, entry));
        try {
          const saved = await api.paletteHistoryRecord?.(entry);
          if (Array.isArray(saved)) setPaletteHistory(saved);
        } catch {
          // The in-memory list is already updated.
        }
      },
    });
  };

  const onCommandKeyDown = async (event) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      if (!suggestOpen || event.altKey || event.ctrlKey || event.metaKey) return;
      event.preventDefault();
      suggestionTouchedRef.current = true;
      const last = liveResults.length - 1;
      setSuggestionIndex((current) => {
        const currentIndex = current < 0 ? 0 : current;
        if (event.key === "ArrowDown") {
          if (currentIndex >= last) return last;
          return currentIndex + 1;
        }
        if (currentIndex <= 0) return 0;
        return currentIndex - 1;
      });
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      if (capturingHotkeyTarget) return;

      if (suggestOpen) {
        setSuggestSuppressed(true);
        setSuggestionIndex(0);
        setConfirmId(null);
        return;
      }

      if (panelsRef.current.length > 0) {
        const latest =
          panelsRef.current.find(
            (panel) => panel.id === focusedPanelId && panel.phase !== "leaving"
          ) ||
          [...panelsRef.current].reverse().find((panel) => panel.phase !== "leaving");
        if (latest) {
          if (latest.kind === "settings") {
            setCapturingHotkeyTarget(null);
          }
          dismissPanel(latest.id);
          return;
        }
      }
      startClose();
      return;
    }

    if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      const el = event.currentTarget;
      const start = el.selectionStart;
      const end = el.selectionEnd;
      const next = `${query.slice(0, start)}\n${query.slice(end)}`;
      setQuery(next);
      requestAnimationFrame(() => {
        el.selectionStart = el.selectionEnd = start + 1;
        resizeQueryInput();
      });
      return;
    }

    if (event.key === "Enter") {
      event.preventDefault();
      const selected =
        activeSuggestionIndex >= 0 ? liveResults[activeSuggestionIndex] : null;
      if (selected) {
        await activateResult(selected);
        return;
      }
      await sendQuery();
    }
  };

  const updateProfileField = (field, value) => {
    setDraftSettings((prev) => ({
      ...prev,
      profiles: {
        ...prev.profiles,
        [activeProfile]: {
          ...prev.profiles[activeProfile],
          [field]: value,
        },
      },
    }));
  };

  const startHotkeyCapture = async (target) => {
    setCapturingHotkeyTarget(target);
    setSaveNotice("");
    await api.startHotkeyCapture?.(target);
  };

  const checkUpdatesManually = async () => {
    setSaveNotice("Checking for updates…");
    try {
      const status = await api.checkForUpdates?.(false);
      if (status) {
        setUpdateStatus(status);
        setSaveNotice(status.message || `Update status: ${status.state}`);
      } else {
        setSaveNotice("");
      }
    } catch {
      setSaveNotice("Update check failed.");
    }
    setTimeout(() => setSaveNotice(""), 2200);
  };

  const openResponseLink = async (url) => {
    await api.openExternal?.(url);
  };

  const tileRegion = useMemo(
    () => computeTileRegion(viewport.width, viewport.height),
    [viewport.width, viewport.height]
  );

  const tileRects = useMemo(
    () => computeTileRects(activePanels, tileRegion),
    [activePanels, tileRegion]
  );

  const rectById = useMemo(() => {
    const map = new Map();
    for (const rect of tileRects) {
      map.set(rect.panelId, rect);
      lastRectsRef.current.set(rect.panelId, rect);
    }
    return map;
  }, [tileRects]);

  const workspaceClassName = [
    "overlay-workspace",
    hasPanels ? "session" : "idle",
  ].join(" ");

  const renderSettingsBody = () => {
    const deviceId = settings.deviceId || draftSettings.deviceId || "";
    return (
      <div className="settings-form">
        <section className="settings-field">
          <label className="settings-field-label" htmlFor="settings-ws-url">
            Websocket URL
          </label>
          <p className="settings-desc">
            Connects with a device keypair. Approve this overlay in the dashboard under Settings →
            Devices.
          </p>
          <input
            id="settings-ws-url"
            className="settings-input"
            value={activeProfileConfig.url || ""}
            onChange={(event) => updateProfileField("url", event.target.value)}
            placeholder="ws://127.0.0.1:4675"
            autoComplete="off"
            spellCheck={false}
          />
          {connection.authStatus === "pending" ? (
            <p className="settings-status">
              Waiting for approval — open Settings → Devices in the web dashboard.
            </p>
          ) : null}
          {connection.authStatus === "denied" ? (
            <p className="settings-status settings-status--error">
              This device was denied. Ask an admin to re-approve it.
            </p>
          ) : null}
          {connection.lastError && isDisconnected ? (
            <p className="settings-status settings-status--error">{connection.lastError}</p>
          ) : null}
        </section>

        <section className="settings-field">
          <div className="settings-field-label">Hotkeys</div>
          <div className="settings-hotkeys">
            {HOTKEY_FIELDS.map(({ key, label }) => (
              <div key={key} className="settings-hotkey-row">
                <span className="settings-hotkey-label">{label}</span>
                <button
                  type="button"
                  className={`hotkey-capture ${capturingHotkeyTarget === key ? "capturing" : ""}`}
                  onClick={() => startHotkeyCapture(key)}
                  disabled={capturingHotkeyTarget !== null && capturingHotkeyTarget !== key}
                >
                  {capturingHotkeyTarget === key
                    ? "Press keys..."
                    : formatHotkeyLabel(draftSettings[key])}
                </button>
              </div>
            ))}
          </div>
        </section>

        <section className="settings-field settings-field--inline">
          <div className="settings-field-copy">
            <div className="settings-field-label">Open on startup</div>
            <p className="settings-desc">Launch the overlay when you sign in.</p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={draftSettings.openAtLogin}
            aria-label="Open overlay on startup"
            className={`toggle-switch ${draftSettings.openAtLogin ? "on" : ""}`}
            onClick={() =>
              setDraftSettings((prev) => ({
                ...prev,
                openAtLogin: !prev.openAtLogin,
              }))
            }
          >
            <span className="toggle-thumb" />
          </button>
        </section>

        <section className="settings-field settings-field--inline">
          <div className="settings-field-copy">
            <div className="settings-field-label">Animations</div>
            <p className="settings-desc">Motion when opening, closing, and rearranging panels.</p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={draftSettings.animationsEnabled !== false}
            aria-label="Enable animations"
            className={`toggle-switch ${draftSettings.animationsEnabled !== false ? "on" : ""}`}
            onClick={() =>
              setDraftSettings((prev) => ({
                ...prev,
                animationsEnabled: prev.animationsEnabled === false,
              }))
            }
          >
            <span className="toggle-thumb" />
          </button>
        </section>

        <section className="settings-field settings-field--inline">
          <div className="settings-field-copy">
            <div className="settings-field-label">Automatic updates</div>
            <p className="settings-desc">
              Installs quietly overnight when the overlay is idle. Current version:{" "}
              {updateStatus?.currentVersion || "unknown"}
              {updateStatus?.latestVersion ? ` — latest: ${updateStatus.latestVersion}` : ""}
            </p>
            {updateStatus?.message ? (
              <p
                className={`settings-status${updateStatus.state === "error" ? " settings-status--error" : ""}`}
              >
                {updateStatus.message}
              </p>
            ) : null}
            <button
              type="button"
              className="settings-link-button"
              onClick={checkUpdatesManually}
            >
              Check now
            </button>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={draftSettings.autoUpdateEnabled !== false}
            aria-label="Enable automatic updates"
            className={`toggle-switch ${draftSettings.autoUpdateEnabled !== false ? "on" : ""}`}
            onClick={() =>
              setDraftSettings((prev) => ({
                ...prev,
                autoUpdateEnabled: prev.autoUpdateEnabled === false,
              }))
            }
          >
            <span className="toggle-thumb" />
          </button>
        </section>

        <section className="settings-field settings-field--inline">
          <div className="settings-field-copy">
            <div className="settings-field-label">Send Clipboard</div>
            <p className="settings-desc">
              When you copy text or an image, send it to netsocket.
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={draftSettings.sendClipboard === true}
            aria-label="Send clipboard"
            className={`toggle-switch ${draftSettings.sendClipboard ? "on" : ""}`}
            onClick={() =>
              setDraftSettings((prev) => ({
                ...prev,
                sendClipboard: !prev.sendClipboard,
              }))
            }
          >
            <span className="toggle-thumb" />
          </button>
        </section>

        <section className="settings-field settings-field--inline">
          <div className="settings-field-copy">
            <div className="settings-field-label">Receive Clipboard</div>
            <p className="settings-desc">Allow netsocket to update this device&apos;s clipboard.</p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={draftSettings.receiveClipboard === true}
            aria-label="Receive clipboard"
            className={`toggle-switch ${draftSettings.receiveClipboard ? "on" : ""}`}
            onClick={() =>
              setDraftSettings((prev) => ({
                ...prev,
                receiveClipboard: !prev.receiveClipboard,
              }))
            }
          >
            <span className="toggle-thumb" />
          </button>
        </section>

        <section className="settings-field">
          <label className="settings-field-label" htmlFor="settings-device-name">
            Device name
          </label>
          <p className="settings-desc">
            Shown in the dashboard Devices list. A blank name uses Desktop overlay and the active
            profile. Pairing and alert routing use the device ID below.
          </p>
          <input
            id="settings-device-name"
            className="settings-input"
            value={draftSettings.deviceName || ""}
            maxLength={120}
            onChange={(event) =>
              setDraftSettings((prev) => ({
                ...prev,
                deviceName: event.target.value,
              }))
            }
            placeholder="Desktop overlay"
            autoComplete="off"
            spellCheck={false}
          />
        </section>

        <section className="settings-field">
          <div className="settings-field-label">Device ID</div>
          <p className="settings-desc">
            Stable identifier for pairing and alert routing. Approve it in the dashboard under
            Settings → Devices.
          </p>
          <div className="settings-readonly" title="Stable identifier used for pairing and alert routing">
            {deviceId || "Not assigned yet"}
          </div>
        </section>

        <section className="settings-field">
          <label className="settings-field-label" htmlFor="settings-search-engine">
            Web search
          </label>
          <p className="settings-desc">Used by the Search the web result.</p>
          <select
            id="settings-search-engine"
            className="settings-input"
            value={normalizeSearchEngine(draftSettings.searchEngine)}
            onChange={(event) =>
              setDraftSettings((prev) => ({
                ...prev,
                searchEngine: event.target.value,
              }))
            }
          >
            <option value="google">Google</option>
            <option value="bing">Bing</option>
            <option value="duckduckgo">DuckDuckGo</option>
          </select>
        </section>

        <section className="settings-field">
          <label className="settings-field-label" htmlFor="response-timeout-slider">
            Response timeout
          </label>
          <p className="settings-desc">
            How long to wait for a reply ({draftSettings.responseTimeoutSeconds}s).
          </p>
          <input
            id="response-timeout-slider"
            className="settings-slider"
            type="range"
            min={MIN_RESPONSE_TIMEOUT_SECONDS}
            max={MAX_RESPONSE_TIMEOUT_SECONDS}
            step={1}
            value={draftSettings.responseTimeoutSeconds}
            onChange={(event) =>
              setDraftSettings((prev) => ({
                ...prev,
                responseTimeoutSeconds: Number(event.target.value),
              }))
            }
          />
        </section>

        {saveNotice ? <p className="settings-toast">{saveNotice}</p> : null}
      </div>
    );
  };

  const animationsEnabled = draftSettings.animationsEnabled !== false;

  return (
    <>
      <div
        className={[
          "overlay",
          `phase-${phase}`,
          animationsEnabled ? "" : "animations-off",
        ]
          .filter(Boolean)
          .join(" ")}
      >
        <div
          className="overlay-backdrop"
          aria-hidden="true"
          onMouseDown={startClose}
        />
        <div className={workspaceClassName}>
          <div className="command-dock">
            <section className={`overlay-panel command-card ${isDisconnected ? "disconnected" : ""}`}>
              <div className="input-row">
                <div className="query-field">
                  <textarea
                    ref={queryRef}
                    value={query}
                    className={`query-input modern-scrollbar ${isLoading ? "loading" : ""}`}
                    onChange={(event) => setQuery(event.target.value)}
                    onKeyDown={onCommandKeyDown}
                    placeholder="Search, calculate, or ask..."
                    rows={1}
                    autoComplete="off"
                    aria-autocomplete="list"
                    aria-controls="command-suggest"
                    aria-expanded={suggestOpen}
                    aria-activedescendant={
                      activeSuggestionIndex >= 0
                        ? `command-suggest-${activeSuggestionIndex}`
                        : undefined
                    }
                  />
                  {isLoading ? <span className="command-loader" aria-hidden="true" /> : null}
                </div>
                <div
                  className={`command-suggest-slot ${suggestOpen ? "is-open" : ""}`}
                  aria-hidden={suggestOpen ? undefined : true}
                  inert={!suggestOpen ? "" : undefined}
                >
                  <div className="command-suggest-clip">
                    {pinnedSuggestions.length ? (
                      <ul
                        id="command-suggest"
                        className="command-suggest modern-scrollbar"
                        role="listbox"
                        aria-label="Commands"
                      >
                        {pinnedSuggestions.map((result, index) => {
                          const isActive = suggestOpen && index === activeSuggestionIndex;
                          return (
                            <li key={result.id} role="presentation">
                              <button
                                type="button"
                                id={`command-suggest-${index}`}
                                role="option"
                                aria-selected={isActive}
                                tabIndex={-1}
                                className={`command-suggest-option ${isActive ? "is-active" : ""}`}
                                onMouseEnter={() => {
                                  suggestionTouchedRef.current = true;
                                  setSuggestionIndex(index);
                                }}
                                onMouseDown={(event) => {
                                  event.preventDefault();
                                  activateResult(result);
                                }}
                              >
                                <span className="command-suggest-category">{result.category}</span>
                                <span className="command-suggest-copy">
                                  <span className="command-suggest-name">{result.title}</span>
                                  <span className="command-suggest-desc">{result.subtitle}</span>
                                </span>
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    ) : null}
                  </div>
                </div>
              </div>

              {sendError ? <div className="error-row">{sendError}</div> : null}
              {otpNotice ? <div className="toast-row">{otpNotice}</div> : null}
            </section>
          </div>

          {hasPanels ? (
            <div
              className="tile-region"
              style={{
                left: tileRegion.x,
                top: tileRegion.y,
                width: tileRegion.width,
                height: tileRegion.height,
              }}
            >
              {panels.map((panel) => {
                const liveRect = rectById.get(panel.id);
                const rect =
                  panel.phase === "leaving"
                    ? panel.exitRect || liveRect || lastRectsRef.current.get(panel.id)
                    : liveRect;
                if (!rect) return null;
                const isFocused = focusedPanelId === panel.id && panel.phase !== "leaving";
                return (
                  <div
                    key={panel.id}
                    className={[
                      "tile-slot",
                      `tile-slot--${panel.kind}`,
                      isFocused ? "focused" : "",
                      `phase-${panel.phase || "shown"}`,
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    style={{
                      left: rect.x - tileRegion.x,
                      top: rect.y - tileRegion.y,
                      width: rect.width,
                      height: rect.height,
                    }}
                    onMouseDown={() => {
                      if (panel.phase === "leaving") return;
                      focusPanel(panel.id);
                    }}
                  >
                    <section
                      className={`overlay-panel overlay-panel--elevated tile-panel ${panel.kind}-card`}
                    >
                      <header className="tile-header">
                        <span className="tile-title">
                          {panel.title || PANEL_TITLES[panel.kind] || "Panel"}
                        </span>
                        <button
                          type="button"
                          className="tile-close"
                          aria-label={`Close ${panel.title || panel.kind}`}
                          onMouseDown={(event) => {
                            // Dismiss on mousedown so a parent focus handler cannot retile
                            // the slot and steal the subsequent click.
                            event.preventDefault();
                            event.stopPropagation();
                            if (panel.kind === "settings") {
                              setCapturingHotkeyTarget(null);
                            }
                            dismissPanel(panel.id);
                          }}
                        >
                          ×
                        </button>
                      </header>
                      <div className="tile-body modern-scrollbar">
                        {panel.kind === "response" ? (
                          <ResponseMarkdown text={panel.text} onOpenLink={openResponseLink} />
                        ) : null}
                        {panel.kind === "otp" ? (
                          <OtpPanel
                            api={api}
                            connected={connection.connected}
                            phase={panel.phase || "shown"}
                            embedded
                            onNotice={(message) => {
                              setOtpNotice(message || "");
                              if (message) {
                                setTimeout(() => setOtpNotice(""), 1800);
                              }
                            }}
                          />
                        ) : null}
                        {panel.kind === "history" ? (
                          <HistoryPanel
                            api={api}
                            connected={connection.connected}
                            epoch={historyEpoch}
                            onOpenLink={openResponseLink}
                          />
                        ) : null}
                        {panel.kind === "settings" ? renderSettingsBody() : null}
                      </div>
                    </section>
                  </div>
                );
              })}
            </div>
          ) : null}
        </div>
      </div>

      {flyIn ? (
        <aside
          className={`overlay-panel overlay-panel--elevated fly-in-notification phase-${flyIn.phase}`}
          onMouseEnter={() => api.setIgnoreMouse?.(false)}
          onMouseLeave={() => api.setIgnoreMouse?.(true)}
        >
          <button
            type="button"
            className="fly-in-dismiss"
            aria-label="Dismiss notification"
            onClick={dismissFlyIn}
          >
            ×
          </button>
          <div className="fly-in-scroll modern-scrollbar">
            <ResponseMarkdown text={flyIn.text} onOpenLink={openResponseLink} />
          </div>
        </aside>
      ) : null}
    </>
  );
}
