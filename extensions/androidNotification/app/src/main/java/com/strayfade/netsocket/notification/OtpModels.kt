package com.strayfade.netsocket.notification

import org.json.JSONArray
import org.json.JSONObject
import javax.crypto.Mac
import javax.crypto.spec.SecretKeySpec

data class OtpAccount(
    val key: String,
    val issuer: String,
    val account: String,
    val secret: String,
    val code: String?,
    val periodSeconds: Int = TotpCodes.PERIOD_SECONDS,
) {
    val displayName: String
        get() = if (issuer.isNotBlank() && account.isNotBlank()) {
            "$issuer ($account)"
        } else {
            key
        }

    fun currentCode(): String {
        return TotpCodes.generate(secret) ?: code ?: "------"
    }
}

object TotpCodes {
    const val PERIOD_SECONDS = 30

    fun secondsRemaining(nowMs: Long = System.currentTimeMillis()): Int {
        val elapsed = ((nowMs / 1000L) % PERIOD_SECONDS).toInt()
        return PERIOD_SECONDS - elapsed
    }

    fun generate(secret: String, nowMs: Long = System.currentTimeMillis()): String? {
        return try {
            val keyBytes = decodeBase32Padded(secret) ?: return null
            val counter = (nowMs / 1000L) / PERIOD_SECONDS
            val counterBytes = ByteArray(8)
            var value = counter
            for (i in 7 downTo 0) {
                counterBytes[i] = (value and 0xff).toByte()
                value = value ushr 8
            }
            val mac = Mac.getInstance("HmacSHA1")
            mac.init(SecretKeySpec(keyBytes, "HmacSHA1"))
            val hash = mac.doFinal(counterBytes)
            val offset = hash.last().toInt() and 0x0f
            val binary =
                ((hash[offset].toInt() and 0x7f) shl 24) or
                    ((hash[offset + 1].toInt() and 0xff) shl 16) or
                    ((hash[offset + 2].toInt() and 0xff) shl 8) or
                    (hash[offset + 3].toInt() and 0xff)
            val otp = binary % 1_000_000
            otp.toString().padStart(6, '0')
        } catch (_: Exception) {
            null
        }
    }

    /** Match server padBase32To16Bytes behavior for 10-byte secrets. */
    private fun decodeBase32Padded(encoded: String): ByteArray? {
        val decoded = decodeBase32(encoded) ?: return null
        if (decoded.size == 16 || decoded.size != 10) {
            return decoded
        }
        return ByteArray(16).also { decoded.copyInto(it) }
    }

    private fun decodeBase32(encoded: String): ByteArray? {
        val clean = encoded.trim().uppercase().replace("=", "").replace("\\s+".toRegex(), "")
        if (clean.isEmpty()) return null
        val alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567"
        var buffer = 0
        var bitsLeft = 0
        val out = ArrayList<Byte>((clean.length * 5) / 8 + 1)
        for (ch in clean) {
            val value = alphabet.indexOf(ch)
            if (value < 0) return null
            buffer = (buffer shl 5) or value
            bitsLeft += 5
            if (bitsLeft >= 8) {
                out.add(((buffer shr (bitsLeft - 8)) and 0xff).toByte())
                bitsLeft -= 8
            }
        }
        return out.toByteArray()
    }
}

object OtpAccountsParser {
    fun fromResponse(data: JSONObject?): List<OtpAccount> {
        if (data == null) return emptyList()
        val array = data.optJSONArray("accounts") ?: JSONArray()
        val accounts = ArrayList<OtpAccount>(array.length())
        for (i in 0 until array.length()) {
            val item = array.optJSONObject(i) ?: continue
            val key = item.optString("key")
            val issuer = item.optString("issuer")
            val account = item.optString("account")
            val secret = item.optString("secret")
            if (key.isBlank() || secret.isBlank()) continue
            val code = item.optString("code").takeIf { it.isNotBlank() && it != "null" }
            accounts.add(
                OtpAccount(
                    key = key,
                    issuer = issuer,
                    account = account,
                    secret = secret,
                    code = code,
                    periodSeconds = item.optInt("periodSeconds", TotpCodes.PERIOD_SECONDS),
                )
            )
        }
        return accounts
    }
}
