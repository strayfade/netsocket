// Browser port of the netsocket device-pairing crypto
// (server/utils/deviceCrypto.js + the deviceAuth handshake).
// Curves via @noble/curves (Even WebView WebCrypto may lack Ed25519/X25519);
// HKDF + AES-256-GCM via WebCrypto (universally available).
//
// Wire formats must match the server exactly:
// - keys: raw 32 bytes, standard base64
// - challenge message: "netsocket-device-auth-v1\n<challenge>\n<deviceId>\n
//   <deviceIdentityPub>\n<deviceEcdhPub>\n<serverIdentityPub>\n<serverEcdhPub>"
// - session key: HKDF-SHA256(salt=challenge bytes, ikm=X25519 shared,
//   info="netsocket-device-v1", 32 bytes)
// - envelopes: AES-256-GCM, 12-byte nonce, ciphertext||16-byte tag, b64

import { ed25519, x25519 } from '@noble/curves/ed25519.js'

const PROTOCOL_INFO = 'netsocket-device-v1'
const CHALLENGE_PREFIX = 'netsocket-device-auth-v1'

export function b64encode(bytes: Uint8Array): string {
  let s = ''
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i])
  return btoa(s)
}

export function b64decode(b64: string): Uint8Array<ArrayBuffer> {
  const s = atob(b64)
  const out = new Uint8Array(s.length)
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i)
  return out
}

/** Copy noble outputs (ArrayBufferLike-backed) into WebCrypto-safe buffers. */
function copyBytes(u: Uint8Array): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(u.length)
  out.set(u)
  return out
}

export interface KeyPairB64 {
  publicKeyB64: string
  privateKeyB64: string
}

export function generateIdentityKeypair(): KeyPairB64 {
  const priv = ed25519.utils.randomSecretKey()
  return { publicKeyB64: b64encode(ed25519.getPublicKey(priv)), privateKeyB64: b64encode(priv) }
}

export function generateEcdhKeypair(): KeyPairB64 {
  const priv = x25519.utils.randomSecretKey()
  return { publicKeyB64: b64encode(x25519.getPublicKey(priv)), privateKeyB64: b64encode(priv) }
}

export function buildChallengeMessage(fields: {
  challenge: string
  deviceId: string
  deviceIdentityPublicKey: string
  deviceEcdhPublicKey: string
  serverIdentityPublicKey: string
  serverEcdhPublicKey: string
}): string {
  return [
    CHALLENGE_PREFIX,
    fields.challenge || '',
    fields.deviceId || '',
    fields.deviceIdentityPublicKey || '',
    fields.deviceEcdhPublicKey || '',
    fields.serverIdentityPublicKey || '',
    fields.serverEcdhPublicKey || '',
  ].join('\n')
}

export function verifyServerSignature(publicKeyB64: string, message: string, signatureB64: string): boolean {
  try {
    return ed25519.verify(b64decode(signatureB64), new TextEncoder().encode(message), b64decode(publicKeyB64))
  } catch {
    return false
  }
}

export function signChallenge(privateKeyB64: string, message: string): string {
  return b64encode(ed25519.sign(new TextEncoder().encode(message), b64decode(privateKeyB64)))
}

export async function deriveSessionKey(
  ecdhPrivateB64: string,
  serverEcdhPublicB64: string,
  challengeB64: string,
): Promise<CryptoKey> {
  const shared = x25519.getSharedSecret(b64decode(ecdhPrivateB64), b64decode(serverEcdhPublicB64))
  const base = await crypto.subtle.importKey('raw', copyBytes(shared), { name: 'HKDF' }, false, [
    'deriveBits',
  ])
  const bits = await crypto.subtle.deriveBits(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: b64decode(challengeB64),
      info: new TextEncoder().encode(PROTOCOL_INFO),
    },
    base,
    256,
  )
  return crypto.subtle.importKey('raw', bits, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt'])
}

export async function encryptEnvelope(
  key: CryptoKey,
  payload: unknown,
): Promise<{ nonce: string; ciphertext: string }> {
  const nonce = crypto.getRandomValues(new Uint8Array(12))
  const data = new TextEncoder().encode(JSON.stringify(payload))
  const buf = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, key, data)
  return { nonce: b64encode(nonce), ciphertext: b64encode(new Uint8Array(buf)) }
}

export async function decryptEnvelope(
  key: CryptoKey,
  nonceB64: string,
  ciphertextB64: string,
): Promise<unknown> {
  const buf = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: b64decode(nonceB64) },
    key,
    b64decode(ciphertextB64),
  )
  return JSON.parse(new TextDecoder().decode(buf))
}
