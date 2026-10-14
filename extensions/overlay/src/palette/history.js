export const HISTORY_LIMIT = 50;

const LOCAL_HISTORY_KEY = "netsocket-overlay-palette-history";

export function readLocalHistory() {
  if (typeof localStorage === "undefined") return [];
  try {
    const parsed = JSON.parse(localStorage.getItem(LOCAL_HISTORY_KEY) || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function writeLocalHistory(entries) {
  const next = Array.isArray(entries) ? entries.slice(0, HISTORY_LIMIT) : [];
  if (typeof localStorage !== "undefined") {
    localStorage.setItem(LOCAL_HISTORY_KEY, JSON.stringify(next));
  }
  return next;
}

export function entryKey(entry) {
  const action = entry?.action || {};
  return [
    entry?.category || "",
    action.type || "",
    action.invoke || "",
    action.target || action.name || action.url || action.text || "",
  ].join("|");
}

export function toHistoryEntry(result, query, now = Date.now()) {
  const type = result?.action?.type;
  if (!["copy", "open", "invoke", "slash"].includes(type)) return null;
  return {
    title: result.title,
    subtitle: result.subtitle || "",
    category: result.category || "",
    action: result.action,
    confirm: Boolean(result.confirm),
    query: String(query || result.title || ""),
    at: now,
  };
}

export function remember(history, entry) {
  if (!entry) return Array.isArray(history) ? history : [];
  const key = entryKey(entry);
  const next = [entry, ...(Array.isArray(history) ? history : []).filter((item) => entryKey(item) !== key)];
  return next.slice(0, HISTORY_LIMIT);
}

export function historyResults(history, query, scoreText) {
  const items = Array.isArray(history) ? history : [];
  const text = String(query || "").trim();
  const chosen = text
    ? items.filter((entry) => {
        const titleScore = scoreText(text, entry.title);
        const queryScore = scoreText(text, entry.query || "");
        return Math.max(titleScore, queryScore) >= 500;
      })
    : items.slice(0, 8);

  return chosen.slice(0, 8).map((entry, index) => ({
    id: `history:${entry.at || index}:${entryKey(entry)}`,
    title: entry.title,
    subtitle: entry.subtitle || entry.category || "Recent",
    category: "Recent",
    score: text ? 180 : 400 - index,
    direct: false,
    confirm: Boolean(entry.confirm),
    action: entry.action,
  }));
}
