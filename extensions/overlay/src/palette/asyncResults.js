import { currencyResult } from "./currency.js";
import { dictionaryResult } from "./dictionary.js";
import { isModeQuery } from "./score.js";
import { hashResult } from "./values.js";

export async function collectAsyncResults(query, { fetchImpl } = {}) {
  const text = String(query || "").trim();
  if (!text || text.includes("\n") || isModeQuery(text)) return [];
  const [currency, dictionary, hash] = await Promise.all([
    currencyResult(text, fetchImpl).catch(() => null),
    dictionaryResult(text, fetchImpl).catch(() => null),
    hashResult(text).catch(() => null),
  ]);
  return [currency, dictionary, hash].filter(Boolean);
}
