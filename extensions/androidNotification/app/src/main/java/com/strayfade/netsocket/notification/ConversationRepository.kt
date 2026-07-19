package com.strayfade.netsocket.notification

import android.content.Context
import android.os.Handler
import android.os.Looper
import java.util.UUID
import java.util.concurrent.CopyOnWriteArrayList

/**
 * Chat transcript + pending command tracking (mirrors the overlay conversation flow).
 * History is persisted so previous messages remain above the prompt bar.
 */
object ConversationRepository {
    interface Listener {
        fun onMessagesChanged(messages: List<ChatMessage>)
        fun onAwaitingChanged(awaiting: Boolean) {}
    }

    private val mainHandler = Handler(Looper.getMainLooper())
    private val messages = mutableListOf<ChatMessage>()
    private val listeners = CopyOnWriteArrayList<Listener>()

    @Volatile
    private var pendingConversationId: String? = null

    @Volatile
    private var chatVisible = false

    private var timeoutRunnable: Runnable? = null
    private var appContext: Context? = null
    private var hostBound = false
    private var loaded = false

    private val persistRunnable = Runnable {
        val context = appContext ?: return@Runnable
        ChatHistoryStore.save(context, snapshot())
    }

    private val hostListener = object : HostConnection.Listener {
        override fun onOverlayMessage(text: String, conversationId: String?) {
            handleOverlay(text, conversationId)
        }
    }

    fun init(context: Context) {
        appContext = context.applicationContext
        if (!loaded) {
            loaded = true
            synchronized(messages) {
                messages.clear()
                messages.addAll(ChatHistoryStore.load(context.applicationContext))
            }
        }
        if (!hostBound) {
            hostBound = true
            HostConnection.addListener(hostListener)
        }
    }

    fun setChatVisible(visible: Boolean) {
        chatVisible = visible
    }

    fun isChatVisible(): Boolean = chatVisible

    fun addListener(listener: Listener) {
        listeners.add(listener)
        listener.onMessagesChanged(snapshot())
        listener.onAwaitingChanged(pendingConversationId != null)
    }

    fun removeListener(listener: Listener) {
        listeners.remove(listener)
    }

    fun snapshot(): List<ChatMessage> = synchronized(messages) { messages.toList() }

    fun isAwaiting(): Boolean = pendingConversationId != null

    fun clear() {
        clearTimeout()
        pendingConversationId = null
        synchronized(messages) { messages.clear() }
        appContext?.let { ChatHistoryStore.clear(it) }
        notifyMessages()
        notifyAwaiting(false)
    }

    /**
     * @return null on success, or an error message string.
     */
    fun sendCommand(command: String): String? {
        val trimmed = command.trim()
        if (trimmed.isEmpty()) return "Command is empty"
        if (trimmed == "/settings") {
            return "/settings"
        }

        val context = appContext
            ?: return "Not initialized"
        val prefs = Prefs(context)

        if (!HostConnection.currentState().connected) {
            return "Not connected to netsocket host"
        }

        clearTimeout()
        val conversationId = UUID.randomUUID().toString()
        pendingConversationId = conversationId

        val userMessage = ChatMessage(
            id = UUID.randomUUID().toString(),
            role = MessageRole.USER,
            text = trimmed,
            conversationId = conversationId,
        )
        append(userMessage)

        val pending = ChatMessage(
            id = "pending-$conversationId",
            role = MessageRole.ASSISTANT,
            text = "",
            conversationId = conversationId,
            pending = true,
        )
        append(pending)
        notifyAwaiting(true)

        val sent = HostConnection.sendCommand(trimmed, conversationId)
        if (!sent) {
            removePending(conversationId)
            pendingConversationId = null
            append(
                ChatMessage(
                    id = UUID.randomUUID().toString(),
                    role = MessageRole.ERROR,
                    text = "Failed to send command",
                    conversationId = conversationId,
                )
            )
            notifyAwaiting(false)
            return "Failed to send command"
        }

        val timeoutMs = prefs.responseTimeoutSeconds * 1000L
        val runnable = Runnable {
            if (pendingConversationId != conversationId) return@Runnable
            pendingConversationId = null
            removePending(conversationId)
            append(
                ChatMessage(
                    id = UUID.randomUUID().toString(),
                    role = MessageRole.ERROR,
                    text = "Timed out waiting for a response.",
                    conversationId = conversationId,
                )
            )
            notifyAwaiting(false)
        }
        timeoutRunnable = runnable
        mainHandler.postDelayed(runnable, timeoutMs)
        return null
    }

    private fun handleOverlay(text: String, conversationId: String?) {
        val pending = pendingConversationId
        if (conversationId != null && pending != null && conversationId != pending) {
            return
        }

        if (pending != null && (conversationId == null || conversationId == pending)) {
            clearTimeout()
            pendingConversationId = null
            removePending(pending)
            notifyAwaiting(false)
        } else {
            removePending(conversationId)
        }

        append(
            ChatMessage(
                id = UUID.randomUUID().toString(),
                role = MessageRole.ASSISTANT,
                text = text,
                conversationId = conversationId,
            )
        )

        if (!chatVisible) {
            appContext?.let { IncomingNotifier.notify(it, text) }
        }
    }

    private fun append(message: ChatMessage) {
        synchronized(messages) { messages.add(message) }
        notifyMessages()
        schedulePersist()
    }

    private fun removePending(conversationId: String?) {
        if (conversationId == null) return
        synchronized(messages) {
            messages.removeAll { it.pending && it.conversationId == conversationId }
        }
        notifyMessages()
        schedulePersist()
    }

    private fun schedulePersist() {
        mainHandler.removeCallbacks(persistRunnable)
        mainHandler.postDelayed(persistRunnable, 250L)
    }

    private fun clearTimeout() {
        timeoutRunnable?.let { mainHandler.removeCallbacks(it) }
        timeoutRunnable = null
    }

    private fun notifyMessages() {
        val snap = snapshot()
        listeners.forEach { it.onMessagesChanged(snap) }
    }

    private fun notifyAwaiting(awaiting: Boolean) {
        listeners.forEach { it.onAwaitingChanged(awaiting) }
    }
}
