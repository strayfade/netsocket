/*
 * TOTP (RFC 6238) code generation, matching the netsocket server's
 * implementation in server/utils/authenticator.js.
 *
 * IMPORTANT: secrets shorter than 16 bytes are zero-padded to 16 bytes
 * before HMAC, mirroring the server's `padBase32To16Bytes` and Android's
 * `TotpCodes.decodeBase32Padded`. Skipping this makes codes for common
 * short (80-bit) secrets diverge from the host.
 */
import GLib from 'gi://GLib';

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

/** Decode a base32 (RFC 4648, no padding required) string to bytes. */
export function base32Decode(input) {
    const clean = input.toUpperCase().replace(/[^A-Z2-7]/g, '');
    let bits = '';
    for (const ch of clean) {
        const val = BASE32_ALPHABET.indexOf(ch);
        if (val === -1) continue;
        bits += val.toString(2).padStart(5, '0');
    }
    const bytes = [];
    for (let i = 0; i + 8 <= bits.length; i += 8)
        bytes.push(parseInt(bits.substring(i, i + 8), 2));
    return new Uint8Array(bytes);
}

/** Zero-pad a decoded secret up to 16 bytes, matching the server quirk. */
function padTo16Bytes(secretBytes) {
    if (secretBytes.length >= 16) return secretBytes;
    const padded = new Uint8Array(16);
    padded.set(secretBytes);
    return padded;
}

function hmacSha1(keyBytes, msgBytes) {
    const hmac = GLib.Hmac.new(GLib.ChecksumType.SHA1, keyBytes);
    hmac.update(msgBytes);
    // GLib.Hmac.get_digest() takes an out-length; GJS returns the digest array directly.
    return new Uint8Array(hmac.get_digest());
}

function counterBytes(counter) {
    const buf = new Uint8Array(8);
    let c = BigInt(counter);
    for (let i = 7; i >= 0; i--) {
        buf[i] = Number(c & 0xffn);
        c >>= 8n;
    }
    return buf;
}

/**
 * @param {string} base32Secret
 * @param {object} [opts]
 * @param {number} [opts.digits=6]
 * @param {number} [opts.periodSeconds=30]
 * @param {number} [opts.atTimeMs] override current time, for testing
 * @returns {string} zero-padded numeric code
 */
export function generateTotp(base32Secret, opts = {}) {
    const digits = opts.digits ?? 6;
    const period = opts.periodSeconds ?? 30;
    const nowMs = opts.atTimeMs ?? Date.now();
    const counter = Math.floor(nowMs / 1000 / period);

    const secretBytes = padTo16Bytes(base32Decode(base32Secret));
    const hash = hmacSha1(secretBytes, counterBytes(counter));

    const offset = hash[hash.length - 1] & 0x0f;
    const binCode =
        ((hash[offset] & 0x7f) << 24) |
        ((hash[offset + 1] & 0xff) << 16) |
        ((hash[offset + 2] & 0xff) << 8) |
        (hash[offset + 3] & 0xff);

    const mod = 10 ** digits;
    return String(binCode % mod).padStart(digits, '0');
}

/** Seconds remaining in the current TOTP window. */
export function secondsRemaining(periodSeconds = 30, atTimeMs = Date.now()) {
    const elapsed = Math.floor(atTimeMs / 1000) % periodSeconds;
    return periodSeconds - elapsed;
}
