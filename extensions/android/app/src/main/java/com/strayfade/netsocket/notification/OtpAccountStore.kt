package com.strayfade.netsocket.notification

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject
import java.io.File

/** Persists OTP account secrets on-device for offline authenticator use. */
object OtpAccountStore {
    private const val FILE_NAME = "otp_accounts.json"

    fun load(context: Context): List<OtpAccount> {
        val file = File(context.applicationContext.filesDir, FILE_NAME)
        if (!file.exists()) return emptyList()
        return try {
            val root = JSONObject(file.readText(Charsets.UTF_8))
            OtpAccountsParser.fromResponse(root)
        } catch (_: Exception) {
            emptyList()
        }
    }

    fun save(context: Context, accounts: List<OtpAccount>) {
        val array = JSONArray()
        accounts.forEach { account ->
            array.put(
                JSONObject()
                    .put("key", account.key)
                    .put("issuer", account.issuer)
                    .put("account", account.account)
                    .put("secret", account.secret)
                    .put("periodSeconds", account.periodSeconds)
            )
        }
        val root = JSONObject().put("accounts", array)
        try {
            File(context.applicationContext.filesDir, FILE_NAME)
                .writeText(root.toString(), Charsets.UTF_8)
        } catch (_: Exception) {
            // Best-effort persistence; in-memory list still works for this session.
        }
    }
}
