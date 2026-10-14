const CURRENCY_PATTERN = /^(-?\d[\d,]*(?:\.\d+)?)\s*([a-z]{3})\s+(?:in|to|into)\s+([a-z]{3})$/i;
const MAX_AGE_MS = 6 * 60 * 60 * 1000;
const cache = new Map();

export function parseCurrencyQuery(query) {
  const match = String(query || "").trim().match(CURRENCY_PATTERN);
  if (!match) return null;
  const amount = Number(match[1].replace(/,/g, ""));
  if (!Number.isFinite(amount)) return null;
  const from = match[2].toUpperCase();
  const to = match[3].toUpperCase();
  if (from === to) return null;
  return { amount, from, to };
}

function formatAmount(value, code) {
  const digits = Math.abs(value) >= 100 ? 2 : 4;
  return `${Number(value.toFixed(digits))} ${code}`;
}

function unavailable(parsed) {
  return {
    id: "currency",
    title: "Currency rates unavailable",
    subtitle: `${parsed.amount} ${parsed.from} in ${parsed.to}`,
    category: "Currency",
    score: 2000,
    direct: true,
    action: { type: "notice", text: "Currency rates unavailable" },
  };
}

export function currencyPlaceholder(query) {
  const parsed = parseCurrencyQuery(query);
  if (!parsed) return null;
  return {
    id: "currency",
    title: "Converting…",
    subtitle: `${parsed.amount} ${parsed.from} in ${parsed.to}`,
    category: "Currency",
    score: 2000,
    direct: true,
    action: { type: "notice", text: "Still loading exchange rates." },
  };
}

export async function currencyResult(query, fetchImpl = globalThis.fetch, now = Date.now()) {
  const parsed = parseCurrencyQuery(query);
  if (!parsed) return null;
  try {
    let entry = cache.get(parsed.from);
    if (!entry || now - entry.at > MAX_AGE_MS) {
      const response = await fetchImpl(
        `https://api.frankfurter.app/latest?from=${encodeURIComponent(parsed.from)}`
      );
      if (!response?.ok) return unavailable(parsed);
      const body = await response.json();
      const rates = { ...(body.rates || {}), [parsed.from]: 1 };
      entry = { rates, at: now };
      cache.set(parsed.from, entry);
    }
    const rate = entry.rates[parsed.to];
    if (typeof rate !== "number") return unavailable(parsed);
    const text = formatAmount(parsed.amount * rate, parsed.to);
    return {
      id: "currency",
      title: text,
      subtitle: "Copy conversion",
      category: "Currency",
      score: 2000,
      direct: true,
      action: { type: "copy", text },
    };
  } catch {
    return unavailable(parsed);
  }
}

export function clearCurrencyCache() {
  cache.clear();
}
