/*
 * Minimal AES-256-GCM (NIST SP 800-38D) implemented on top of the vendored
 * raw AES block cipher in vendor/aes.js. GJS has no WebCrypto/libgcrypt
 * binding available by default, so this pure-JS implementation is used to
 * stay dependency-free. Not constant-time; messages here are small
 * (chat/OTP JSON payloads), so this is not a performance concern.
 *
 * Wire format matches the netsocket device protocol: 12-byte random nonce,
 * ciphertext with the 16-byte GCM tag appended (standard AEAD convention).
 */
import Aes from '../vendor/aes.js';

const BLOCK = 16;

function xorBlock(a, b) {
    const out = new Uint8Array(BLOCK);
    for (let i = 0; i < BLOCK; i++) out[i] = a[i] ^ b[i];
    return out;
}

function encryptBlock(keySchedule, block) {
    return Uint8Array.from(Aes.cipher(Array.from(block), keySchedule));
}

// GF(2^128) multiplication as used by GHASH (NIST SP 800-38D, Algorithm 1).
function gmul(x, y) {
    let z = new Uint8Array(BLOCK);
    let v = y.slice();
    for (let i = 0; i < 128; i++) {
        const byte = x[i >> 3];
        const bit = (byte >> (7 - (i & 7))) & 1;
        if (bit) {
            for (let j = 0; j < BLOCK; j++) z[j] ^= v[j];
        }
        const lsb = v[15] & 1;
        for (let j = 15; j > 0; j--) v[j] = (v[j] >> 1) | ((v[j - 1] & 1) << 7);
        v[0] = v[0] >> 1;
        if (lsb) v[0] ^= 0xe1;
    }
    return z;
}

function ghash(h, aad, ciphertext) {
    let y = new Uint8Array(BLOCK);
    const feed = (data) => {
        for (let off = 0; off < data.length; off += BLOCK) {
            const block = new Uint8Array(BLOCK);
            block.set(data.subarray(off, Math.min(off + BLOCK, data.length)));
            y = gmul(xorBlock(y, block), h);
        }
    };
    feed(aad);
    feed(ciphertext);

    const lenBlock = new Uint8Array(BLOCK);
    const aadBits = BigInt(aad.length) * 8n;
    const ctBits = BigInt(ciphertext.length) * 8n;
    for (let i = 0; i < 8; i++) lenBlock[7 - i] = Number((aadBits >> BigInt(8 * i)) & 0xffn);
    for (let i = 0; i < 8; i++) lenBlock[15 - i] = Number((ctBits >> BigInt(8 * i)) & 0xffn);
    y = gmul(xorBlock(y, lenBlock), h);
    return y;
}

function incr32(block) {
    const out = block.slice();
    for (let i = 15; i >= 12; i--) {
        out[i] = (out[i] + 1) & 0xff;
        if (out[i] !== 0) break;
    }
    return out;
}

function ctr(keySchedule, j0, data) {
    const out = new Uint8Array(data.length);
    let counter = incr32(j0);
    for (let off = 0; off < data.length; off += BLOCK) {
        const keystream = encryptBlock(keySchedule, counter);
        const chunkLen = Math.min(BLOCK, data.length - off);
        for (let i = 0; i < chunkLen; i++) out[off + i] = data[off + i] ^ keystream[i];
        counter = incr32(counter);
    }
    return out;
}

function j0From12ByteIv(iv) {
    const j0 = new Uint8Array(BLOCK);
    j0.set(iv, 0);
    j0[15] = 1;
    return j0;
}

/**
 * @param {Uint8Array} key 32-byte AES-256 key
 * @param {Uint8Array} nonce 12-byte random nonce
 * @param {Uint8Array} plaintext
 * @param {Uint8Array} [aad] additional authenticated data (empty by default)
 * @returns {Uint8Array} ciphertext with the 16-byte tag appended
 */
export function aes256gcmEncrypt(key, nonce, plaintext, aad = new Uint8Array(0)) {
    const keySchedule = Aes.keyExpansion(Array.from(key));
    const h = encryptBlock(keySchedule, new Uint8Array(BLOCK));
    const j0 = j0From12ByteIv(nonce);
    const ciphertext = ctr(keySchedule, j0, plaintext);
    const s = ghash(h, aad, ciphertext);
    const tag = xorBlock(s, encryptBlock(keySchedule, j0));

    const out = new Uint8Array(ciphertext.length + BLOCK);
    out.set(ciphertext, 0);
    out.set(tag, ciphertext.length);
    return out;
}

/**
 * @param {Uint8Array} key 32-byte AES-256 key
 * @param {Uint8Array} nonce 12-byte nonce used to encrypt
 * @param {Uint8Array} ciphertextAndTag ciphertext with the 16-byte tag appended
 * @param {Uint8Array} [aad]
 * @returns {Uint8Array} plaintext
 * @throws if the authentication tag does not verify
 */
export function aes256gcmDecrypt(key, nonce, ciphertextAndTag, aad = new Uint8Array(0)) {
    if (ciphertextAndTag.length < BLOCK)
        throw new Error('ciphertext too short');
    const ciphertext = ciphertextAndTag.subarray(0, ciphertextAndTag.length - BLOCK);
    const tag = ciphertextAndTag.subarray(ciphertextAndTag.length - BLOCK);

    const keySchedule = Aes.keyExpansion(Array.from(key));
    const h = encryptBlock(keySchedule, new Uint8Array(BLOCK));
    const j0 = j0From12ByteIv(nonce);
    const s = ghash(h, aad, ciphertext);
    const expectedTag = xorBlock(s, encryptBlock(keySchedule, j0));

    let diff = 0;
    for (let i = 0; i < BLOCK; i++) diff |= expectedTag[i] ^ tag[i];
    if (diff !== 0)
        throw new Error('AES-GCM authentication failed');

    return ctr(keySchedule, j0, ciphertext);
}
