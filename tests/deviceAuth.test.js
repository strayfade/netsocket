'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const crypto = require('../server/utils/deviceCrypto');

describe('deviceCrypto', () => {
    it('generates ed25519 keys, signs, and verifies', () => {
        const keys = crypto.generateEd25519KeyPair();
        assert.equal(Buffer.from(keys.publicKeyB64, 'base64').length, 32);
        assert.equal(Buffer.from(keys.privateKeyB64, 'base64').length, 32);
        const sig = crypto.signEd25519(keys.privateKeyB64, 'hello');
        assert.equal(crypto.verifyEd25519(keys.publicKeyB64, 'hello', sig), true);
        assert.equal(crypto.verifyEd25519(keys.publicKeyB64, 'other', sig), false);
    });

    it('derives matching session keys via X25519 ECDH + HKDF', () => {
        const a = crypto.generateX25519KeyPair();
        const b = crypto.generateX25519KeyPair();
        const challenge = crypto.randomChallengeB64();
        const sharedA = crypto.deriveSharedSecret(a.privateKeyB64, b.publicKeyB64);
        const sharedB = crypto.deriveSharedSecret(b.privateKeyB64, a.publicKeyB64);
        assert.deepEqual(sharedA, sharedB);
        const keyA = crypto.deriveSessionKey(sharedA, challenge);
        const keyB = crypto.deriveSessionKey(sharedB, challenge);
        assert.deepEqual(keyA, keyB);
        assert.equal(keyA.length, 32);
    });

    it('encrypts and decrypts JSON payloads with AES-256-GCM', () => {
        const sessionKey = crypto.deriveSessionKey(
            crypto.deriveSharedSecret(
                crypto.generateX25519KeyPair().privateKeyB64,
                crypto.generateX25519KeyPair().publicKeyB64,
            ),
            crypto.randomChallengeB64(),
        );
        const sealed = crypto.encryptPayload(sessionKey, {
            broadcastPurpose: 'command',
            broadcastData: { command: 'hi' },
        });
        const opened = crypto.decryptPayload(sessionKey, sealed.nonce, sealed.ciphertext);
        assert.equal(opened.broadcastPurpose, 'command');
        assert.equal(opened.broadcastData.command, 'hi');
    });

    it('rejects tampered ciphertext', () => {
        const a = crypto.generateX25519KeyPair();
        const b = crypto.generateX25519KeyPair();
        const sessionKey = crypto.deriveSessionKey(
            crypto.deriveSharedSecret(a.privateKeyB64, b.publicKeyB64),
            crypto.randomChallengeB64(),
        );
        const sealed = crypto.encryptPayload(sessionKey, { ok: true });
        const buf = Buffer.from(sealed.ciphertext, 'base64');
        buf[0] ^= 0xff;
        assert.throws(() => crypto.decryptPayload(sessionKey, sealed.nonce, buf.toString('base64')));
    });
});

describe('deviceRegistry', () => {
    let tmpDir;
    let registry;
    let originalDataDir;

    beforeEach(() => {
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'netsocket-devices-'));
        originalDataDir = process.env.DATA_DIR;
        process.env.DATA_DIR = tmpDir;
        // Re-require config + registry against the temp DATA_DIR
        delete require.cache[require.resolve('../server/config')];
        delete require.cache[require.resolve('../server/manager/deviceRegistry')];
        delete require.cache[require.resolve('../server/utils/deviceCrypto')];
        registry = require('../server/manager/deviceRegistry');
        registry.resetForTests();
        registry.ensureServerIdentity();
    });

    afterEach(() => {
        if (originalDataDir === undefined) delete process.env.DATA_DIR;
        else process.env.DATA_DIR = originalDataDir;
        delete require.cache[require.resolve('../server/config')];
        delete require.cache[require.resolve('../server/manager/deviceRegistry')];
        try {
            fs.rmSync(tmpDir, { recursive: true, force: true });
        } catch { /* ignore */ }
    });

    it('creates pending devices from hello and supports approve/deny', () => {
        const keys = crypto.generateEd25519KeyPair();
        const { device, isNew } = registry.upsertFromHello({
            deviceId: 'dev-1',
            identityPublicKey: keys.publicKeyB64,
            name: 'Phone',
            platform: 'android',
            ipAddress: '192.168.1.20',
        });
        assert.equal(isNew, true);
        assert.equal(device.status, 'pending');
        assert.equal(device.ipAddress, '192.168.1.20');

        const approved = registry.setStatus('dev-1', registry.STATUS.APPROVED);
        assert.equal(approved.status, 'approved');
        assert.ok(approved.approvedAt);

        const denied = registry.setStatus('dev-1', registry.STATUS.DENIED);
        assert.equal(denied.status, 'denied');

        const listed = registry.listDevices();
        assert.equal(listed.length, 1);
        assert.equal(listed[0].identityPublicKey, keys.publicKeyB64);
    });

    it('forces re-approval when identity key changes', () => {
        const a = crypto.generateEd25519KeyPair();
        const b = crypto.generateEd25519KeyPair();
        registry.upsertFromHello({
            deviceId: 'dev-2',
            identityPublicKey: a.publicKeyB64,
            platform: 'overlay',
            ipAddress: '10.0.0.2',
        });
        registry.setStatus('dev-2', registry.STATUS.APPROVED);
        const { device, statusChanged } = registry.upsertFromHello({
            deviceId: 'dev-2',
            identityPublicKey: b.publicKeyB64,
            platform: 'overlay',
            ipAddress: '10.0.0.2',
        });
        assert.equal(statusChanged, true);
        assert.equal(device.status, 'pending');
    });

    it('signs challenges with a durable server identity', () => {
        const pub = registry.getServerIdentityPublicKey();
        assert.equal(Buffer.from(pub, 'base64').length, 32);
        const sig = registry.signWithServerIdentity('test-message');
        assert.equal(crypto.verifyEd25519(pub, 'test-message', sig), true);
    });
});

describe('deviceAuth handshake', () => {
    let tmpDir;
    let registry;
    let deviceAuth;
    let originalDataDir;

    beforeEach(() => {
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'netsocket-auth-'));
        originalDataDir = process.env.DATA_DIR;
        process.env.DATA_DIR = tmpDir;
        delete require.cache[require.resolve('../server/config')];
        delete require.cache[require.resolve('../server/manager/deviceRegistry')];
        delete require.cache[require.resolve('../server/utils/deviceCrypto')];
        delete require.cache[require.resolve('../server/utils/deviceAuth')];
        registry = require('../server/manager/deviceRegistry');
        deviceAuth = require('../server/utils/deviceAuth');
        registry.resetForTests();
        deviceAuth.resetForTests();
        registry.ensureServerIdentity();
    });

    afterEach(() => {
        if (originalDataDir === undefined) delete process.env.DATA_DIR;
        else process.env.DATA_DIR = originalDataDir;
        delete require.cache[require.resolve('../server/config')];
        delete require.cache[require.resolve('../server/manager/deviceRegistry')];
        delete require.cache[require.resolve('../server/utils/deviceAuth')];
        try {
            fs.rmSync(tmpDir, { recursive: true, force: true });
        } catch { /* ignore */ }
    });

    const mockSocket = () => {
        const sent = [];
        return {
            readyState: 1,
            sent,
            send(payload) {
                sent.push(JSON.parse(payload));
            },
            close() {},
        };
    };

    it('completes hello → challenge → auth and encrypts after approval', () => {
        const identity = crypto.generateEd25519KeyPair();
        const deviceEcdh = crypto.generateX25519KeyPair();
        const socket = mockSocket();
        const request = { socket: { remoteAddress: '192.168.0.5' } };

        const helloResult = deviceAuth.handleDeviceHello(socket, {
            broadcastPurpose: 'deviceHello',
            broadcastData: {
                deviceId: 'phone-1',
                identityPublicKey: identity.publicKeyB64,
                ecdhPublicKey: deviceEcdh.publicKeyB64,
                platform: 'android',
                name: 'Pixel',
            },
        }, request);
        assert.equal(helloResult.ok, true);
        assert.equal(helloResult.device.status, 'pending');

        const challengeMsg = socket.sent.find((m) => m.broadcastPurpose === 'deviceChallenge');
        assert.ok(challengeMsg);
        assert.equal(
            crypto.verifyEd25519(
                challengeMsg.broadcastData.serverIdentityPublicKey,
                crypto.buildChallengeMessage({
                    challenge: challengeMsg.broadcastData.challenge,
                    deviceId: 'phone-1',
                    deviceIdentityPublicKey: identity.publicKeyB64,
                    deviceEcdhPublicKey: deviceEcdh.publicKeyB64,
                    serverIdentityPublicKey: challengeMsg.broadcastData.serverIdentityPublicKey,
                    serverEcdhPublicKey: challengeMsg.broadcastData.serverEcdhPublicKey,
                }),
                challengeMsg.broadcastData.serverSignature,
            ),
            true,
        );

        const session = deviceAuth.getSession(socket);
        const signature = crypto.signEd25519(identity.privateKeyB64, session.challengeMessage);
        const authResult = deviceAuth.handleDeviceAuth(socket, {
            broadcastPurpose: 'deviceAuth',
            broadcastData: { signature },
        });
        assert.equal(authResult.ok, true);
        assert.equal(authResult.approved, false);

        registry.setStatus('phone-1', registry.STATUS.APPROVED);
        const sessionAfter = deviceAuth.getSession(socket);
        sessionAfter.approved = true;

        const sealed = crypto.encryptPayload(sessionAfter.sessionKey, {
            broadcastPurpose: 'command',
            broadcastData: { command: 'hello' },
        });
        const opened = deviceAuth.decryptIncoming(socket, {
            broadcastPurpose: 'encrypted',
            broadcastData: sealed,
        });
        assert.equal(opened.broadcastData.command, 'hello');
    });

    it('rejects invalid signatures', () => {
        const identity = crypto.generateEd25519KeyPair();
        const other = crypto.generateEd25519KeyPair();
        const deviceEcdh = crypto.generateX25519KeyPair();
        const socket = mockSocket();
        deviceAuth.handleDeviceHello(socket, {
            broadcastPurpose: 'deviceHello',
            broadcastData: {
                deviceId: 'bad-sig',
                identityPublicKey: identity.publicKeyB64,
                ecdhPublicKey: deviceEcdh.publicKeyB64,
                platform: 'overlay',
            },
        }, { socket: { remoteAddress: '127.0.0.1' } });
        const session = deviceAuth.getSession(socket);
        const badSig = crypto.signEd25519(other.privateKeyB64, session.challengeMessage);
        const result = deviceAuth.handleDeviceAuth(socket, {
            broadcastPurpose: 'deviceAuth',
            broadcastData: { signature: badSig },
        });
        assert.equal(result.ok, false);
        assert.equal(result.error, 'invalid_signature');
    });
});
