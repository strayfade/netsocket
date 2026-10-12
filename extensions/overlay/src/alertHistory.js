/** Newest-first cap, matching the host alert ring buffer. */
export const ALERT_HISTORY_LIMIT = 50;

/** Alerts this overlay process has received. Host history backfills older ones. */
let receivedAlerts = [];
const listeners = new Set();

export function normalizeAlert(entry) {
  if (!entry || typeof entry !== "object") return null;
  const text = String(entry.text ?? "").trim();
  if (!text) return null;
  const ts = Number(entry.ts);
  const deviceRaw = entry.deviceId ?? entry.device_id ?? null;
  const deviceId =
    typeof deviceRaw === "string" && deviceRaw.trim() ? deviceRaw.trim() : null;
  return {
    text,
    ts: Number.isFinite(ts) ? ts : Date.now(),
    deviceId,
  };
}

export function normalizeAlerts(data, limit = ALERT_HISTORY_LIMIT) {
  const list = Array.isArray(data?.alerts) ? data.alerts : [];
  const count = Number.isInteger(limit) ? Math.max(1, limit) : ALERT_HISTORY_LIMIT;
  const normalized = [];
  for (const entry of list) {
    const alert = normalizeAlert(entry);
    if (!alert) continue;
    normalized.push(alert);
    if (normalized.length >= count) break;
  }
  return normalized;
}

/** Same text arriving within the host/client clock skew of one delivery. */
function echoes(a, b) {
  if (!a || !b || a.text !== b.text) return false;
  return Math.abs(Number(a.ts) - Number(b.ts)) <= 2000;
}

export function prependAlert(list, entry, limit = ALERT_HISTORY_LIMIT) {
  const alert = normalizeAlert(entry);
  const current = Array.isArray(list) ? list : [];
  if (!alert) return current;
  const count = Number.isInteger(limit) ? Math.max(1, limit) : ALERT_HISTORY_LIMIT;
  const rest = current.filter((item) => !echoes(item, alert));
  return [alert, ...rest].slice(0, count);
}

/**
 * Host history is authoritative. Keep a local row only when it is newer than
 * the host snapshot and not already represented there.
 */
export function mergeAlertLists(serverAlerts, localAlerts, limit = ALERT_HISTORY_LIMIT) {
  const count = Number.isInteger(limit) ? Math.max(1, limit) : ALERT_HISTORY_LIMIT;
  const fetched = (Array.isArray(serverAlerts) ? serverAlerts : [])
    .map((entry) => normalizeAlert(entry))
    .filter(Boolean);
  const newest = fetched.reduce((max, item) => Math.max(max, item.ts), 0);
  const extras = (Array.isArray(localAlerts) ? localAlerts : [])
    .map((entry) => normalizeAlert(entry))
    .filter((item) => item && item.ts > newest + 2000 && !fetched.some((row) => echoes(row, item)));
  return [...extras, ...fetched]
    .sort((a, b) => b.ts - a.ts)
    .slice(0, count);
}

export function getReceivedAlerts() {
  return receivedAlerts;
}

export function recordReceivedAlert(entry) {
  const next = prependAlert(receivedAlerts, entry);
  if (next === receivedAlerts) return receivedAlerts;
  receivedAlerts = next;
  const alert = next[0];
  for (const listener of listeners) listener(alert);
  return receivedAlerts;
}

export function subscribeReceivedAlerts(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
