package com.strayfade.netsocket.notification

import android.util.Log
import org.json.JSONObject
import java.io.BufferedReader
import java.io.OutputStreamWriter
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.Executors

object NotificationForwarder {
    private const val TAG = "NetsocketForwarder"
    private val executor = Executors.newSingleThreadExecutor()

    fun forward(
        prefs: Prefs,
        title: String,
        textContent: String,
        bundleIdentifier: String,
        deviceId: String
    ) {
        if (!prefs.forwardingEnabled) {
            Log.d(TAG, "Forwarding disabled; skipping $bundleIdentifier")
            return
        }

        val endpoint = prefs.endpointUrl()
        val payload = JSONObject()
            .put("title", title)
            .put("textContent", textContent)
            .put("bundleIdentifier", bundleIdentifier)
            .put("deviceId", deviceId)
            .toString()

        executor.execute {
            var connection: HttpURLConnection? = null
            try {
                connection = (URL(endpoint).openConnection() as HttpURLConnection).apply {
                    requestMethod = "POST"
                    connectTimeout = 20_000
                    readTimeout = 20_000
                    doOutput = true
                    setRequestProperty("Content-Type", "application/json; charset=utf-8")
                    setRequestProperty("Accept", "application/json")
                }

                OutputStreamWriter(connection.outputStream, Charsets.UTF_8).use { writer ->
                    writer.write(payload)
                    writer.flush()
                }

                val code = connection.responseCode
                val body = readBody(connection)
                if (code in 200..299) {
                    Log.i(TAG, "Posted $bundleIdentifier -> HTTP $code")
                } else {
                    Log.w(TAG, "Non-success for $bundleIdentifier -> HTTP $code body=$body")
                }
            } catch (error: Exception) {
                Log.e(TAG, "Failed posting $bundleIdentifier to $endpoint", error)
            } finally {
                connection?.disconnect()
            }
        }
    }

    private fun readBody(connection: HttpURLConnection): String {
        val stream = try {
            connection.inputStream
        } catch (_: Exception) {
            connection.errorStream
        } ?: return ""

        return stream.bufferedReader(Charsets.UTF_8).use(BufferedReader::readText)
    }
}
