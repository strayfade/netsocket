'use strict';

// The Authenticator settings page lives in the React app now
// (frontend-app/src/features/settings/), so this covers the parse/validate/serialize
// contract the page and the Authentication/OTP node both depend on. The TS module is
// erasure-only (tsconfig: erasableSyntaxOnly), so Node's type stripping lets a CJS
// test require it directly — one source of truth, no duplicated logic.

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

const { parseOtpAccounts, serializeOtpAccounts, otpCountLabel } = require(
    path.join(__dirname, '../frontend-app/src/features/settings/otpLogic.ts')
);

describe('otpLogic parse', () => {
    it('parses Issuer:Account:Secret entries, keeping colons inside account names', () => {
        const raw = [
            'Google:ada@example.com:JBSWY3DPEHPK3PXP',
            'Google:grace@example.com:J5XFGJIDSQOBMU34PAWOO4E3',
            'Microsoft:Marshall University:N7DV2C2ZHNKSPFQ5',
            'Bank:Joint:Checking:MFRGGZDF',
            'not-an-account',
            '',
        ].join(',');
        const { accounts, invalid } = parseOtpAccounts(raw);
        assert.equal(accounts.length, 4);
        assert.deepEqual(accounts[0], {
            issuer: 'Google',
            account: 'ada@example.com',
            secret: 'JBSWY3DPEHPK3PXP',
        });
        assert.deepEqual(accounts[2], {
            issuer: 'Microsoft',
            account: 'Marshall University',
            secret: 'N7DV2C2ZHNKSPFQ5',
        });
        assert.deepEqual(accounts[3], {
            issuer: 'Bank',
            account: 'Joint:Checking',
            secret: 'MFRGGZDF',
        });
        assert.deepEqual(invalid, ['not-an-account']);
    });

    it('strips whitespace inside secrets and keeps blank input safe', () => {
        const { accounts } = parseOtpAccounts('GitHub:octocat:GEZD GNBS');
        assert.equal(accounts[0].secret, 'GEZDGNBS');
        assert.deepEqual(parseOtpAccounts(''), { accounts: [], invalid: [] });
        assert.deepEqual(parseOtpAccounts(null), { accounts: [], invalid: [] });
    });
});

describe('otpLogic serialize', () => {
    it('round-trips edits back to the comma-separated format and keeps invalid entries', () => {
        const parsed = parseOtpAccounts(
            'Google:ada@example.com:JBSWY3DPEHPK3PXP,Google:grace@example.com:J5XFGJIDSQOBMU34PAWOO4E3,not-an-account'
        );
        parsed.accounts[0].account = 'ada.updated@example.com';
        parsed.accounts.splice(1, 1); // removed
        parsed.accounts.push({ issuer: 'GitHub', account: 'octocat', secret: 'GEZD GNBS' });
        const result = serializeOtpAccounts(parsed.accounts, parsed.invalid);
        assert.equal(result.ok, true);
        assert.equal(
            result.value,
            'Google:ada.updated@example.com:JBSWY3DPEHPK3PXP,GitHub:octocat:GEZDGNBS,not-an-account'
        );
        assert.equal(result.duplicates, 0);
    });

    it('rejects accounts missing a required part, reporting the offending row', () => {
        const result = serializeOtpAccounts(
            [{ issuer: 'GitHub', account: 'octocat', secret: '' }],
            []
        );
        assert.equal(result.ok, false);
        assert.equal(result.error.index, 0);
        assert.equal(result.error.field, 'secret');
        assert.match(result.error.message, /needs an issuer/);
    });

    it('rejects separators that would corrupt the storage format', () => {
        const badIssuer = serializeOtpAccounts([{ issuer: 'A:B', account: 'x', secret: 'Y' }], []);
        assert.equal(badIssuer.ok, false);
        assert.equal(badIssuer.error.field, 'issuer');
        const badAccount = serializeOtpAccounts([{ issuer: 'A', account: 'x,y', secret: 'Y' }], []);
        assert.equal(badAccount.ok, false);
        assert.equal(badAccount.error.field, 'account');
        const badSecret = serializeOtpAccounts([{ issuer: 'A', account: 'x', secret: 'Y:Z' }], []);
        assert.equal(badSecret.ok, false);
        assert.equal(badSecret.error.field, 'secret');
    });

    it('skips entirely blank rows and counts duplicate issuer:account pairs', () => {
        const result = serializeOtpAccounts(
            [
                { issuer: '', account: '', secret: '' },
                { issuer: 'Google', account: 'a@b.c', secret: 'AAA' },
                { issuer: 'Google', account: 'a@b.c', secret: 'BBB' },
            ],
            []
        );
        assert.equal(result.ok, true);
        assert.equal(result.value, 'Google:a@b.c:AAA,Google:a@b.c:BBB');
        assert.equal(result.duplicates, 1);
    });

    it('formats the account count label', () => {
        assert.equal(otpCountLabel(0), '0 accounts');
        assert.equal(otpCountLabel(1), '1 account');
        assert.equal(otpCountLabel(4), '4 accounts');
    });
});
