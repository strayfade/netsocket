package com.strayfade.netsocket.notification

import android.app.Activity
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.View
import android.view.WindowManager

/**
 * One-shot focused window. Android 10+ only returns clipboard contents to the
 * focused app, so this activity takes focus just long enough to read, then closes.
 */
class ClipboardCaptureActivity : Activity() {
    private val mainHandler = Handler(Looper.getMainLooper())
    private var published = false
    private val giveUp = Runnable { finishQuietly() }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            splashScreen.setOnExitAnimationListener { splash -> splash.remove() }
        }
        setContentView(View(this))
        window.setLayout(1, 1)
        window.addFlags(WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL)
        overridePendingTransition(0, 0)
        mainHandler.postDelayed(giveUp, CAPTURE_TIMEOUT_MS)
    }

    override fun onResume() {
        super.onResume()
        window.decorView.post { capture(finishIfEmpty = false) }
    }

    override fun onWindowFocusChanged(hasFocus: Boolean) {
        super.onWindowFocusChanged(hasFocus)
        if (hasFocus) capture(finishIfEmpty = true)
    }

    override fun onDestroy() {
        mainHandler.removeCallbacks(giveUp)
        ClipboardBridge.backgroundCaptureFinished(this)
        super.onDestroy()
    }

    private fun capture(finishIfEmpty: Boolean) {
        if (published || isFinishing) return
        val content = ClipboardBridge.readNow(this)
        if (content.isNullOrEmpty()) {
            if (finishIfEmpty) finishQuietly()
            return
        }
        published = true
        ClipboardBridge.publishUserCopy(this, content)
        finishQuietly()
    }

    private fun finishQuietly() {
        if (isFinishing) return
        published = true
        finish()
        overridePendingTransition(0, 0)
    }

    companion object {
        private const val CAPTURE_TIMEOUT_MS = 1500L
    }
}
