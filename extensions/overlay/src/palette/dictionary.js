const DEFINE_PATTERN = /^define\s+(.+)$/i;

export function parseDefineQuery(query) {
  const match = String(query || "").trim().match(DEFINE_PATTERN);
  if (!match) return null;
  const word = match[1].trim();
  if (!word || word.length > 80) return null;
  return word;
}

export function dictionaryPlaceholder(query) {
  const word = parseDefineQuery(query);
  if (!word) return null;
  return {
    id: "dictionary",
    title: "Looking up…",
    subtitle: word,
    category: "Define",
    score: 2000,
    direct: true,
    action: { type: "notice", text: "Still looking up that word." },
  };
}

export async function dictionaryResult(query, fetchImpl = globalThis.fetch) {
  const word = parseDefineQuery(query);
  if (!word) return null;
  try {
    const response = await fetchImpl(
      `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`
    );
    if (!response?.ok) {
      return {
        id: "dictionary",
        title: "No definition found",
        subtitle: word,
        category: "Define",
        score: 2000,
        direct: true,
        action: { type: "notice", text: `No definition found for ${word}` },
      };
    }
    const body = await response.json();
    const definition = body?.[0]?.meanings?.[0]?.definitions?.[0]?.definition;
    if (!definition) {
      return {
        id: "dictionary",
        title: "No definition found",
        subtitle: word,
        category: "Define",
        score: 2000,
        direct: true,
        action: { type: "notice", text: `No definition found for ${word}` },
      };
    }
    return {
      id: "dictionary",
      title: definition,
      subtitle: `Copy definition of ${word}`,
      category: "Define",
      score: 2000,
      direct: true,
      action: { type: "copy", text: definition },
    };
  } catch {
    return {
      id: "dictionary",
      title: "No definition found",
      subtitle: word,
      category: "Define",
      score: 2000,
      direct: true,
      action: { type: "notice", text: `No definition found for ${word}` },
    };
  }
}
