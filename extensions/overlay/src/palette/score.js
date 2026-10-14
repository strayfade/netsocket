export function normalizeQuery(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

export function scoreText(query, target) {
  const q = normalizeQuery(query);
  const t = normalizeQuery(target);
  if (!q || !t) return 0;
  if (t === q) return 1000;
  if (t.startsWith(q)) return 800;
  if (t.includes(q)) return 500;

  let index = 0;
  let gaps = 0;
  for (const char of t) {
    if (char === q[index]) index += 1;
    else if (index > 0) gaps += 1;
    if (index >= q.length) break;
  }
  if (index === q.length) return Math.max(1, 200 - gaps);
  return 0;
}

export function isModeQuery(query) {
  const text = String(query || "").trim();
  return text.startsWith("/") || text.startsWith(">") || text.startsWith("<") || text.startsWith("$");
}
