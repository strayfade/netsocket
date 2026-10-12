import { useEffect, useRef, useState } from "react";
import ResponseMarkdown from "./ResponseMarkdown";
import {
  ALERT_HISTORY_LIMIT,
  getReceivedAlerts,
  mergeAlertLists,
  normalizeAlerts,
  prependAlert,
  subscribeReceivedAlerts,
} from "./alertHistory.js";

function formatAlertTime(ts) {
  const date = new Date(ts);
  if (Number.isNaN(date.getTime())) return "";
  const time = date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  const now = new Date();
  if (date.toDateString() === now.toDateString()) return time;
  const day = date.toLocaleDateString([], { month: "short", day: "numeric" });
  return `${day}, ${time}`;
}

const EMPTY_OFFLINE = "Connect to the host to load recent alerts.";

export default function HistoryPanel({ api, connected, epoch, onOpenLink }) {
  const [alerts, setAlerts] = useState(() => getReceivedAlerts());
  const [loading, setLoading] = useState(
    () => Boolean(connected) && getReceivedAlerts().length === 0
  );
  const [status, setStatus] = useState(() =>
    !connected && getReceivedAlerts().length === 0
      ? { tone: "muted", text: EMPTY_OFFLINE }
      : null
  );
  const requestRef = useRef(0);
  const alertsRef = useRef(alerts);
  alertsRef.current = alerts;

  useEffect(() => {
    return subscribeReceivedAlerts((alert) => {
      setAlerts((prev) => prependAlert(prev, alert));
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    const requestId = requestRef.current + 1;
    requestRef.current = requestId;
    let cancelled = false;

    const load = async () => {
      if (!connected) {
        if (cancelled) return;
        setLoading(false);
        if (alertsRef.current.length === 0) {
          setStatus({ tone: "muted", text: EMPTY_OFFLINE });
        }
        return;
      }

      setStatus(null);
      if (alertsRef.current.length === 0) setLoading(true);

      const result = await api.getRecentAlerts?.(ALERT_HISTORY_LIMIT);
      if (cancelled || requestRef.current !== requestId) return;
      setLoading(false);
      if (!result?.ok) {
        setStatus({ tone: "error", text: result?.error || "Could not load alerts." });
        return;
      }
      const fetched = normalizeAlerts(result.data, ALERT_HISTORY_LIMIT);
      setAlerts((prev) => mergeAlertLists(fetched, prev.length ? prev : getReceivedAlerts()));
      setStatus(null);
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [api, connected, epoch]);

  if (loading && alerts.length === 0) {
    return <p className="history-status">Loading alerts…</p>;
  }

  if (alerts.length === 0) {
    return (
      <p className={`history-status${status?.tone === "error" ? " history-status--error" : ""}`}>
        {status?.text || "No alerts yet."}
      </p>
    );
  }

  return (
    <div className="history-panel">
      {status?.tone === "error" ? (
        <p className="history-status history-status--error">{status.text}</p>
      ) : null}
      <ul className="history-list">
        {alerts.map((alert, index) => {
          const stamp = Number.isFinite(alert.ts) ? new Date(alert.ts).toISOString() : undefined;
          return (
            <li key={`${alert.ts}-${index}`} className="history-row">
              <time className="history-time" dateTime={stamp}>
                {formatAlertTime(alert.ts)}
              </time>
              <ResponseMarkdown text={alert.text} onOpenLink={onOpenLink} />
            </li>
          );
        })}
      </ul>
    </div>
  );
}
