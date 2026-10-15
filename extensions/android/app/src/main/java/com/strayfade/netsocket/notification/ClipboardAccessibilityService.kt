package com.strayfade.netsocket.notification

import android.accessibilityservice.AccessibilityService
import android.view.accessibility.AccessibilityEvent

/**
 * Bound by the system while the user has it enabled. That binding is what lets
 * Android 10+ start [ClipboardCaptureActivity] from the background so a copy can
 * be read. The service does not observe the screen or inject input.
 */
class ClipboardAccessibilityService : AccessibilityService() {
    override fun onServiceConnected() {
        instance = this
    }

    override fun onDestroy() {
        if (instance === this) instance = null
        super.onDestroy()
    }

    override fun onAccessibilityEvent(event: AccessibilityEvent?) {}

    override fun onInterrupt() {}

    companion object {
        @Volatile
        var instance: ClipboardAccessibilityService? = null
            private set
    }
}
