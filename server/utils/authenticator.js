const { OTP, createGuardrails } = require('otplib');
const base32 = require('hi-base32');
const { log, logColors } = require('../log');
const settingsManager = require('../manager/settingsManager');
require('../manager/nodePreferencesRegistry').addPref(
    'Authenticator',
    'authentication.otp_accounts',
    'OTP account secrets',
    'text',
    'abc',
    '<p>Enter TOTP secrets as text. <strong>Comma</strong> (<code>,</code>) separates multiple accounts. Each account must be <code>Issuer:Account:Secret</code> — <strong>colon</strong> (<code>:</code>) separates issuer, display name, and the Base32 secret. Algorithm is always SHA1.</p>' +
    '<p>Account keys used by the OTP node are <code>Issuer:Account</code> (e.g. <code>GitHub:strayfade</code>).</p>'
);

// Many real authenticator secrets are 80-bit (10 bytes) or other lengths under 128-bit.
// otplib defaults to MIN_SECRET_BYTES=16; allow shorter keys used by existing TOTP accounts.
const otpGenerator = new OTP({
    guardrails: createGuardrails({ MIN_SECRET_BYTES: 1 }),
});
const OTP_SETTING_KEY = 'authentication.otp_accounts';
const TOTP_PERIOD_SECONDS = 30;

/**
 * Normalize a Base32 secret. Zero-pad secrets shorter than 16 bytes so they
 * satisfy otplib's default 128-bit floor. For HMAC-SHA1 this is equivalent to
 * using the short key (HMAC pads keys to the hash block size internally).
 * @param {string} encoded
 * @returns {string}
 */
const padBase32To16Bytes = (encoded) => {
    const clean = String(encoded || '')
        .replace(/\s+/g, '')
        .replace(/=+$/, '')
        .toUpperCase();
    const decoded = Buffer.from(base32.decode.asBytes(clean));
    if (decoded.length >= 16) {
        return base32.encode(decoded).replace(/=+$/, '');
    }
    const padded = Buffer.alloc(16);
    decoded.copy(padded);
    return base32.encode(padded).replace(/=+$/, '');
};

/**
 * @param {string} raw
 * @returns {Map<string, string>}
 */
function parseOtpAccountsString(raw) {
    const map = new Map();
    if (raw == null || typeof raw !== 'string') {
        return map;
    }
    const trimmedAll = raw.trim();
    if (!trimmedAll) {
        return map;
    }
    const segments = trimmedAll.split(',').map((s) => s.trim()).filter(Boolean);
    for (const seg of segments) {
        const firstColon = seg.indexOf(':');
        const lastColon = seg.lastIndexOf(':');
        if (firstColon === -1 || lastColon === -1 || firstColon === lastColon) {
            log(
                `Invalid OTP account entry (expected Issuer:Account name:Secret, comma-separated): ${seg}`,
                logColors.Error
            );
            continue;
        }
        const issuer = seg.slice(0, firstColon).trim();
        const name = seg.slice(firstColon + 1, lastColon).trim();
        const secret = seg.slice(lastColon + 1).trim().replace(/\s+/g, '');
        if (!issuer || !name || !secret) {
            continue;
        }
        const key = `${issuer}:${name}`;
        if (map.has(key)) {
            log(`Duplicate OTP account key "${key}"; using the last definition in the preference.`, logColors.Warning);
        }
        map.set(key, secret);
    }
    return map;
}

/**
 * @param {Map<string, string>|Iterable<[string, string]>} accounts
 * @returns {string}
 */
function serializeOtpAccounts(accounts) {
    const entries = accounts instanceof Map ? Array.from(accounts.entries()) : Array.from(accounts);
    return entries
        .map(([key, secret]) => {
            const colon = key.indexOf(':');
            if (colon === -1) {
                return null;
            }
            const issuer = key.slice(0, colon);
            const name = key.slice(colon + 1);
            const cleanSecret = String(secret || '').replace(/\s+/g, '');
            if (!issuer || !name || !cleanSecret) {
                return null;
            }
            return `${issuer}:${name}:${cleanSecret}`;
        })
        .filter(Boolean)
        .join(',');
}

/**
 * @param {{ issuer: string, account: string, secret: string }[]} additions
 * @returns {{ added: number, updated: number, total: number, accounts: object[] }}
 */
function mergeOtpAccounts(additions) {
    const map = parseOtpAccountsString(settingsManager.getSetting(OTP_SETTING_KEY));
    let added = 0;
    let updated = 0;
    for (const entry of additions) {
        const issuer = String(entry.issuer || '').trim();
        const account = String(entry.account || entry.name || '').trim();
        const secret = String(entry.secret || '').trim().replace(/\s+/g, '');
        if (!issuer || !account || !secret) {
            continue;
        }
        const key = `${issuer}:${account}`;
        if (map.has(key)) {
            updated += 1;
        } else {
            added += 1;
        }
        map.set(key, secret);
    }
    const serialized = serializeOtpAccounts(map);
    settingsManager.setSetting(OTP_SETTING_KEY, serialized);
    return {
        added,
        updated,
        total: map.size,
        accounts: listAccountRecords(map),
    };
}

/**
 * @param {string[]} orderedKeys
 * @returns {{ total: number, accounts: object[] }}
 */
function reorderOtpAccounts(orderedKeys) {
    const current = parseOtpAccountsString(settingsManager.getSetting(OTP_SETTING_KEY));
    const next = new Map();
    const seen = new Set();
    for (const rawKey of orderedKeys || []) {
        const key = String(rawKey || '').trim();
        if (!key || seen.has(key) || !current.has(key)) {
            continue;
        }
        next.set(key, current.get(key));
        seen.add(key);
    }
    for (const [key, secret] of current.entries()) {
        if (!seen.has(key)) {
            next.set(key, secret);
        }
    }
    settingsManager.setSetting(OTP_SETTING_KEY, serializeOtpAccounts(next));
    return {
        total: next.size,
        accounts: listAccountRecords(next),
    };
}

/**
 * @param {Map<string, string>} [map]
 * @returns {{ key: string, issuer: string, account: string, secret: string }[]}
 */
function listAccountRecords(map) {
    const accounts = map || parseOtpAccountsString(settingsManager.getSetting(OTP_SETTING_KEY));
    return Array.from(accounts.entries()).map(([key, secret]) => {
        const colon = key.indexOf(':');
        return {
            key,
            issuer: colon === -1 ? key : key.slice(0, colon),
            account: colon === -1 ? '' : key.slice(colon + 1),
            secret,
        };
    });
}

function secondsRemainingInPeriod(nowMs = Date.now()) {
    const elapsed = Math.floor(nowMs / 1000) % TOTP_PERIOD_SECONDS;
    return TOTP_PERIOD_SECONDS - elapsed;
}

/**
 * Decode a single protobuf field from a buffer.
 * @returns {{ fieldNumber: number, wireType: number, value: Buffer|number|bigint, next: number }|null}
 */
function readProtobufField(buf, offset) {
    if (offset >= buf.length) {
        return null;
    }
    let pos = offset;
    let key = 0;
    let shift = 0;
    while (pos < buf.length) {
        const byte = buf[pos++];
        key |= (byte & 0x7f) << shift;
        if ((byte & 0x80) === 0) {
            break;
        }
        shift += 7;
        if (shift > 35) {
            throw new Error('Invalid protobuf varint key');
        }
    }
    const fieldNumber = key >>> 3;
    const wireType = key & 0x7;
    if (wireType === 0) {
        let value = 0n;
        shift = 0;
        while (pos < buf.length) {
            const byte = buf[pos++];
            value |= BigInt(byte & 0x7f) << BigInt(shift);
            if ((byte & 0x80) === 0) {
                break;
            }
            shift += 7;
        }
        return { fieldNumber, wireType, value: Number(value), next: pos };
    }
    if (wireType === 2) {
        let len = 0;
        shift = 0;
        while (pos < buf.length) {
            const byte = buf[pos++];
            len |= (byte & 0x7f) << shift;
            if ((byte & 0x80) === 0) {
                break;
            }
            shift += 7;
        }
        const value = buf.subarray(pos, pos + len);
        return { fieldNumber, wireType, value, next: pos + len };
    }
    if (wireType === 5) {
        return { fieldNumber, wireType, value: buf.subarray(pos, pos + 4), next: pos + 4 };
    }
    if (wireType === 1) {
        return { fieldNumber, wireType, value: buf.subarray(pos, pos + 8), next: pos + 8 };
    }
    throw new Error(`Unsupported protobuf wire type ${wireType}`);
}

/**
 * @param {Buffer} buf
 * @returns {{ secret: Buffer, name: string, issuer: string }|null}
 */
function parseMigrationOtpParameters(buf) {
    let secret = null;
    let name = '';
    let issuer = '';
    let type = 2; // TOTP
    let offset = 0;
    while (offset < buf.length) {
        const field = readProtobufField(buf, offset);
        if (!field) {
            break;
        }
        offset = field.next;
        if (field.fieldNumber === 1 && Buffer.isBuffer(field.value)) {
            secret = field.value;
        } else if (field.fieldNumber === 2 && Buffer.isBuffer(field.value)) {
            name = field.value.toString('utf8');
        } else if (field.fieldNumber === 3 && Buffer.isBuffer(field.value)) {
            issuer = field.value.toString('utf8');
        } else if (field.fieldNumber === 6 && typeof field.value === 'number') {
            type = field.value;
        }
    }
    if (!secret || !secret.length || type !== 2) {
        return null;
    }
    return { secret, name, issuer };
}

/**
 * Parse Google Authenticator migration QR payload(s).
 * @param {string} uri
 * @returns {{ accounts: { issuer: string, account: string, secret: string }[], batchSize: number, batchIndex: number, batchId: number }}
 */
function parseOtpAuthMigrationUri(uri) {
    const trimmed = String(uri || '').trim();
    if (!trimmed.toLowerCase().startsWith('otpauth-migration://')) {
        throw new Error('Not an otpauth-migration URI');
    }
    let url;
    try {
        url = new URL(trimmed);
    } catch {
        throw new Error('Invalid otpauth-migration URI');
    }
    const dataParam = url.searchParams.get('data');
    if (!dataParam) {
        throw new Error('Migration URI missing data parameter');
    }
    const normalized = dataParam.replace(/ /g, '+');
    let payload;
    try {
        payload = Buffer.from(normalized, 'base64');
    } catch {
        throw new Error('Migration data is not valid base64');
    }
    if (!payload.length) {
        throw new Error('Migration data is empty');
    }

    const accounts = [];
    let batchSize = 1;
    let batchIndex = 0;
    let batchId = 0;
    let offset = 0;
    while (offset < payload.length) {
        const field = readProtobufField(payload, offset);
        if (!field) {
            break;
        }
        offset = field.next;
        if (field.fieldNumber === 1 && Buffer.isBuffer(field.value)) {
            const parsed = parseMigrationOtpParameters(field.value);
            if (!parsed) {
                continue;
            }
            let account = parsed.name || 'account';
            let issuer = parsed.issuer || '';
            if (!issuer && account.includes(':')) {
                const colon = account.indexOf(':');
                issuer = account.slice(0, colon).trim();
                account = account.slice(colon + 1).trim();
            }
            if (!issuer) {
                issuer = 'Imported';
            }
            if (!account) {
                account = 'account';
            }
            const secret = base32.encode(parsed.secret).replace(/=+$/, '');
            accounts.push({ issuer, account, secret });
        } else if (field.fieldNumber === 3 && typeof field.value === 'number') {
            batchSize = field.value;
        } else if (field.fieldNumber === 4 && typeof field.value === 'number') {
            batchIndex = field.value;
        } else if (field.fieldNumber === 5 && typeof field.value === 'number') {
            batchId = field.value;
        }
    }

    return { accounts, batchSize, batchIndex, batchId };
}

/**
 * Parse a standard otpauth://totp/... URI into an account record.
 * @param {string} uri
 * @returns {{ issuer: string, account: string, secret: string }}
 */
function parseOtpAuthUri(uri) {
    const trimmed = String(uri || '').trim();
    if (!trimmed.toLowerCase().startsWith('otpauth://')) {
        throw new Error('Not an otpauth URI');
    }
    let url;
    try {
        url = new URL(trimmed);
    } catch {
        throw new Error('Invalid otpauth URI');
    }
    if (url.hostname.toLowerCase() !== 'totp') {
        throw new Error('Only TOTP otpauth URIs are supported');
    }
    const secret = (url.searchParams.get('secret') || '').replace(/\s+/g, '');
    if (!secret) {
        throw new Error('otpauth URI missing secret');
    }
    let label = decodeURIComponent((url.pathname || '').replace(/^\//, ''));
    let issuer = (url.searchParams.get('issuer') || '').trim();
    let account = label;
    if (label.includes(':')) {
        const colon = label.indexOf(':');
        const labelIssuer = label.slice(0, colon).trim();
        account = label.slice(colon + 1).trim();
        if (!issuer) {
            issuer = labelIssuer;
        }
    }
    if (!issuer) {
        issuer = 'Imported';
    }
    if (!account) {
        account = 'account';
    }
    return { issuer, account, secret };
}

/**
 * Import one or more QR payloads (otpauth:// or otpauth-migration://).
 * @param {string|string[]} payloads
 */
async function importOtpFromQrPayloads(payloads) {
    const list = (Array.isArray(payloads) ? payloads : [payloads])
        .map((p) => String(p || '').trim())
        .filter(Boolean);
    if (!list.length) {
        throw new Error('No QR payloads provided');
    }

    const additions = [];
    const migrationBatches = [];
    for (const payload of list) {
        const lower = payload.toLowerCase();
        if (lower.startsWith('otpauth-migration://')) {
            const parsed = parseOtpAuthMigrationUri(payload);
            additions.push(...parsed.accounts);
            migrationBatches.push({
                batchSize: parsed.batchSize,
                batchIndex: parsed.batchIndex,
                batchId: parsed.batchId,
                accountCount: parsed.accounts.length,
            });
        } else if (lower.startsWith('otpauth://')) {
            additions.push(parseOtpAuthUri(payload));
        } else {
            throw new Error('Unrecognized QR payload (expected otpauth:// or otpauth-migration://)');
        }
    }

    if (!additions.length) {
        throw new Error('No TOTP accounts found in QR payload');
    }

    const result = mergeOtpAccounts(additions);
    await settingsManager.saveSettings();
    return {
        ...result,
        imported: additions.length,
        migrationBatches,
    };
}

class Authenticator {
    accountsFromPreference() {
        return parseOtpAccountsString(settingsManager.getSetting(OTP_SETTING_KEY));
    }

    async listCodes() {
        return Array.from(this.accountsFromPreference().keys());
    }

    async listAccounts() {
        return listAccountRecords(this.accountsFromPreference());
    }

    async getCode(name) {
        const accounts = this.accountsFromPreference();
        const secret = accounts.get(name);
        if (!secret) {
            log(`No OTP account found for "${name}".`, logColors.Error);
            return -1;
        }
        try {
            return otpGenerator.generate({
                secret: padBase32To16Bytes(secret),
            });
        } catch (err) {
            log(`Error while fetching OTP for account ${name}: ${err}`, logColors.Error);
            return -1;
        }
    }
}

const otpController = new Authenticator();

module.exports = {
    otpController,
    parseOtpAccountsString,
    serializeOtpAccounts,
    mergeOtpAccounts,
    reorderOtpAccounts,
    listAccountRecords,
    secondsRemainingInPeriod,
    parseOtpAuthUri,
    parseOtpAuthMigrationUri,
    importOtpFromQrPayloads,
    padBase32To16Bytes,
    OTP_SETTING_KEY,
    TOTP_PERIOD_SECONDS,
};
