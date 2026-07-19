package com.strayfade.netsocket.notification

enum class MessageRole {
    USER,
    ASSISTANT,
    SYSTEM,
    ERROR,
}

data class ChatMessage(
    val id: String,
    val role: MessageRole,
    val text: String,
    val conversationId: String? = null,
    val timestampMs: Long = System.currentTimeMillis(),
    val pending: Boolean = false,
)
