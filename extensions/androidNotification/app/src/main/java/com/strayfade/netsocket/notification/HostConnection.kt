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
import org.json.JSONObject
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean

/**
 * Persistent WebSocket to the netsocket host — same protocol as the Windows overlay.
 * Auth via `x-socket-auth` (Command Palette secret); app-level ping every 10s; reconnect on drop.
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
    )

    interface Listener {
        fun onStateChanged(state: State) {}
        fun onOverlayMessage(text: String, conversationId: String?) {}
    }

    private val mainHandler = Handler(Looper.getMainLooper())
    private val listeners = linkedSetOf<Listener>()
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

    private val started = AtomicBoolean(false)
    private val shouldRun = AtomicBoolean(false)
    private var generation = 0

    private val pingRunnable = object : Runnable {
        override fun run() {
            if (!shouldRun.get()) return
            sendRaw("""{"broadcastPurpose":"ping"}""")
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
        webSocket?.close(1000, "stopped")
        webSocket = null
        updateState(connected = false, connecting = false)
    }

    fun reconnect() {
        if (!shouldRun.get()) return
        generation += 1
        mainHandler.removeCallbacks(pingRunnable)
        mainHandler.removeCallbacks(reconnectRunnable)
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
        if (!state.connected) return false
        val data = JSONObject().apply {
            put("command", command)
            if (conversationId != null) {
                put("conversationId", conversationId)
            }
        }
        val envelope = JSONObject().apply {
            put("broadcastPurpose", "command")
            put("broadcastData", data)
        }
        return sendRaw(envelope.toString())
    }

    private fun openSocket() {
        val context = appContext ?: return
        if (!shouldRun.get()) return

        val prefs = Prefs(context)
        val url = prefs.webSocketUrl()
        val secret = prefs.commandSecret
        val gen = ++generation

        mainHandler.removeCallbacks(reconnectRunnable)
        mainHandler.removeCallbacks(pingRunnable)
        webSocket?.cancel()
        webSocket = null

        updateState(connected = false, connecting = true, lastError = "", url = url)

        if (secret.isBlank()) {
            updateState(
                connected = false,
                connecting = false,
                lastError = "Command Palette secret is not set",
                url = url
            )
            scheduleReconnect()
            return
        }

        val request = Request.Builder()
            .url(url)
            .header("x-socket-auth", secret)
            .build()

        webSocket = client.newWebSocket(request, object : WebSocketListener() {
            override fun onOpen(webSocket: WebSocket, response: Response) {
                if (gen != generation) return
                Log.i(TAG, "WebSocket open: $url")
                sendRaw("""{"broadcastPurpose":"ping"}""")
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
                val authFail = code == 4401
                updateState(
                    connected = false,
                    connecting = false,
                    lastError = if (authFail) {
                        "Auth failed — check Command Palette secret"
                    } else {
                        "Disconnected ($code)"
                    },
                    url = url
                )
                if (!authFail) {
                    scheduleReconnect()
                } else {
                    // Retry later in case the user updates the secret.
                    scheduleReconnect(delayMs = 15_000L)
                }
            }

            override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
                if (gen != generation) return
                Log.w(TAG, "WebSocket failure: ${t.message}")
                mainHandler.removeCallbacks(pingRunnable)
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
        when (json.optString("broadcastPurpose")) {
            "pong" -> {
                if (!state.connected) {
                    updateState(connected = true, connecting = false, lastError = "")
                }
            }
            "overlay" -> {
                val (text, conversationId) = parseOverlayPayload(json.opt("broadcastData"))
                if (text.isNotBlank()) {
                    notifyOverlay(text, conversationId)
                }
            }
            "ack" -> {
                // Host accepted the command; UI already shows a pending state.
            }
        }
    }

    private fun parseOverlayPayload(broadcastData: Any?): Pair<String, String?> {
        return when (broadcastData) {
            is String -> broadcastData to null
            is JSONObject -> {
                val text = broadcastData.optString("text")
                    .ifBlank { broadcastData.optString("message") }
                val conversationId = broadcastData.optString("conversationId")
                    .takeIf { it.isNotBlank() }
                text to conversationId
            }
            else -> "" to null
        }
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
    ) {
        val next = State(connected, connecting, lastError, url)
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
