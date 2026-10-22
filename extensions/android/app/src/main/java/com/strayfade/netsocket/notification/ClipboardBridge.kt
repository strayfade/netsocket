package com.strayfade.netsocket.notification

import android.app.ActivityManager
import android.app.ActivityOptions
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.util.Base64
import android.util.Log
import androidx.core.content.FileProvider
import java.io.ByteArrayOutputStream
import java.io.File
import java.security.MessageDigest
import java.util.concurrent.Executors

/**
 * Reads and writes the system clipboard as a string.
 * Text is stored as-is. Images are data URLs (`data:image/<type>;base64,...`).
 * Writes made here are marked so they are not sent back to the host.
 *
 * Android 10+ only notifies [ClipboardManager.OnPrimaryClipChangedListener] and only
 * returns clip data when this app is focused (or is the IME). Background copies are
 * noticed by [ClipboardAccessibilityService] and read from [ClipboardCaptureActivity].
 */
object ClipboardBridge {
    private const val TAG = "ClipboardBridge"
    const val MAX_ENCODED_CHARS = 8 * 1024 * 1024
    private const val OWN_WRITE_WINDOW_MS = 4_000L
    private const val DEDUPE_WINDOW_MS = 1_500L
    private const val FRESH_CLIP_MS = 15_000L
    private const val CLOCK_SKEW_MS = 2_000L
    private val IMAGE_DATA_URL = Regex(
        "^data:image/(png|jpeg|jpg|webp);base64,",
        RegexOption.IGNORE_CASE,
    )

    private val lock = Any()
    private val worker = Executors.newSingleThreadExecutor()
    private val mainHandler = Handler(Looper.getMainLooper())
    private var listener: ClipboardManager.OnPrimaryClipChangedListener? = null
    private var ownWriteFingerprint: String? = null
    private var ownWriteUntilMs = 0L
    private var lastClipTimestamp = 0L
    private var lastPublishedFingerprint: String? = null
    private var lastPublishedAt = 0L
    private var captureInFlight = false
    private var captureAgain = false
    private var captureGeneration = 0
    private val signalRunnable = Runnable {
        signalAtUptime = 0L
        val app = signalContext ?: return@Runnable
        requestBackgroundCapture(app)
    }
    private var signalContext: Context? = null
    private var signalAtUptime = 0L

    enum class CopyPoll {
        Sent,
        Ignore,
        Pending,
    }

    fun syncWatch(context: Context) {
        val app = context.applicationContext
        if (Prefs(app).sendClipboard) {
            startWatching(app)
        } else {
            stopWatching(app)
        }
    }

    fun stopWatching(context: Context) {
        val app = context.applicationContext
        val clipboard = clipboard(app) ?: return
        synchronized(lock) {
            val current = listener ?: return
            clipboard.removePrimaryClipChangedListener(current)
            listener = null
        }
    }

    fun writeText(context: Context, label: String, text: String) {
        val clip = ClipData.newPlainText(label, text)
        commit(context, clip, text)
    }

    /** Writes text, or an image when [content] is a supported data URL. */
    fun writeContent(context: Context, content: String): Boolean {
        if (content.length > MAX_ENCODED_CHARS) {
            Log.w(TAG, "clipboard content exceeds size limit")
            return false
        }
        val match = IMAGE_DATA_URL.find(content) ?: run {
            writeText(context, "netsocket", content)
            return true
        }
        val subtype = match.groupValues[1].lowercase().let { if (it == "jpg") "jpeg" else it }
        val payload = content.substring(match.range.last + 1)
        val bytes = try {
            Base64.decode(payload, Base64.DEFAULT)
        } catch (e: IllegalArgumentException) {
            Log.w(TAG, "clipboard image was not valid base64: ${e.message}")
            return false
        }
        if (bytes.isEmpty()) return false
        return writeImage(context, bytes, subtype, content)
    }

    /**
     * Accessibility noticed a copy. [delayMs] lets the source app finish
     * [ClipboardManager.setPrimaryClip] before this app takes focus to read it.
     */
    fun onCopySignal(context: Context, delayMs: Long) {
        val app = context.applicationContext
        if (!Prefs(app).sendClipboard) return
        val inFlight = synchronized(lock) { captureInFlight }
        if (!inFlight && hasVisibleActivity()) return
        val delay = delayMs.coerceAtLeast(0L)
        if (delay == 0L) {
            mainHandler.removeCallbacks(signalRunnable)
            signalAtUptime = 0L
            requestBackgroundCapture(app)
            return
        }
        val due = SystemClock.uptimeMillis() + delay
        if (signalAtUptime != 0L && signalAtUptime <= due) return
        signalContext = app
        signalAtUptime = due
        mainHandler.removeCallbacks(signalRunnable)
        mainHandler.postDelayed(signalRunnable, delay)
    }

    fun readNow(context: Context): String? {
        val clip = readClip(context.applicationContext) ?: return null
        return try {
            encodeClip(context.applicationContext, clip)
        } catch (e: Exception) {
            Log.w(TAG, "failed to encode clipboard: ${e.message}")
            null
        }
    }

    fun publishUserCopy(context: Context, content: String, clipTimestamp: Long = 0L): Boolean {
        if (content.isEmpty() || content.length > MAX_ENCODED_CHARS) return false
        if (!Prefs(context).sendClipboard) return false
        val now = SystemClock.elapsedRealtime()
        val accepted = synchronized(lock) {
            val fp = fingerprint(content)
            val duplicate = (clipTimestamp > 0L && clipTimestamp == lastClipTimestamp) ||
                (
                    clipTimestamp <= 0L &&
                        fp == lastPublishedFingerprint &&
                        now - lastPublishedAt < DEDUPE_WINDOW_MS
                    )
            if (isOwnWriteLocked(content, now) || duplicate) {
                false
            } else {
                lastPublishedFingerprint = fp
                lastPublishedAt = now
                if (clipTimestamp > 0L) lastClipTimestamp = clipTimestamp
                true
            }
        }
        if (!accepted) return false
        Log.i(
            TAG,
            "sent clipboard (${content.length} chars, image=${content.startsWith("data:image/")})",
        )
        HostConnection.sendClipboard(content)
        return true
    }

    /**
     * Reads the clipboard once the capture activity is focused.
     * [CopyPoll.Pending] means try again; the other results mean the window can close.
     */
    fun pollCopy(context: Context): CopyPoll {
        if (!Prefs(context).sendClipboard) return CopyPoll.Ignore
        val clip = readClip(context) ?: return CopyPoll.Pending
        val timestamp = clip.description?.timestamp ?: 0L
        if (timestamp > 0L) {
            val age = System.currentTimeMillis() - timestamp
            if (age !in -CLOCK_SKEW_MS..FRESH_CLIP_MS) return CopyPoll.Pending
            val seen = synchronized(lock) { lastClipTimestamp }
            if (timestamp == seen) return CopyPoll.Ignore
        }
        val content = try {
            encodeClip(context, clip)
        } catch (e: Exception) {
            Log.w(TAG, "failed to encode clipboard: ${e.message}")
            null
        } ?: return CopyPoll.Pending
        val now = SystemClock.elapsedRealtime()
        if (synchronized(lock) { isOwnWriteLocked(content, now) }) {
            noteTimestamp(timestamp)
            return CopyPoll.Ignore
        }
        return if (publishUserCopy(context, content, timestamp)) {
            CopyPoll.Sent
        } else {
            CopyPoll.Ignore
        }
    }

    fun backgroundCaptureFinished(context: Context) {
        val again = synchronized(lock) {
            captureInFlight = false
            val pending = captureAgain
            captureAgain = false
            pending
        }
        if (again) requestBackgroundCapture(context.applicationContext)
    }

    private fun startWatching(context: Context) {
        val clipboard = clipboard(context) ?: return
        synchronized(lock) {
            if (listener != null) return
            val created = ClipboardManager.OnPrimaryClipChangedListener {
                worker.execute { onClipChanged(context) }
            }
            listener = created
            clipboard.addPrimaryClipChangedListener(created)
        }
    }

    private fun onClipChanged(context: Context) {
        if (!Prefs(context).sendClipboard) return
        if (pollCopy(context) == CopyPoll.Pending &&
            Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q &&
            !hasVisibleActivity()
        ) {
            // Listener ran, but Android 10+ still hid the clip. Read it from a focused window.
            requestBackgroundCapture(context)
        }
    }

    private fun requestBackgroundCapture(context: Context) {
        val app = context.applicationContext
        if (!Prefs(app).sendClipboard) return
        if (!ClipboardAccessibility.isEnabled(app)) {
            Log.w(TAG, "clipboard changed in the background but the accessibility service is off")
            return
        }
        val generation = synchronized(lock) {
            if (captureInFlight) {
                captureAgain = true
                return
            }
            captureInFlight = true
            captureGeneration += 1
            captureGeneration
        }
        mainHandler.post {
            val starter: Context = ClipboardAccessibilityService.instance ?: app
            val intent = Intent(app, ClipboardCaptureActivity::class.java).apply {
                addFlags(
                    Intent.FLAG_ACTIVITY_NEW_TASK or
                        Intent.FLAG_ACTIVITY_NO_ANIMATION or
                        Intent.FLAG_ACTIVITY_EXCLUDE_FROM_RECENTS or
                        Intent.FLAG_ACTIVITY_NO_USER_ACTION,
                )
            }
            val options = ActivityOptions.makeCustomAnimation(app, 0, 0)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.VANILLA_ICE_CREAM) {
                options.pendingIntentBackgroundActivityStartMode =
                    ActivityOptions.MODE_BACKGROUND_ACTIVITY_START_ALLOW_ALWAYS
            } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
                options.pendingIntentBackgroundActivityStartMode =
                    ActivityOptions.MODE_BACKGROUND_ACTIVITY_START_ALLOWED
            }
            try {
                starter.startActivity(intent, options.toBundle())
            } catch (e: Exception) {
                Log.w(TAG, "background clipboard capture was blocked: ${e.message}")
                backgroundCaptureFinished(app)
                return@post
            }
            mainHandler.postDelayed({
                val stuck = synchronized(lock) {
                    captureInFlight && captureGeneration == generation
                }
                if (stuck) {
                    Log.w(TAG, "clipboard capture did not open")
                    backgroundCaptureFinished(app)
                }
            }, CAPTURE_WATCHDOG_MS)
        }
    }

    private fun commit(context: Context, clip: ClipData, echoContent: String) {
        val clipboard = clipboard(context.applicationContext) ?: return
        synchronized(lock) {
            ownWriteFingerprint = fingerprint(echoContent)
            ownWriteUntilMs = SystemClock.elapsedRealtime() + OWN_WRITE_WINDOW_MS
        }
        try {
            clipboard.setPrimaryClip(clip)
        } catch (e: Exception) {
            synchronized(lock) {
                ownWriteFingerprint = null
                ownWriteUntilMs = 0L
            }
            Log.w(TAG, "setPrimaryClip failed: ${e.message}")
        }
    }

    private fun isOwnWriteLocked(content: String, now: Long): Boolean {
        val fp = ownWriteFingerprint ?: return false
        return now <= ownWriteUntilMs && fp == fingerprint(content)
    }

    private fun noteTimestamp(timestamp: Long) {
        if (timestamp <= 0L) return
        synchronized(lock) {
            if (timestamp > lastClipTimestamp) lastClipTimestamp = timestamp
        }
    }

    private fun hasVisibleActivity(): Boolean {
        val state = ActivityManager.RunningAppProcessInfo()
        ActivityManager.getMyMemoryState(state)
        return state.importance == ActivityManager.RunningAppProcessInfo.IMPORTANCE_FOREGROUND
    }

    private fun readClip(context: Context): ClipData? {
        val clipboard = clipboard(context) ?: return null
        val clip = try {
            clipboard.primaryClip
        } catch (_: SecurityException) {
            null
        } ?: return null
        if (clip.itemCount <= 0) return null
        return clip
    }

    private fun encodeClip(context: Context, clip: ClipData): String? {
        val description = clip.description
        // An image clip often also carries a filename. Keep polling until the bytes
        // are readable instead of sending that label.
        if (primaryMime(description).startsWith("image/")) {
            for (index in 0 until clip.itemCount) {
                val item = clip.getItemAt(index)
                encodeClipImage(context, item, imageMime(description, context, item))?.let { return it }
            }
            return null
        }
        val item = clip.getItemAt(0)
        val plain = item.text?.toString()?.takeIf { it.isNotEmpty() }
        if (!plain.isNullOrEmpty()) return limit(plain)
        for (index in 0 until clip.itemCount) {
            val candidate = clip.getItemAt(index)
            if (candidate.uri == null) continue
            encodeClipImage(
                context,
                candidate,
                imageMime(description, context, candidate),
            )?.let { return it }
        }
        val mime = primaryMime(description)
        if (mime.startsWith("text/") || mime.isEmpty()) {
            val text = item.htmlText?.takeIf { it.isNotEmpty() }
                ?: item.coerceToText(context)?.toString()?.takeIf { it.isNotEmpty() }
            if (!text.isNullOrEmpty()) return limit(text)
        }
        return null
    }

    private fun primaryMime(description: android.content.ClipDescription?): String {
        if (description == null || description.mimeTypeCount <= 0) return ""
        return description.getMimeType(0).orEmpty()
    }

    private fun imageMime(
        description: android.content.ClipDescription?,
        context: Context,
        item: ClipData.Item,
    ): String {
        val uri = item.uri
        if (uri != null) {
            val resolved = try {
                context.contentResolver.getType(uri)
            } catch (_: Exception) {
                null
            }
            if (!resolved.isNullOrEmpty()) return resolved
        }
        if (description != null) {
            for (index in 0 until description.mimeTypeCount) {
                val mime = description.getMimeType(index).orEmpty()
                if (mime.startsWith("image/")) return mime
            }
        }
        return "image/*"
    }

    private fun encodeClipImage(context: Context, item: ClipData.Item, primaryMime: String): String? {
        val uri = item.uri ?: return null
        val mime = try {
            context.contentResolver.getType(uri)
        } catch (_: Exception) {
            null
        } ?: primaryMime
        if (!mime.startsWith("image/") && !primaryMime.startsWith("image/")) return null
        val bytes = try {
            context.contentResolver.openInputStream(uri)?.use { it.readBytes() }
        } catch (e: Exception) {
            Log.w(TAG, "failed to read clipboard image: ${e.message}")
            null
        } ?: return null
        if (bytes.isEmpty()) return null
        val subtype = imageSubtype(mime.ifEmpty { primaryMime })
        if (subtype != null) {
            return dataUrl(subtype, bytes)
        }
        val bitmap = BitmapFactory.decodeByteArray(bytes, 0, bytes.size) ?: return null
        val png = ByteArrayOutputStream()
        val compressed = bitmap.compress(Bitmap.CompressFormat.PNG, 100, png)
        bitmap.recycle()
        if (!compressed) return null
        return dataUrl("png", png.toByteArray())
    }

    private fun writeImage(context: Context, bytes: ByteArray, subtype: String, echoContent: String): Boolean {
        val app = context.applicationContext
        val ext = if (subtype == "jpeg") "jpg" else subtype
        val dir = File(app.cacheDir, "clipboard")
        if (!dir.exists() && !dir.mkdirs()) return false
        dir.listFiles()?.forEach { existing ->
            if (existing.isFile) existing.delete()
        }
        val file = File(dir, "clip.$ext")
        return try {
            file.writeBytes(bytes)
            val uri: Uri = FileProvider.getUriForFile(app, "${app.packageName}.fileprovider", file)
            val clip = ClipData.newUri(app.contentResolver, "netsocket image", uri)
            commit(app, clip, echoContent)
            true
        } catch (e: Exception) {
            Log.w(TAG, "failed to write clipboard image: ${e.message}")
            false
        }
    }

    private fun dataUrl(subtype: String, bytes: ByteArray): String? {
        val encoded = Base64.encodeToString(bytes, Base64.NO_WRAP)
        return limit("data:image/$subtype;base64,$encoded")
    }

    private fun imageSubtype(mime: String): String? {
        val normalized = mime.lowercase()
        return when {
            normalized.contains("png") -> "png"
            normalized.contains("jpeg") || normalized.contains("jpg") -> "jpeg"
            normalized.contains("webp") -> "webp"
            else -> null
        }
    }

    private fun limit(value: String): String? {
        return if (value.length > MAX_ENCODED_CHARS) null else value
    }

    private fun fingerprint(content: String): String {
        val digest = MessageDigest.getInstance("SHA-256").digest(content.toByteArray(Charsets.UTF_8))
        return digest.joinToString("") { byte -> "%02x".format(byte) }
    }

    private fun clipboard(context: Context): ClipboardManager? {
        return context.applicationContext.getSystemService(Context.CLIPBOARD_SERVICE) as? ClipboardManager
    }

    private const val CAPTURE_WATCHDOG_MS = 4_000L
}
