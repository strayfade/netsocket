const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const base32 = require('hi-base32');
const settingsManager = require('../server/manager/settingsManager');
const {
    parseOtpAuthUri,
    parseOtpAuthMigrationUri,
    importOtpFromQrPayloads,
    parseOtpAccountsString,
    serializeOtpAccounts,
    padBase32To16Bytes,
    otpController,
    OTP_SETTING_KEY,
} = require('../server/utils/authenticator');

function encodeVarint(value) {
    const bytes = [];
    let v = value >>> 0;
    while (v >= 0x80) {
        bytes.push((v & 0x7f) | 0x80);
        v >>>= 7;
    }
    bytes.push(v);
    return Buffer.from(bytes);
}

function encodeKey(fieldNumber, wireType) {
    return encodeVarint((fieldNumber << 3) | wireType);
}

function encodeBytesField(fieldNumber, buf) {
    return Buffer.concat([
        encodeKey(fieldNumber, 2),
        encodeVarint(buf.length),
        buf,
    ]);
}

function encodeVarintField(fieldNumber, value) {
    return Buffer.concat([
        encodeKey(fieldNumber, 0),
        encodeVarint(value),
    ]);
}

function buildMigrationUri({ secretBytes, name, issuer, batchSize = 1, batchIndex = 0, batchId = 1 }) {
    const otpParams = Buffer.concat([
        encodeBytesField(1, secretBytes),
        encodeBytesField(2, Buffer.from(name, 'utf8')),
        encodeBytesField(3, Buffer.from(issuer, 'utf8')),
        encodeVarintField(4, 1), // algorithm SHA1
        encodeVarintField(5, 1), // digits SIX
        encodeVarintField(6, 2), // type TOTP
    ]);
    const payload = Buffer.concat([
        encodeBytesField(1, otpParams),
        encodeVarintField(2, 1),
        encodeVarintField(3, batchSize),
        encodeVarintField(4, batchIndex),
        encodeVarintField(5, batchId),
    ]);
    return `otpauth-migration://offline?data=${payload.toString('base64')}`;
}

describe('authenticator QR import', () => {
    const previous = new Map();

    beforeEach(() => {
        previous.set(OTP_SETTING_KEY, settingsManager.getSetting(OTP_SETTING_KEY));
        settingsManager.setSetting(OTP_SETTING_KEY, '');
    });

    afterEach(async () => {
        const value = previous.get(OTP_SETTING_KEY);
        if (value === undefined || value === null) {
            settingsManager.setSetting(OTP_SETTING_KEY, '');
        } else {
            settingsManager.setSetting(OTP_SETTING_KEY, value);
        }
        await settingsManager.saveSettings();
    });

    it('parses otpauth://totp URIs', () => {
        const parsed = parseOtpAuthUri(
            'otpauth://totp/GitHub:strayfade?secret=JBSWY3DPEHPK3PXP&issuer=GitHub'
        );
        assert.equal(parsed.issuer, 'GitHub');
        assert.equal(parsed.account, 'strayfade');
        assert.equal(parsed.secret, 'JBSWY3DPEHPK3PXP');
    });

    it('parses Google Authenticator migration payloads', () => {
        const secretBytes = Buffer.from(base32.decode.asBytes('JBSWY3DPEHPK3PXP'));
        const uri = buildMigrationUri({
            secretBytes,
            name: 'alice@example.com',
            issuer: 'Google',
            batchSize: 2,
            batchIndex: 0,
            batchId: 42,
        });
        const parsed = parseOtpAuthMigrationUri(uri);
        assert.equal(parsed.batchSize, 2);
        assert.equal(parsed.batchIndex, 0);
        assert.equal(parsed.batchId, 42);
        assert.equal(parsed.accounts.length, 1);
        assert.equal(parsed.accounts[0].issuer, 'Google');
        assert.equal(parsed.accounts[0].account, 'alice@example.com');
        assert.ok(parsed.accounts[0].secret.length > 0);
    });

    it('imports accounts into the shared preference string', async () => {
        const result = await importOtpFromQrPayloads(
            'otpauth://totp/Example:user@example.com?secret=JBSWY3DPEHPK3PXP&issuer=Example'
        );
        assert.equal(result.ok === undefined ? true : result.ok, true);
        assert.equal(result.added, 1);
        assert.equal(result.total, 1);
        const raw = settingsManager.getSetting(OTP_SETTING_KEY);
        const map = parseOtpAccountsString(raw);
        assert.equal(map.get('Example:user@example.com'), 'JBSWY3DPEHPK3PXP');
        assert.equal(
            serializeOtpAccounts(map),
            'Example:user@example.com:JBSWY3DPEHPK3PXP'
        );
    });

    it('pads Base32 secrets shorter than 16 bytes for otplib', () => {
        // 16 chars → 10 bytes; 24 chars → 15 bytes (e.g. Stripe-style secrets)
        const ten = padBase32To16Bytes('N7DV2C2ZHNKSPFQ5');
        const fifteen = padBase32To16Bytes('XZVR5H7ZT3GCTX2FBE4HQA2K');
        assert.equal(Buffer.from(base32.decode.asBytes(ten)).length, 16);
        assert.equal(Buffer.from(base32.decode.asBytes(fifteen)).length, 16);
    });

    it('generates OTP codes for secrets under 128 bits', async () => {
        settingsManager.setSetting(
            OTP_SETTING_KEY,
            'Stripe:user@example.com:XZVR5H7ZT3GCTX2FBE4HQA2K,GitHub:user:ZUNZZ5Z7Y5R6BWZB'
        );
        const stripe = await otpController.getCode('Stripe:user@example.com');
        const github = await otpController.getCode('GitHub:user');
        assert.notEqual(stripe, -1);
        assert.notEqual(github, -1);
        assert.match(String(stripe), /^\d{6}$/);
        assert.match(String(github), /^\d{6}$/);
    });
});
