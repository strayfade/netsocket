import { useCallback, useEffect, useRef, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { overlayApi as tauriOverlayApi } from "./overlayApi.js";
import ResponseMarkdown from "./ResponseMarkdown";
import { HELP_MARKDOWN } from "./helpContent";

const HIDE_ANIMATION_MS = 260;
const FLY_IN_ANIMATION_MS = 260;
const FLY_IN_AUTO_DISMISS_MS = 12000;
const MIN_RESPONSE_TIMEOUT_SECONDS = 5;
const MAX_RESPONSE_TIMEOUT_SECONDS = 300;
const DEFAULT_RESPONSE_TIMEOUT_SECONDS = 120;

const defaultSettings = {
  hotkey: "Ctrl+Shift+Space",
  copyLastResponseHotkey: "Alt+Shift+C",
  typeLastResponseHotkey: "Alt+Shift+T",
  openAtLogin: false,
  activeProfile: "production",
  responseTimeoutSeconds: DEFAULT_RESPONSE_TIMEOUT_SECONDS,
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
  hideNow: async () => ({ ok: true }),
  showForNotification: async () => ({ ok: true }),
  hideNotification: async () => ({ ok: true }),
  clearAwaiting: async () => ({ ok: true }),
  setIgnoreMouse: async () => ({ ok: true }),
  openExternal: async () => ({ ok: true }),
  notifyReady: () => {},
  getOverlayVisible: async () => false,
  bindOverlayEvents: async () => () => {},
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

const parseOverlayPayload = (broadcastData) => {
  if (typeof broadcastData === "string") {
    return { text: broadcastData, conversationId: null };
  }
  if (broadcastData && typeof broadcastData === "object") {
    return {
      text: String(broadcastData.text ?? broadcastData.message ?? ""),
      conversationId: broadcastData.conversationId ?? null,
    };
  }
  return { text: "", conversationId: null };
};

export default function App() {
  const [phase, setPhase] = useState("hidden");
  const [query, setQuery] = useState("");
  const [sendError, setSendError] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [capturingHotkeyTarget, setCapturingHotkeyTarget] = useState(null);
  const [saveNotice, setSaveNotice] = useState("");
  const [settings, setSettings] = useState(defaultSettings);
  const [draftSettings, setDraftSettings] = useState(defaultSettings);
  const [connection, setConnection] = useState({
    connected: false,
    connecting: false,
    lastError: "",
    url: defaultSettings.profiles.production.url,
  });
  const [isLoading, setIsLoading] = useState(false);
  const [response, setResponse] = useState(null);
  const [responsePhase, setResponsePhase] = useState("hidden");
  const [flyIn, setFlyIn] = useState(null);
  const closeTimeoutRef = useRef(null);
  const queryRef = useRef(null);
  const phaseRef = useRef("hidden");
  const pendingConversationRef = useRef(null);
  const responseTimeoutRef = useRef(null);
  const flyInTimeoutRef = useRef(null);
  const flyInDismissTimeoutRef = useRef(null);
  const lastServerNotificationTextRef = useRef(null);

  const isOverlayOpen = () => {
    const current = phaseRef.current;
    return current === "shown" || current === "showing";
  };

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
  const hasResponse = responsePhase !== "hidden" && Boolean(response?.text);

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

  const resetConversationUi = () => {
    clearResponseTimeout();
    pendingConversationRef.current = null;
    setIsLoading(false);
    setResponse(null);
    setResponsePhase("hidden");
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

  const dismissFlyIn = async () => {
    clearFlyInTimeouts();
    clearAwaiting();
    setFlyIn((prev) => (prev ? { ...prev, phase: "leaving" } : null));
    flyInDismissTimeoutRef.current = setTimeout(async () => {
      setFlyIn(null);
      if (!isOverlayOpen()) {
        await api.hideNotification?.();
      } else {
        await api.setIgnoreMouse?.(false);
      }
    }, FLY_IN_ANIMATION_MS);
  };

  const showFlyInNotification = async (text) => {
    clearResponseTimeout();
    pendingConversationRef.current = null;
    setIsLoading(false);
    clearAwaiting();
    await api.showForNotification?.();
    clearFlyInTimeouts();
    setFlyIn({ text, phase: "entering" });
    setTimeout(() => {
      setFlyIn((prev) => (prev ? { ...prev, phase: "visible" } : null));
    }, 16);
    flyInTimeoutRef.current = setTimeout(() => {
      dismissFlyIn();
    }, FLY_IN_AUTO_DISMISS_MS);
  };

  const showResponse = (text) => {
    clearResponseTimeout();
    clearAwaiting();
    setIsLoading(false);
    pendingConversationRef.current = null;
    setResponse({ text });
    setResponsePhase("showing");
    setTimeout(() => setResponsePhase("shown"), 16);
  };

  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  const startClose = useCallback(async () => {
    if (phaseRef.current === "hidden" || phaseRef.current === "hiding") return;
    setPhase("hiding");
    closeTimeoutRef.current = setTimeout(async () => {
      setSettingsOpen(false);
      setCapturingHotkeyTarget(null);
      setResponse(null);
      setResponsePhase("hidden");
      setIsLoading(false);
      if (!pendingConversationRef.current) {
        clearResponseTimeout();
      }
      setPhase("hidden");
      await api.hideNow();
    }, HIDE_ANIMATION_MS);
  }, []);

  const handleShow = useCallback(() => {
    if (closeTimeoutRef.current) {
      clearTimeout(closeTimeoutRef.current);
      closeTimeoutRef.current = null;
    }
    clearFlyInTimeouts();
    setFlyIn(null);
    setPhase("showing");
    setSendError("");
    resetConversationUi();
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
    let isMounted = true;
    let unbindEvents = () => {};
    let unlistenFocus = () => {};

    const init = async () => {
      unbindEvents = await api.bindOverlayEvents({
        onShow: handleShow,
        onHideIntent: startClose,
        onConnectionState: (nextState) => {
          setConnection((prev) => ({ ...prev, ...nextState }));
        },
        onServerMessage: (payload) => {
          if (payload?.broadcastPurpose !== "overlay") return;

          const { text, conversationId } = parseOverlayPayload(payload.broadcastData);
          if (!text) return;

          const pendingId = pendingConversationRef.current;
          if (conversationId && pendingId && conversationId !== pendingId) return;

          storeServerNotificationText(text);

          if (isOverlayOpen()) {
            showResponse(text);
            return;
          }

          showFlyInNotification(text);
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

      if (!isMounted) return;

      try {
        unlistenFocus = await getCurrentWindow().onFocusChanged(({ payload: focused }) => {
          if (focused) syncInteractiveState();
        });
      } catch {
        // Browser preview fallback.
      }

      const loaded = await api.getSettings();
      if (!isMounted) return;
      const safe = loaded || defaultSettings;
      setSettings(safe);
      setDraftSettings(clone(safe));

      await api.notifyReady?.();
      if (!isMounted) return;
      await syncInteractiveState();
    };

    init();

    return () => {
      isMounted = false;
      if (closeTimeoutRef.current) clearTimeout(closeTimeoutRef.current);
      clearResponseTimeout();
      clearFlyInTimeouts();
      unbindEvents();
      unlistenFocus();
    };
  }, [handleShow, startClose, syncInteractiveState]);

  useEffect(() => {
    if (phase === "shown" && queryRef.current && !capturingHotkeyTarget) {
      queryRef.current.focus();
      queryRef.current.setSelectionRange(query.length, query.length);
    }
    if (phase === "showing" || phase === "shown") {
      requestAnimationFrame(resizeQueryInput);
    }
  }, [phase, query.length, settingsOpen, capturingHotkeyTarget, hasResponse, isLoading]);

  useEffect(() => {
    resizeQueryInput();
    const onResize = () => resizeQueryInput();
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

  const openSettings = () => {
    setQuery("");
    setSendError("");
    setSettingsOpen(true);
  };

  const sendQuery = async () => {
    const text = query.trim();
    if (!text.length) {
      setSendError("");
      startClose();
      return;
    }

    if (text === "/settings") {
      openSettings();
      return;
    }

    if (text === "/?") {
      setQuery("");
      setSendError("");
      showResponse(HELP_MARKDOWN);
      requestAnimationFrame(resizeQueryInput);
      return;
    }

    const conversationId = createConversationId();
    pendingConversationRef.current = conversationId;
    setIsLoading(true);
    setSendError("");
    setResponse(null);
    setResponsePhase("hidden");
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

  const onCommandKeyDown = async (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      if (settingsOpen) {
        setSettingsOpen(false);
        setCapturingHotkeyTarget(null);
      } else {
        startClose();
      }
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
      await sendQuery();
    }
  };

  const saveSettings = async () => {
    const saved = await api.saveSettings(draftSettings);
    setSettings(saved);
    setDraftSettings(clone(saved));
    setSaveNotice("Saved");
    setTimeout(() => setSaveNotice(""), 1800);
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

  const openResponseLink = async (url) => {
    await api.openExternal?.(url);
  };

  const stackClassName = [
    "overlay-stack",
    settingsOpen ? "settings-open" : "",
    hasResponse ? "response-open" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <>
      <div className={`overlay phase-${phase}`}>
        <div
          className="overlay-backdrop"
          aria-hidden="true"
          onMouseDown={startClose}
        />
        <div className={stackClassName}>
        <section className={`overlay-panel command-card ${isDisconnected ? "disconnected" : ""}`}>
          <div className="input-row">
            <textarea
              ref={queryRef}
              value={query}
              className={`query-input modern-scrollbar ${isLoading ? "loading" : ""}`}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={onCommandKeyDown}
              placeholder="Enter a command or /? for help..."
              rows={1}
            />
            {isLoading ? <span className="command-loader" aria-hidden="true" /> : null}
          </div>

          {sendError ? <div className="error-row">{sendError}</div> : null}
        </section>

        {hasResponse ? (
          <section className={`overlay-panel overlay-panel--elevated response-card phase-${responsePhase}`}>
            <ResponseMarkdown text={response.text} onOpenLink={openResponseLink} />
          </section>
        ) : null}

        {settingsOpen ? (
          <section className="overlay-panel overlay-panel--elevated settings-card">
            <div className="profile-switch">
              <button
                type="button"
                className={activeProfile === "production" ? "active" : ""}
                onClick={() =>
                  setDraftSettings((prev) => ({ ...prev, activeProfile: "production" }))
                }
              >
                Production
              </button>
              <button
                type="button"
                className={activeProfile === "development" ? "active" : ""}
                onClick={() =>
                  setDraftSettings((prev) => ({ ...prev, activeProfile: "development" }))
                }
              >
                Development
              </button>
            </div>

            <label className="setting-label">Websocket URL</label>
            <input
              className="settings-input"
              value={activeProfileConfig.url || ""}
              onChange={(event) => updateProfileField("url", event.target.value)}
              placeholder="ws://127.0.0.1:4675"
            />

            <label className="setting-label">Authentication secret</label>
            <input
              className="settings-input"
              type="password"
              value={activeProfileConfig.secret || ""}
              onChange={(event) => updateProfileField("secret", event.target.value)}
            />

            {HOTKEY_FIELDS.map(({ key, label }) => (
              <div key={key}>
                <label className="setting-label">{label}</label>
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

            <div className="toggle-row">
              <span>Open overlay on startup</span>
              <button
                type="button"
                role="switch"
                aria-checked={draftSettings.openAtLogin}
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
            </div>

            <label className="setting-label" htmlFor="response-timeout-slider">
              Response timeout ({draftSettings.responseTimeoutSeconds}s)
            </label>
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

            {connection.lastError && isDisconnected ? (
              <div className="error-row">{connection.lastError}</div>
            ) : null}
            {saveNotice ? <div className="toast-row">{saveNotice}</div> : null}

            <div className="settings-actions">
              <button type="button" onClick={saveSettings}>
                Save
              </button>
              <button
                type="button"
                className="secondary"
                onClick={() => {
                  setDraftSettings(clone(settings));
                  setSettingsOpen(false);
                  setCapturingHotkeyTarget(null);
                }}
              >
                Close
              </button>
            </div>
          </section>
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
