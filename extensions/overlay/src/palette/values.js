function bytesToBase64(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64ToText(value) {
  const binary = atob(value);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

export function encodeBase64(text) {
  return bytesToBase64(new TextEncoder().encode(String(text)));
}

export function decodeBase64(value) {
  try {
    return base64ToText(String(value || "").trim());
  } catch {
    return null;
  }
}

export async function sha256Hex(text) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(String(text)));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function copyResult(id, title, subtitle) {
  return {
    id,
    title,
    subtitle,
    category: "Value",
    score: 2000,
    direct: true,
    action: { type: "copy", text: title },
  };
}

function randomInt(min, max) {
  const low = Math.ceil(Math.min(min, max));
  const high = Math.floor(Math.max(min, max));
  return low + Math.floor(Math.random() * (high - low + 1));
}

export function parseHashQuery(query) {
  const match = String(query || "")
    .trim()
    .match(/^(?:sha-?256|hash)\s+(.+)$/i);
  if (!match) return null;
  return match[1];
}

export function hashPlaceholder(query) {
  if (!parseHashQuery(query)) return null;
  return {
    id: "hash",
    title: "Hashing…",
    subtitle: "SHA-256",
    category: "Value",
    score: 2000,
    direct: true,
    action: { type: "notice", text: "Still hashing." },
  };
}

export async function hashResult(query) {
  const text = parseHashQuery(query);
  if (text == null) return null;
  const digest = await sha256Hex(text);
  return copyResult("hash", digest, "Copy SHA-256");
}

export function valueResult(query) {
  const text = String(query || "").trim();
  const lower = text.toLowerCase();

  if (/^(guid|uuid|new guid|new uuid)$/i.test(text)) {
    return copyResult("guid", crypto.randomUUID(), "Copy value");
  }

  const encode = text.match(/^base64(?:\s+encode)?\s+(.+)$/i);
  if (encode && !/^base64\s+decode\b/i.test(text)) {
    return copyResult("base64", encodeBase64(encode[1]), "Copy Base64");
  }

  const decode = text.match(/^base64\s+decode\s+(.+)$/i);
  if (decode) {
    const decoded = decodeBase64(decode[1]);
    if (decoded == null) return null;
    return copyResult("base64", decoded, "Copy decoded text");
  }

  if (/^random(?:\s+number)?$/i.test(text)) {
    return copyResult("random", String(randomInt(0, 9999)), "Copy number");
  }

  const ranged = lower.match(/^random\s+(-?\d+)\s+(-?\d+)$/);
  if (ranged) {
    return copyResult("random", String(randomInt(Number(ranged[1]), Number(ranged[2]))), "Copy number");
  }

  const upper = lower.match(/^random\s+(\d+)$/);
  if (upper) {
    return copyResult("random", String(randomInt(0, Number(upper[1]))), "Copy number");
  }

  return null;
}
