const ENGINES = {
  google: (query) => `https://www.google.com/search?q=${encodeURIComponent(query)}`,
  bing: (query) => `https://www.bing.com/search?q=${encodeURIComponent(query)}`,
  duckduckgo: (query) => `https://duckduckgo.com/?q=${encodeURIComponent(query)}`,
};

export function normalizeSearchEngine(value) {
  const engine = String(value || "").trim().toLowerCase();
  return Object.prototype.hasOwnProperty.call(ENGINES, engine) ? engine : "google";
}

export function webSearchUrl(engine, query) {
  const build = ENGINES[normalizeSearchEngine(engine)];
  return build(String(query || "").trim());
}

export function urlResult(query) {
  const text = String(query || "").trim();
  let url = null;
  if (/^https?:\/\/\S+$/i.test(text)) url = text;
  else if (/^www\.\S+$/i.test(text)) url = `https://${text}`;
  if (!url) return null;
  return {
    id: "url",
    title: text,
    subtitle: "Open link",
    category: "Web",
    score: 2100,
    direct: true,
    action: { type: "open", url },
  };
}

export function pathResult(query) {
  const text = String(query || "").trim();
  if (!/^[a-z]:\\/i.test(text) && !text.startsWith("\\\\")) return null;
  return {
    id: "path",
    title: text,
    subtitle: "Open path",
    category: "Files",
    score: 2100,
    direct: true,
    action: { type: "invoke", invoke: "open-file", target: text },
  };
}

export function webSearchResult(query, searchEngine) {
  const text = String(query || "").trim();
  if (!text) return null;
  return {
    id: "web",
    title: "Search the web",
    subtitle: text,
    category: "Web",
    score: 140,
    direct: false,
    action: { type: "open", url: webSearchUrl(searchEngine, text) },
  };
}
