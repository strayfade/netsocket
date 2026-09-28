package com.strayfade.netsocket.notification

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject
import java.io.File

/** Persists chat transcript across process death so history remains above the prompt bar. */
object ChatHistoryStore {
    private const val FILE_NAME = "chat_history.json"
    private const val MAX_MESSAGES = 500

    fun load(context: Context): List<ChatMessage> {
        val file = File(context.filesDir, FILE_NAME)
        if (!file.exists()) return emptyList()
        return try {
            val root = JSONArray(file.readText(Charsets.UTF_8))
            buildList {
                for (i in 0 until root.length()) {
                    val obj = root.optJSONObject(i) ?: continue
                    val role = runCatching {
                        MessageRole.valueOf(obj.optString("role"))
                    }.getOrNull() ?: continue
                    val pending = obj.optBoolean("pending", false)
                    if (pending) continue
                    val id = obj.optString("id")
                    if (id.isBlank()) continue
                    add(
                        ChatMessage(
                            id = id,
                            role = role,
                            text = obj.optString("text"),
                            conversationId = obj.optString("conversationId")
                                .takeIf { it.isNotBlank() },
                            timestampMs = obj.optLong("timestampMs", System.currentTimeMillis()),
                            pending = false,
                        )
                    )
                }
            }
        } catch (_: Exception) {
            emptyList()
        }
    }

    fun save(context: Context, messages: List<ChatMessage>) {
        val durable = messages
            .filter { !it.pending }
            .takeLast(MAX_MESSAGES)
        val array = JSONArray()
        durable.forEach { message ->
            array.put(
                JSONObject()
                    .put("id", message.id)
                    .put("role", message.role.name)
                    .put("text", message.text)
                    .put("conversationId", message.conversationId)
                    .put("timestampMs", message.timestampMs)
                    .put("pending", false)
            )
        }
        try {
            File(context.filesDir, FILE_NAME).writeText(array.toString(), Charsets.UTF_8)
        } catch (_: Exception) {
            // Best-effort persistence; chat still works in memory.
        }
    }

    fun clear(context: Context) {
        try {
            File(context.filesDir, FILE_NAME).delete()
        } catch (_: Exception) {
            // ignore
        }
    }
}
