/*
 * Cryptographic primitives for the netsocket device-pairing protocol
 * ("netsocket-device-v1"), matching server/utils/deviceCrypto.js and the
 * overlay's src-tauri/src/device_crypto.rs:
 *   - Ed25519 device identity keypair (long-lived)
 *   - X25519 ephemeral ECDH per connection
 *   - HKDF-SHA256(ikm, salt=challenge, info="netsocket-device-v1", 32 bytes)
 *   - AES-256-GCM for encrypted application traffic
 *
 * GJS has no WebCrypto, so Ed25519/X25519 come from the vendored
 * tweetnacl-js (vendor/nacl.js) and AES-GCM from lib/aesgcm.js. HMAC/HKDF
 * use GLib.Hmac, which is a real GLib API and needs no vendoring.
 */
import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import nacl from '../vendor/nacl.js';
import { aes256gcmEncrypt, aes256gcmDecrypt } from './aesgcm.js';

const PROTOCOL_INFO = 'netsocket-device-v1';

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

/** Read n bytes from /dev/urandom (Linux CSPRNG) for key material. */
function secureRandomBytes(n) {
    const file = Gio.File.new_for_path('/dev/urandom');
    const stream = file.read(null);
    const bytes = stream.read_bytes(n, null);
    stream.close(null);
    const arr = bytes.toArray();
    if (arr.length !== n)
        throw new Error('short read from /dev/urandom');
    return new Uint8Array(arr);
}

nacl.setPRNG((x, n) => {
    const bytes = secureRandomBytes(n);
    for (let i = 0; i < n; i++) x[i] = bytes[i];
});

export function base64Encode(bytes) {
    return GLib.base64_encode(bytes);
}

export function base64Decode(str) {
    return new Uint8Array(GLib.base64_decode(str));
}

export function utf8Encode(str) {
    return textEncoder.encode(str);
}

export function utf8Decode(bytes) {
    return textDecoder.decode(bytes);
}

/** Long-lived Ed25519 device identity keypair. */
export function generateIdentityKeyPair() {
    const kp = nacl.sign.keyPair();
    return {
        publicKey: base64Encode(kp.publicKey),
        secretKey: base64Encode(kp.secretKey),
    };
}

/** Ephemeral X25519 keypair, generated fresh for every connection attempt. */
export function generateEcdhKeyPair() {
    const secretKey = secureRandomBytes(32);
    const publicKey = nacl.scalarMult.base(secretKey);
    return {
        publicKey: base64Encode(publicKey),
        secretKey: base64Encode(secretKey),
    };
}

/** X25519(myEcdhSecretKeyB64, theirEcdhPublicKeyB64) -> raw 32-byte shared secret. */
export function ecdh(myEcdhSecretKeyB64, theirEcdhPublicKeyB64) {
    return nacl.scalarMult(base64Decode(myEcdhSecretKeyB64), base64Decode(theirEcdhPublicKeyB64));
}

/** HKDF-SHA256 with a 32-byte output (one HMAC block == desired session key length). */
export function hkdfSha256(ikm, salt, info = PROTOCOL_INFO, length = 32) {
    if (length > 32)
        throw new Error('hkdfSha256 only implements the single-block (<=32 byte) case needed here');
    const extract = GLib.Hmac.new(GLib.ChecksumType.SHA256, salt);
    extract.update(ikm);
    const prk = new Uint8Array(extract.get_digest());

    const expand = GLib.Hmac.new(GLib.ChecksumType.SHA256, prk);
    expand.update(utf8Encode(info));
    expand.update(new Uint8Array([1]));
    const okm = new Uint8Array(expand.get_digest());
    return okm.slice(0, length);
}

/**
 * Builds the newline-joined challenge message that both sides sign, per
 * server/utils/deviceCrypto.js buildChallengeMessage. All fields are
 * base64 strings (or plain strings for challenge/deviceId).
 */
export function buildChallengeMessage({
    challenge,
    deviceId,
    deviceIdentityPublicKey,
    deviceEcdhPublicKey,
    serverIdentityPublicKey,
    serverEcdhPublicKey,
}) {
    return [
        'netsocket-device-auth-v1',
        challenge,
        deviceId,
        deviceIdentityPublicKey,
        deviceEcdhPublicKey,
        serverIdentityPublicKey,
        serverEcdhPublicKey,
    ].join('\n');
}

export function signDetached(message, secretKeyB64) {
    const sig = nacl.sign.detached(utf8Encode(message), base64Decode(secretKeyB64));
    return base64Encode(sig);
}

export function verifyDetached(message, signatureB64, publicKeyB64) {
    try {
        return nacl.sign.detached.verify(
            utf8Encode(message),
            base64Decode(signatureB64),
            base64Decode(publicKeyB64)
        );
    } catch (e) {
        return false;
    }
}

/** Encrypts a JS value as JSON, returning {nonce, ciphertext} base64 strings. */
export function encryptJson(sessionKey, value) {
    const nonce = secureRandomBytes(12);
    const plaintext = utf8Encode(JSON.stringify(value));
    const ciphertextAndTag = aes256gcmEncrypt(sessionKey, nonce, plaintext);
    return {
        nonce: base64Encode(nonce),
        ciphertext: base64Encode(ciphertextAndTag),
    };
}

/** Decrypts {nonce, ciphertext} base64 strings and JSON-parses the result. */
export function decryptJson(sessionKey, { nonce, ciphertext }) {
    const plaintext = aes256gcmDecrypt(sessionKey, base64Decode(nonce), base64Decode(ciphertext));
    return JSON.parse(utf8Decode(plaintext));
}

export { secureRandomBytes as randomBytes };
