package com.strayfade.netsocket.notification

import android.content.Context
import android.view.accessibility.AccessibilityEvent
import java.util.Locale

/**
 * Decides whether an accessibility event is a copy.
 *
 * Android 10+ does not deliver [android.content.ClipboardManager.OnPrimaryClipChangedListener]
 * to an app that is not focused, so the clipboard service has to notice the copy itself:
 * the Copy/Cut control, or the system "copied" confirmation that follows.
 */
internal object ClipboardSignals {
    fun isCopySignal(context: Context, event: AccessibilityEvent): Boolean {
        val labels = labels(event)
        return when (event.eventType) {
            AccessibilityEvent.TYPE_VIEW_CLICKED -> {
                if (labels.any { isCopyAction(context, it) }) return true
                isCopyViewId(viewIdOf(event))
            }
            AccessibilityEvent.TYPE_ANNOUNCEMENT,
            AccessibilityEvent.TYPE_NOTIFICATION_STATE_CHANGED,
            -> labels.any { isCopiedConfirmation(context, it) }
            else -> false
        }
    }

    /** Clicks happen before the app calls setPrimaryClip, so the read has to wait. */
    fun readDelayMs(event: AccessibilityEvent): Long {
        return if (event.eventType == AccessibilityEvent.TYPE_VIEW_CLICKED) CLICK_DELAY_MS else 0L
    }

    private fun isCopyAction(context: Context, label: String): Boolean {
        val text = label.trim()
        if (text.isEmpty() || text.length > 80) return false
        return actionPhrases(context).any { phrase -> matchesAction(text, phrase) }
    }

    private fun isCopiedConfirmation(context: Context, label: String): Boolean {
        val text = label.trim()
        if (text.isEmpty() || text.length > 100) return false
        if (EXACT_CONFIRMATIONS.any { text.equals(it, ignoreCase = true) }) return true
        return confirmationPhrases(context).any { phrase ->
            text.equals(phrase, ignoreCase = true) || text.startsWith(phrase, ignoreCase = true)
        }
    }

    private fun matchesAction(label: String, phrase: String): Boolean {
        if (phrase.isEmpty()) return false
        if (label.equals(phrase, ignoreCase = true)) return true
        val latin = phrase.any { it in 'A'..'Z' || it in 'a'..'z' }
        if (!latin) return label.contains(phrase)
        return containsAsToken(label, phrase)
    }

    private fun containsAsToken(label: String, phrase: String): Boolean {
        var start = 0
        while (start <= label.length - phrase.length) {
            val index = label.indexOf(phrase, start, ignoreCase = true)
            if (index < 0) return false
            val beforeOk = index == 0 || !label[index - 1].isLetterOrDigit()
            val end = index + phrase.length
            val afterOk = end == label.length || !label[end].isLetterOrDigit()
            if (beforeOk && afterOk) return true
            start = index + 1
        }
        return false
    }

    private fun isCopyViewId(viewId: String): Boolean {
        val name = viewId.substringAfterLast('/').lowercase(Locale.US)
        if (name.isEmpty()) return false
        return name == "copy" ||
            name == "cut" ||
            name == "copy_url" ||
            name == "copyurl" ||
            name == "clipboard_copy" ||
            name.startsWith("copy_") ||
            name.endsWith("_copy") ||
            name.endsWith("_cut")
    }

    private fun labels(event: AccessibilityEvent): List<String> {
        val values = ArrayList<String>(event.text.size + 1)
        for (item in event.text) {
            val value = item?.toString()?.trim().orEmpty()
            if (value.isNotEmpty()) values.add(value)
        }
        val description = event.contentDescription?.toString()?.trim().orEmpty()
        if (description.isNotEmpty()) values.add(description)
        return values
    }

    private fun viewIdOf(event: AccessibilityEvent): String {
        val source = try {
            event.source
        } catch (_: Exception) {
            null
        } ?: return ""
        return try {
            source.viewIdResourceName.orEmpty()
        } catch (_: Exception) {
            ""
        } finally {
            try {
                source.recycle()
            } catch (_: Exception) {
            }
        }
    }

    private fun actionPhrases(context: Context): List<String> {
        ensurePhrases(context)
        return cachedActions
    }

    private fun confirmationPhrases(context: Context): List<String> {
        ensurePhrases(context)
        return cachedConfirmations
    }

    private fun ensurePhrases(context: Context) {
        val locale = Locale.getDefault().toLanguageTag()
        if (locale == cachedLocale && phrasesLoaded) return
        val actions = linkedSetOf<String>()
        val confirmations = linkedSetOf<String>()
        for (name in ANDROID_ACTIONS) {
            androidString(context, name)?.let(actions::add)
        }
        for (name in ANDROID_CONFIRMATIONS) {
            androidString(context, name)?.let(confirmations::add)
        }
        for (name in SYSTEM_UI_CONFIRMATIONS) {
            systemUiString(context, name)?.let(confirmations::add)
        }
        confirmations.addAll(ENGLISH_CONFIRMATIONS)
        cachedLocale = locale
        phrasesLoaded = true
        cachedActions = actions.filter { it.isNotBlank() }
        cachedConfirmations = confirmations.filter { it.isNotBlank() }
    }

    private fun androidString(context: Context, name: String): String? {
        val id = context.resources.getIdentifier(name, "string", "android")
        if (id == 0) return null
        return runCatching { context.getString(id) }.getOrNull()
    }

    private fun systemUiString(context: Context, name: String): String? {
        val sysui = runCatching {
            context.createPackageContext("com.android.systemui", 0)
        }.getOrNull() ?: return null
        val id = sysui.resources.getIdentifier(name, "string", "com.android.systemui")
        if (id == 0) return null
        return runCatching { sysui.getString(id) }.getOrNull()
    }

    private var cachedLocale: String? = null
    private var phrasesLoaded = false
    private var cachedActions: List<String> = emptyList()
    private var cachedConfirmations: List<String> = emptyList()

    private val ANDROID_ACTIONS = listOf("copy", "cut", "copyUrl")
    private val ANDROID_CONFIRMATIONS = listOf("text_copied")
    private val SYSTEM_UI_CONFIRMATIONS = listOf(
        "clipboard_text_copied",
        "clipboard_image_copied",
        "clipboard_content_copied",
    )
    private val ENGLISH_CONFIRMATIONS = listOf(
        "text copied",
        "image copied",
        "content copied",
        "copied to clipboard",
        "text copied to clipboard.",
        "text copied to clipboard",
    )
    private val EXACT_CONFIRMATIONS = listOf("copied", "copied.", "copied!")

    private const val CLICK_DELAY_MS = 450L
}
