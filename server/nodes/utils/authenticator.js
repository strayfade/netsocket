const { OTP } = require('otplib');
const base32 = require('hi-base32');
const { log, logColors } = require('../../log');
const settingsManager = require('../../manager/settingsManager');
require('../../manager/nodePreferencesRegistry').addPref(
    'Authenticator',
    'authentication.otp_accounts',
    'OTP account secrets',
    'text',
    'abc',
    '<p>Enter TOTP secrets as text. <strong>Comma</strong> (<code>,</code>) separates multiple accounts. Each account must be <code>Issuer:Account:Secret</code> — <strong>colon</strong> (<code>:</code>) separates issuer, display name, and the Base32 secret. Algorithm is always SHA1.</p>' +
    '<p>Account keys used by the OTP node are <code>Issuer:Account</code> (e.g. <code>GitHub:strayfade</code>).</p>'
);

const otpGenerator = new OTP();

const padBase32To16Bytes = (encoded) => {
    const clean = encoded.replace(/\s+/g, '').toUpperCase();
    const decoded = Buffer.from(base32.decode.asBytes(clean));
    if (decoded.length === 16) {
        return base32.encode(decoded).replace(/=+$/, '');
    }

    if (decoded.length === 10) {
        const padded = Buffer.alloc(16);
        decoded.copy(padded);
        return base32.encode(padded).replace(/=+$/, '');
    }

    return base32.encode(decoded).replace(/=+$/, '');
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

class Authenticator {
    accountsFromPreference() {
        const raw = settingsManager.getSetting('authentication.otp_accounts');
        return parseOtpAccountsString(raw);
    }

    async listCodes() {
        return Array.from(this.accountsFromPreference().keys());
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

module.exports = { otpController };
