package com.strayfade.netsocket.notification

import android.accessibilityservice.AccessibilityService
import android.util.Log
import android.view.accessibility.AccessibilityEvent

/**
 * Bound by the system while the user has it enabled.
 *
 * On Android 10+ the clipboard listener is not delivered unless this app is focused,
 * so copy detection has to come from here. The service does not inject input.
 */
class ClipboardAccessibilityService : AccessibilityService() {
    override fun onServiceConnected() {
        instance = this
        ClipboardBridge.syncWatch(this)
    }

    override fun onDestroy() {
        if (instance === this) instance = null
        super.onDestroy()
    }

    override fun onAccessibilityEvent(event: AccessibilityEvent?) {
        if (event == null) return
        try {
            if (!Prefs(this).sendClipboard) return
            if (!ClipboardSignals.isCopySignal(this, event)) return
            Log.i(TAG, "copy signal event=${event.eventType}")
            ClipboardBridge.onCopySignal(this, ClipboardSignals.readDelayMs(event))
        } catch (e: Exception) {
            Log.w(TAG, "clipboard signal failed: ${e.message}")
        }
    }

    override fun onInterrupt() {}

    companion object {
        private const val TAG = "ClipboardA11y"

        @Volatile
        var instance: ClipboardAccessibilityService? = null
            private set
    }
}
