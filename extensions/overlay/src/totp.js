export const TOTP_PERIOD_SECONDS = 30;
export const TOTP_PERIOD_MILLIS = TOTP_PERIOD_SECONDS * 1000;

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

/** Milliseconds left in the current TOTP period (for smooth progress). */
export function millisRemaining(nowMs = Date.now()) {
  return TOTP_PERIOD_MILLIS - (nowMs % TOTP_PERIOD_MILLIS);
}

export function periodBucket(nowMs = Date.now()) {
  return Math.floor(nowMs / 1000 / TOTP_PERIOD_SECONDS);
}

function decodeBase32(encoded) {
  const clean = String(encoded || "")
    .trim()
    .toUpperCase()
    .replace(/=+$/, "")
    .replace(/\s+/g, "");
  if (!clean) return null;

  let buffer = 0;
  let bitsLeft = 0;
  const out = [];
  for (const ch of clean) {
    const value = BASE32_ALPHABET.indexOf(ch);
    if (value < 0) return null;
    buffer = (buffer << 5) | value;
    bitsLeft += 5;
    if (bitsLeft >= 8) {
      out.push((buffer >> (bitsLeft - 8)) & 0xff);
      bitsLeft -= 8;
    }
  }
  return new Uint8Array(out);
}

/** Match server padBase32To16Bytes: zero-pad secrets shorter than 16 bytes. */
function decodeBase32Padded(encoded) {
  const decoded = decodeBase32(encoded);
  if (!decoded) return null;
  if (decoded.length >= 16) return decoded;
  const padded = new Uint8Array(16);
  padded.set(decoded);
  return padded;
}

async function hmacSha1(keyBytes, messageBytes) {
  const key = await crypto.subtle.importKey(
    "raw",
    keyBytes,
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, messageBytes);
  return new Uint8Array(signature);
}

export async function generateTotp(secret, nowMs = Date.now()) {
  try {
    const keyBytes = decodeBase32Padded(secret);
    if (!keyBytes) return null;

    const counter = Math.floor(nowMs / 1000 / TOTP_PERIOD_SECONDS);
    const counterBytes = new Uint8Array(8);
    let value = counter;
    for (let i = 7; i >= 0; i -= 1) {
      counterBytes[i] = value & 0xff;
      value = Math.floor(value / 256);
    }

    const hash = await hmacSha1(keyBytes, counterBytes);
    const offset = hash[hash.length - 1] & 0x0f;
    const binary =
      ((hash[offset] & 0x7f) << 24) |
      ((hash[offset + 1] & 0xff) << 16) |
      ((hash[offset + 2] & 0xff) << 8) |
      (hash[offset + 3] & 0xff);
    const otp = binary % 1_000_000;
    return String(otp).padStart(6, "0");
  } catch {
    return null;
  }
}

export function formatOtpCode(code) {
  const raw = String(code || "").replace(/\s+/g, "");
  if (raw.length === 6) {
    return `${raw.slice(0, 3)} ${raw.slice(3)}`;
  }
  return raw || "------";
}

export function parseOtpAccounts(data) {
  const array = Array.isArray(data?.accounts) ? data.accounts : [];
  return array
    .map((item) => {
      const key = String(item?.key || "").trim();
      const secret = String(item?.secret || "").trim();
      if (!key || !secret) return null;
      return {
        key,
        issuer: String(item?.issuer || ""),
        account: String(item?.account || ""),
        secret,
        code: item?.code != null && String(item.code).trim() ? String(item.code) : null,
        periodSeconds: Number(item?.periodSeconds) || TOTP_PERIOD_SECONDS,
      };
    })
    .filter(Boolean);
}

export async function withFreshCodes(accounts, nowMs = Date.now()) {
  return Promise.all(
    accounts.map(async (account) => {
      const code = (await generateTotp(account.secret, nowMs)) || account.code || "------";
      return { ...account, code };
    })
  );
}
