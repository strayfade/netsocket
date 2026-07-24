package com.strayfade.netsocket.notification

import android.content.Context
import android.os.Handler
import android.os.Looper
import android.util.Log
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener
import org.json.JSONArray
import org.json.JSONObject
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean

/**
 * Persistent WebSocket to the netsocket host.
 * Authenticates via device keypair handshake + dashboard approval,
 * then encrypts application messages with AES-256-GCM.
 */
object HostConnection {
    private const val TAG = "HostConnection"
    private const val PING_INTERVAL_MS = 10_000L
    private const val RECONNECT_DELAY_MS = 1_750L

    data class State(
        val connected: Boolean = false,
        val connecting: Boolean = false,
        val lastError: String = "",
        val url: String = "",
        val authStatus: String = "",
    )

    interface Listener {
        fun onStateChanged(state: State) {}
        fun onOverlayMessage(text: String, conversationId: String?) {}
    }

    fun interface RequestCallback {
        fun onResult(ok: Boolean, data: JSONObject?, error: String?)
    }

    private data class PendingRequest(
        val purpose: String,
        val callback: RequestCallback,
        val timeoutRunnable: Runnable,
    )

    private val mainHandler = Handler(Looper.getMainLooper())
    private val listeners = linkedSetOf<Listener>()
    private val pendingRequests = ConcurrentHashMap<String, PendingRequest>()
    private val client = OkHttpClient.Builder()
        .pingInterval(20, TimeUnit.SECONDS)
        .readTimeout(0, TimeUnit.MILLISECONDS)
        .connectTimeout(20, TimeUnit.SECONDS)
        .build()

    @Volatile
    private var webSocket: WebSocket? = null

    @Volatile
    private var appContext: Context? = null

    @Volatile
    private var state = State()

    @Volatile
    private var sessionKey: ByteArray? = null

    @Volatile
    private var approved = false

    @Volatile
    private var handshakeComplete = false

    @Volatile
    private var pendingEcdh: DeviceCrypto.KeyPairB64? = null

    @Volatile
    private var identity: DeviceCrypto.KeyPairB64? = null

    private val started = AtomicBoolean(false)
    private val shouldRun = AtomicBoolean(false)
    private var generation = 0

    private const val DEFAULT_REQUEST_TIMEOUT_MS = 15_000L

    private val pingRunnable = object : Runnable {
        override fun run() {
            if (!shouldRun.get()) return
            if (handshakeComplete) {
                sendAppMessage(buildPingPayload())
            }
            mainHandler.postDelayed(this, PING_INTERVAL_MS)
        }
    }

    private val reconnectRunnable = Runnable {
        if (shouldRun.get()) {
            openSocket()
        }
    }

    fun start(context: Context) {
        appContext = context.applicationContext
        DeviceCrypto.ensureIdentity(context.applicationContext)
        shouldRun.set(true)
        if (started.compareAndSet(false, true)) {
            openSocket()
        } else if (!state.connected && !state.connecting) {
            openSocket()
        }
    }

    fun stop() {
        shouldRun.set(false)
        started.set(false)
        mainHandler.removeCallbacks(pingRunnable)
        mainHandler.removeCallbacks(reconnectRunnable)
        generation += 1
        failPendingRequests("Connection stopped")
        clearSession()
        webSocket?.close(1000, "stopped")
        webSocket = null
        updateState(connected = false, connecting = false)
    }

    fun reconnect() {
        if (!shouldRun.get()) return
        generation += 1
        mainHandler.removeCallbacks(pingRunnable)
        mainHandler.removeCallbacks(reconnectRunnable)
        failPendingRequests("Reconnecting")
        clearSession()
        webSocket?.close(1000, "reconnect")
        webSocket = null
        openSocket()
    }

    fun addListener(listener: Listener) {
        synchronized(listeners) { listeners.add(listener) }
        listener.onStateChanged(state)
    }

    fun removeListener(listener: Listener) {
        synchronized(listeners) { listeners.remove(listener) }
    }

    fun currentState(): State = state

    fun sendCommand(command: String, conversationId: String?): Boolean {
        if (!approved || !state.connected) return false
        val context = appContext ?: return false
        val data = JSONObject().apply {
            put("command", command)
            if (conversationId != null) {
                put("conversationId", conversationId)
            }
            put("deviceId", DeviceId.get(context))
        }
        val envelope = JSONObject().apply {
            put("broadcastPurpose", "command")
            put("broadcastData", data)
        }
        return sendAppMessage(envelope)
    }

    fun request(
        purpose: String,
        data: JSONObject? = null,
        timeoutMs: Long = DEFAULT_REQUEST_TIMEOUT_MS,
        callback: RequestCallback,
    ): Boolean {
        if (!approved || !state.connected) {
            mainHandler.post { callback.onResult(false, null, "Not connected to host") }
            return false
        }
        val requestId = UUID.randomUUID().toString()
        val timeoutRunnable = Runnable {
            val pending = pendingRequests.remove(requestId) ?: return@Runnable
            pending.callback.onResult(false, null, "Request timed out")
        }
        pendingRequests[requestId] = PendingRequest(purpose, callback, timeoutRunnable)
        val envelope = JSONObject().apply {
            put("broadcastPurpose", purpose)
            put("requestId", requestId)
            if (data != null) {
                put("broadcastData", data)
            }
        }
        val sent = sendAppMessage(envelope)
        if (!sent) {
            pendingRequests.remove(requestId)
            mainHandler.post { callback.onResult(false, null, "Failed to send request") }
            return false
        }
        mainHandler.postDelayed(timeoutRunnable, timeoutMs)
        return true
    }

    fun getOtpAccounts(callback: RequestCallback): Boolean {
        return request("getOtpAccounts", callback = callback)
    }

    fun importOtpFromQr(payloads: List<String>, callback: RequestCallback): Boolean {
        val array = JSONArray()
        payloads.forEach { array.put(it) }
        val data = JSONObject().put("payloads", array)
        return request("importOtpFromQr", data = data, callback = callback)
    }

    private fun localDeviceId(): String {
        val context = appContext ?: return ""
        return DeviceId.get(context)
    }

    private fun buildPingPayload(): JSONObject {
        val deviceId = localDeviceId()
        return if (deviceId.isBlank()) {
            JSONObject().put("broadcastPurpose", "ping")
        } else {
            JSONObject()
                .put("broadcastPurpose", "ping")
                .put("broadcastData", JSONObject().put("deviceId", deviceId))
        }
    }

    private fun clearSession() {
        sessionKey = null
        approved = false
        handshakeComplete = false
        pendingEcdh = null
    }

    private fun openSocket() {
        val context = appContext ?: return
        if (!shouldRun.get()) return

        val prefs = Prefs(context)
        val url = prefs.webSocketUrl()
        val secret = prefs.commandSecret
        val identityKeys = DeviceCrypto.ensureIdentity(context)
        identity = identityKeys
        val gen = ++generation

        mainHandler.removeCallbacks(reconnectRunnable)
        mainHandler.removeCallbacks(pingRunnable)
        webSocket?.cancel()
        webSocket = null
        clearSession()

        updateState(connected = false, connecting = true, lastError = "", url = url, authStatus = "connecting")

        val requestBuilder = Request.Builder().url(url)
        if (secret.isNotBlank()) {
            requestBuilder.header("x-socket-auth", secret)
        }
        val request = requestBuilder.build()

        webSocket = client.newWebSocket(request, object : WebSocketListener() {
            override fun onOpen(webSocket: WebSocket, response: Response) {
                if (gen != generation) return
                Log.i(TAG, "WebSocket open: $url")
                val ecdh = DeviceCrypto.generateX25519()
                pendingEcdh = ecdh
                val hello = JSONObject()
                    .put("broadcastPurpose", "deviceHello")
                    .put(
                        "broadcastData",
                        JSONObject()
                            .put("deviceId", DeviceId.get(context))
                            .put("identityPublicKey", identityKeys.publicKeyB64)
                            .put("ecdhPublicKey", ecdh.publicKeyB64)
                            .put("platform", "android")
                            .put("name", "Android")
                    )
                sendRaw(hello.toString())
                mainHandler.post(pingRunnable)
            }

            override fun onMessage(webSocket: WebSocket, text: String) {
                if (gen != generation) return
                handleMessage(text)
            }

            override fun onClosing(webSocket: WebSocket, code: Int, reason: String) {
                webSocket.close(code, reason)
            }

            override fun onClosed(webSocket: WebSocket, code: Int, reason: String) {
                if (gen != generation) return
                Log.w(TAG, "WebSocket closed: $code $reason")
                mainHandler.removeCallbacks(pingRunnable)
                failPendingRequests("Disconnected")
                clearSession()
                val denied = code == 4403
                val authFail = code == 4401
                updateState(
                    connected = false,
                    connecting = false,
                    lastError = when {
                        denied -> "This device was denied access"
                        authFail -> "Device authentication failed"
                        else -> "Disconnected ($code)"
                    },
                    url = url,
                    authStatus = if (denied) "denied" else ""
                )
                scheduleReconnect(if (denied) 15_000L else RECONNECT_DELAY_MS)
            }

            override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
                if (gen != generation) return
                Log.w(TAG, "WebSocket failure: ${t.message}")
                mainHandler.removeCallbacks(pingRunnable)
                failPendingRequests(t.message ?: "Connection failed")
                clearSession()
                updateState(
                    connected = false,
                    connecting = false,
                    lastError = t.message ?: "Connection failed",
                    url = url
                )
                scheduleReconnect()
            }
        })
    }

    private fun handleMessage(raw: String) {
        val json = try {
            JSONObject(raw)
        } catch (_: Exception) {
            return
        }
        val purpose = json.optString("broadcastPurpose")
        when (purpose) {
            "deviceChallenge" -> {
                handleChallenge(json.optJSONObject("broadcastData") ?: JSONObject())
                return
            }
            "deviceStatus" -> {
                handleDeviceStatus(json.optJSONObject("broadcastData") ?: JSONObject())
                return
            }
            "deviceError" -> {
                val msg = json.optJSONObject("broadcastData")
                    ?.optString("message")
                    ?.ifBlank { null }
                    ?: json.optJSONObject("broadcastData")?.optString("error")
                    ?: "Device authentication error"
                updateState(connected = false, connecting = false, lastError = msg, authStatus = "")
                webSocket?.close(1000, "device error")
                return
            }
        }

        var message = json
        if (purpose == "encrypted") {
            val key = sessionKey ?: return
            val data = json.optJSONObject("broadcastData") ?: return
            message = try {
                DeviceCrypto.decrypt(
                    key,
                    data.optString("nonce"),
                    data.optString("ciphertext"),
                )
            } catch (e: Exception) {
                Log.w(TAG, "decrypt failed: ${e.message}")
                return
            }
        }

        val requestId = message.optString("requestId").takeIf { it.isNotBlank() }
        if (requestId != null) {
            val pending = pendingRequests.remove(requestId)
            if (pending != null) {
                mainHandler.removeCallbacks(pending.timeoutRunnable)
                val data = when (val rawData = message.opt("broadcastData")) {
                    is JSONObject -> rawData
                    JSONObject.NULL, null -> null
                    else -> JSONObject().put("value", rawData)
                }
                val explicitOk = data?.optBoolean("ok", true) ?: true
                val error = data?.optString("error").orEmpty().takeIf { it.isNotBlank() }
                mainHandler.post {
                    pending.callback.onResult(explicitOk && error == null, data, error)
                }
                return
            }
        }
        when (message.optString("broadcastPurpose")) {
            "pong" -> {
                if (approved && !state.connected) {
                    updateState(connected = true, connecting = false, lastError = "", authStatus = "approved")
                }
            }
            "overlay" -> {
                val (text, conversationId, deviceId) = parseOverlayPayload(message.opt("broadcastData"))
                val allow = conversationId != null || alertTargetsDevice(deviceId)
                if (text.isNotBlank() && allow) {
                    notifyOverlay(text, conversationId)
                }
            }
            "ack" -> {
                // Host accepted the command.
            }
            "deviceStatus" -> {
                handleDeviceStatus(message.optJSONObject("broadcastData") ?: JSONObject())
            }
        }
    }

    private fun handleChallenge(data: JSONObject) {
        val context = appContext ?: return
        val prefs = Prefs(context)
        val identityKeys = identity ?: DeviceCrypto.ensureIdentity(context)
        val ecdh = pendingEcdh ?: return
        val challenge = data.optString("challenge")
        val serverIdentity = data.optString("serverIdentityPublicKey")
        val serverEcdh = data.optString("serverEcdhPublicKey")
        val serverSignature = data.optString("serverSignature")
        val status = data.optString("status", "pending")
        val deviceId = DeviceId.get(context)

        val challengeMessage = DeviceCrypto.buildChallengeMessage(
            challenge = challenge,
            deviceId = deviceId,
            deviceIdentityPublicKey = identityKeys.publicKeyB64,
            deviceEcdhPublicKey = ecdh.publicKeyB64,
            serverIdentityPublicKey = serverIdentity,
            serverEcdhPublicKey = serverEcdh,
        )
        if (!DeviceCrypto.verify(serverIdentity, challengeMessage, serverSignature)) {
            updateState(connected = false, connecting = false, lastError = "Server identity signature invalid")
            webSocket?.close(1000, "bad server signature")
            return
        }

        val pinned = prefs.pinnedServerIdentityPublicKey
        if (pinned.isBlank()) {
            prefs.pinnedServerIdentityPublicKey = serverIdentity
        } else if (pinned != serverIdentity) {
            updateState(
                connected = false,
                connecting = false,
                lastError = "Server identity changed. Clear pinned key in settings if this host is trusted.",
            )
            webSocket?.close(1000, "server identity mismatch")
            return
        }

        sessionKey = try {
            DeviceCrypto.deriveSessionKey(ecdh.privateKeyB64, serverEcdh, challenge)
        } catch (e: Exception) {
            updateState(connected = false, connecting = false, lastError = "Failed to derive session key")
            return
        }
        pendingEcdh = null

        val signature = DeviceCrypto.sign(identityKeys.privateKeyB64, challengeMessage)
        val auth = JSONObject()
            .put("broadcastPurpose", "deviceAuth")
            .put("broadcastData", JSONObject().put("signature", signature))
        sendRaw(auth.toString())
        handshakeComplete = true

        if (status == "approved") {
            approved = true
            updateState(connected = true, connecting = false, lastError = "", authStatus = "approved")
        } else {
            approved = false
            updateState(
                connected = false,
                connecting = false,
                lastError = "Waiting for approval in the netsocket dashboard (Settings → Devices)",
                authStatus = "pending",
            )
        }
    }

    private fun handleDeviceStatus(data: JSONObject) {
        when (data.optString("status")) {
            "approved" -> {
                approved = true
                updateState(connected = true, connecting = false, lastError = "", authStatus = "approved")
            }
            "pending" -> {
                approved = false
                updateState(
                    connected = false,
                    connecting = false,
                    lastError = "Waiting for approval in the netsocket dashboard (Settings → Devices)",
                    authStatus = "pending",
                )
            }
            "denied" -> {
                approved = false
                updateState(
                    connected = false,
                    connecting = false,
                    lastError = "This device was denied access",
                    authStatus = "denied",
                )
                webSocket?.close(4403, "denied")
            }
        }
    }

    private fun failPendingRequests(reason: String) {
        val snapshot = pendingRequests.entries.toList()
        pendingRequests.clear()
        snapshot.forEach { (_, pending) ->
            mainHandler.removeCallbacks(pending.timeoutRunnable)
            mainHandler.post {
                pending.callback.onResult(false, null, reason)
            }
        }
    }

    private fun alertTargetsDevice(alertDeviceId: String?): Boolean {
        if (alertDeviceId.isNullOrBlank()) return true
        val local = localDeviceId()
        return local.isNotBlank() && local == alertDeviceId
    }

    private fun parseOverlayPayload(broadcastData: Any?): Triple<String, String?, String?> {
        return when (broadcastData) {
            is String -> Triple(broadcastData, null, null)
            is JSONObject -> {
                val text = broadcastData.optString("text")
                    .ifBlank { broadcastData.optString("message") }
                val conversationId = broadcastData.optString("conversationId")
                    .takeIf { it.isNotBlank() }
                val deviceId = broadcastData.optString("deviceId")
                    .ifBlank { broadcastData.optString("device_id") }
                    .takeIf { it.isNotBlank() }
                Triple(text, conversationId, deviceId)
            }
            else -> Triple("", null, null)
        }
    }

    private fun sendAppMessage(payload: JSONObject): Boolean {
        val key = sessionKey
        val outbound = if (approved && key != null) {
            try {
                val (nonce, ciphertext) = DeviceCrypto.encrypt(key, payload)
                JSONObject()
                    .put("broadcastPurpose", "encrypted")
                    .put(
                        "broadcastData",
                        JSONObject()
                            .put("nonce", nonce)
                            .put("ciphertext", ciphertext)
                    )
            } catch (e: Exception) {
                Log.w(TAG, "encrypt failed: ${e.message}")
                return false
            }
        } else {
            payload
        }
        return sendRaw(outbound.toString())
    }

    private fun sendRaw(payload: String): Boolean {
        val ws = webSocket ?: return false
        return try {
            ws.send(payload)
        } catch (e: Exception) {
            Log.w(TAG, "send failed: ${e.message}")
            false
        }
    }

    private fun scheduleReconnect(delayMs: Long = RECONNECT_DELAY_MS) {
        if (!shouldRun.get()) return
        mainHandler.removeCallbacks(reconnectRunnable)
        mainHandler.postDelayed(reconnectRunnable, delayMs)
    }

    private fun updateState(
        connected: Boolean = state.connected,
        connecting: Boolean = state.connecting,
        lastError: String = state.lastError,
        url: String = state.url,
        authStatus: String = state.authStatus,
    ) {
        val next = State(connected, connecting, lastError, url, authStatus)
        state = next
        mainHandler.post {
            val snapshot = synchronized(listeners) { listeners.toList() }
            snapshot.forEach { it.onStateChanged(next) }
        }
    }

    private fun notifyOverlay(text: String, conversationId: String?) {
        mainHandler.post {
            val snapshot = synchronized(listeners) { listeners.toList() }
            snapshot.forEach { it.onOverlayMessage(text, conversationId) }
        }
    }
}
