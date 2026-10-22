package com.strayfade.netsocket.notification

import android.app.Activity
import android.graphics.Color
import android.graphics.drawable.ColorDrawable
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.View
import android.view.WindowManager

/**
 * One-shot focused window. Android 10+ only returns clipboard contents to the
 * focused app, so this activity takes focus just long enough to read, then closes.
 *
 * The clip is often still null on the first focus callback, and a 1px window is
 * easy for the system to ignore. Poll until a fresh clip is readable.
 */
class ClipboardCaptureActivity : Activity() {
    private val mainHandler = Handler(Looper.getMainLooper())
    private var closed = false
    private val poll = Runnable { pollOnce() }
    private val giveUp = Runnable { finishQuietly() }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            runCatching {
                splashScreen.setOnExitAnimationListener { splash -> splash.remove() }
            }
        }
        window.setBackgroundDrawable(ColorDrawable(Color.TRANSPARENT))
        window.setDimAmount(0f)
        window.addFlags(WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL)
        window.clearFlags(WindowManager.LayoutParams.FLAG_DIM_BEHIND)
        setContentView(
            View(this).apply {
                setBackgroundColor(Color.TRANSPARENT)
                importantForAccessibility = View.IMPORTANT_FOR_ACCESSIBILITY_NO
            },
        )
        // A tiny floating window never becomes the focused UID on some devices,
        // so the clipboard read stays null. Fill the overlay instead.
        window.setLayout(
            WindowManager.LayoutParams.MATCH_PARENT,
            WindowManager.LayoutParams.MATCH_PARENT,
        )
        overridePendingTransition(0, 0)
        mainHandler.postDelayed(giveUp, CAPTURE_TIMEOUT_MS)
    }

    override fun onResume() {
        super.onResume()
        val decor = window.decorView
        decor.isFocusable = true
        decor.isFocusableInTouchMode = true
        decor.requestFocus()
        schedulePoll(0L)
    }

    override fun onWindowFocusChanged(hasFocus: Boolean) {
        super.onWindowFocusChanged(hasFocus)
        if (hasFocus) schedulePoll(0L)
    }

    override fun onDestroy() {
        mainHandler.removeCallbacks(giveUp)
        mainHandler.removeCallbacks(poll)
        ClipboardBridge.backgroundCaptureFinished(this)
        super.onDestroy()
    }

    private fun pollOnce() {
        if (closed || isFinishing) return
        when (ClipboardBridge.pollCopy(this)) {
            ClipboardBridge.CopyPoll.Pending -> schedulePoll(POLL_INTERVAL_MS)
            ClipboardBridge.CopyPoll.Sent,
            ClipboardBridge.CopyPoll.Ignore,
            -> finishQuietly()
        }
    }

    private fun schedulePoll(delayMs: Long) {
        mainHandler.removeCallbacks(poll)
        if (!closed && !isFinishing) mainHandler.postDelayed(poll, delayMs)
    }

    private fun finishQuietly() {
        if (closed || isFinishing) return
        closed = true
        mainHandler.removeCallbacks(poll)
        mainHandler.removeCallbacks(giveUp)
        finish()
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            overrideActivityTransition(OVERRIDE_TRANSITION_CLOSE, 0, 0)
        }
        overridePendingTransition(0, 0)
    }

    companion object {
        private const val POLL_INTERVAL_MS = 50L
        private const val CAPTURE_TIMEOUT_MS = 1200L
    }
}
