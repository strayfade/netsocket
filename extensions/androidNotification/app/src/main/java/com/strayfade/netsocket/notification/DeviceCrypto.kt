package com.strayfade.netsocket.notification

import android.content.Context
import android.util.Base64
import org.bouncycastle.crypto.agreement.X25519Agreement
import org.bouncycastle.crypto.generators.Ed25519KeyPairGenerator
import org.bouncycastle.crypto.generators.X25519KeyPairGenerator
import org.bouncycastle.crypto.params.Ed25519KeyGenerationParameters
import org.bouncycastle.crypto.params.Ed25519PrivateKeyParameters
import org.bouncycastle.crypto.params.Ed25519PublicKeyParameters
import org.bouncycastle.crypto.params.X25519KeyGenerationParameters
import org.bouncycastle.crypto.params.X25519PrivateKeyParameters
import org.bouncycastle.crypto.params.X25519PublicKeyParameters
import org.bouncycastle.crypto.signers.Ed25519Signer
import org.bouncycastle.jce.provider.BouncyCastleProvider
import org.json.JSONObject
import java.security.SecureRandom
import java.security.Security
import javax.crypto.Cipher
import javax.crypto.Mac
import javax.crypto.spec.GCMParameterSpec
import javax.crypto.spec.SecretKeySpec

/**
 * Device identity (Ed25519) + session crypto (X25519 ECDH, HKDF-SHA256, AES-256-GCM).
 * Key material is exchanged as raw 32-byte values encoded with standard Base64
 * to match the netsocket server and desktop overlay.
 */
object DeviceCrypto {
    private const val PROTOCOL_INFO = "netsocket-device-v1"
    private const val GCM_TAG_BITS = 128

    init {
        if (Security.getProvider(BouncyCastleProvider.PROVIDER_NAME) == null) {
            Security.insertProviderAt(BouncyCastleProvider(), 1)
        }
    }

    data class KeyPairB64(val publicKeyB64: String, val privateKeyB64: String)

    fun ensureIdentity(context: Context): KeyPairB64 {
        val prefs = Prefs(context)
        val existingPub = prefs.identityPublicKey
        val existingPriv = prefs.identityPrivateKey
        if (existingPub.isNotBlank() && existingPriv.isNotBlank()) {
            return KeyPairB64(existingPub, existingPriv)
        }
        val generated = generateEd25519()
        prefs.identityPublicKey = generated.publicKeyB64
        prefs.identityPrivateKey = generated.privateKeyB64
        return generated
    }

    fun generateEd25519(): KeyPairB64 {
        val gen = Ed25519KeyPairGenerator()
        gen.init(Ed25519KeyGenerationParameters(SecureRandom()))
        val kp = gen.generateKeyPair()
        val priv = kp.private as Ed25519PrivateKeyParameters
        val pub = kp.public as Ed25519PublicKeyParameters
        return KeyPairB64(encode(pub.encoded), encode(priv.encoded))
    }

    fun generateX25519(): KeyPairB64 {
        val gen = X25519KeyPairGenerator()
        gen.init(X25519KeyGenerationParameters(SecureRandom()))
        val kp = gen.generateKeyPair()
        val priv = kp.private as X25519PrivateKeyParameters
        val pub = kp.public as X25519PublicKeyParameters
        return KeyPairB64(encode(pub.encoded), encode(priv.encoded))
    }

    fun sign(privateKeyB64: String, message: String): String {
        val priv = Ed25519PrivateKeyParameters(decode(privateKeyB64), 0)
        val signer = Ed25519Signer()
        signer.init(true, priv)
        val data = message.toByteArray(Charsets.UTF_8)
        signer.update(data, 0, data.size)
        return encode(signer.generateSignature())
    }

    fun verify(publicKeyB64: String, message: String, signatureB64: String): Boolean {
        return try {
            val pub = Ed25519PublicKeyParameters(decode(publicKeyB64), 0)
            val verifier = Ed25519Signer()
            verifier.init(false, pub)
            val data = message.toByteArray(Charsets.UTF_8)
            verifier.update(data, 0, data.size)
            verifier.verifySignature(decode(signatureB64))
        } catch (_: Exception) {
            false
        }
    }

    fun deriveSessionKey(
        privateKeyB64: String,
        peerPublicKeyB64: String,
        challengeB64: String,
    ): ByteArray {
        val priv = X25519PrivateKeyParameters(decode(privateKeyB64), 0)
        val pub = X25519PublicKeyParameters(decode(peerPublicKeyB64), 0)
        val agreement = X25519Agreement()
        agreement.init(priv)
        val shared = ByteArray(agreement.agreementSize)
        agreement.calculateAgreement(pub, shared, 0)
        return hkdfSha256(shared, decode(challengeB64), PROTOCOL_INFO.toByteArray(Charsets.UTF_8), 32)
    }

    fun buildChallengeMessage(
        challenge: String,
        deviceId: String,
        deviceIdentityPublicKey: String,
        deviceEcdhPublicKey: String,
        serverIdentityPublicKey: String,
        serverEcdhPublicKey: String,
    ): String {
        return listOf(
            "netsocket-device-auth-v1",
            challenge,
            deviceId,
            deviceIdentityPublicKey,
            deviceEcdhPublicKey,
            serverIdentityPublicKey,
            serverEcdhPublicKey,
        ).joinToString("\n")
    }

    fun encrypt(sessionKey: ByteArray, plaintext: JSONObject): Pair<String, String> {
        val nonce = ByteArray(12)
        SecureRandom().nextBytes(nonce)
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.ENCRYPT_MODE, SecretKeySpec(sessionKey, "AES"), GCMParameterSpec(GCM_TAG_BITS, nonce))
        val ciphertext = cipher.doFinal(plaintext.toString().toByteArray(Charsets.UTF_8))
        return encode(nonce) to encode(ciphertext)
    }

    fun decrypt(sessionKey: ByteArray, nonceB64: String, ciphertextB64: String): JSONObject {
        val nonce = decode(nonceB64)
        val ciphertext = decode(ciphertextB64)
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.DECRYPT_MODE, SecretKeySpec(sessionKey, "AES"), GCMParameterSpec(GCM_TAG_BITS, nonce))
        val plaintext = cipher.doFinal(ciphertext)
        return JSONObject(String(plaintext, Charsets.UTF_8))
    }

    private fun hkdfSha256(ikm: ByteArray, salt: ByteArray, info: ByteArray, length: Int): ByteArray {
        val prk = hmacSha256(if (salt.isEmpty()) ByteArray(32) else salt, ikm)
        var t = ByteArray(0)
        val okm = ByteArray(length)
        var offset = 0
        var counter = 1
        while (offset < length) {
            val mac = Mac.getInstance("HmacSHA256")
            mac.init(SecretKeySpec(prk, "HmacSHA256"))
            mac.update(t)
            mac.update(info)
            mac.update(byteArrayOf(counter.toByte()))
            t = mac.doFinal()
            val copy = minOf(t.size, length - offset)
            System.arraycopy(t, 0, okm, offset, copy)
            offset += copy
            counter += 1
        }
        return okm
    }

    private fun hmacSha256(key: ByteArray, data: ByteArray): ByteArray {
        val mac = Mac.getInstance("HmacSHA256")
        mac.init(SecretKeySpec(key, "HmacSHA256"))
        return mac.doFinal(data)
    }

    private fun encode(bytes: ByteArray): String =
        Base64.encodeToString(bytes, Base64.NO_WRAP)

    private fun decode(value: String): ByteArray =
        Base64.decode(value, Base64.DEFAULT)
}
