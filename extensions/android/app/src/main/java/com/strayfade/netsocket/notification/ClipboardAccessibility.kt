package com.strayfade.netsocket.notification

import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.os.Build
import android.provider.Settings
import android.view.accessibility.AccessibilityManager

object ClipboardAccessibility {
    fun isRequired(): Boolean = Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q

    fun isEnabled(context: Context): Boolean {
        val expected = ComponentName(context, ClipboardAccessibilityService::class.java)
        val manager = context.getSystemService(Context.ACCESSIBILITY_SERVICE) as? AccessibilityManager
        val enabled = manager?.getEnabledAccessibilityServiceList(
            android.accessibilityservice.AccessibilityServiceInfo.FEEDBACK_ALL_MASK
        ).orEmpty()
        if (enabled.any { info ->
                val service = info.resolveInfo?.serviceInfo ?: return@any false
                ComponentName(service.packageName, service.name) == expected
            }
        ) {
            return true
        }
        val raw = Settings.Secure.getString(
            context.contentResolver,
            Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES
        ).orEmpty()
        return raw.split(':').any { flattened ->
            ComponentName.unflattenFromString(flattened) == expected
        }
    }

    fun openSettings(context: Context) {
        val component = ComponentName(context, ClipboardAccessibilityService::class.java)
        val details = Intent(ACTION_ACCESSIBILITY_DETAILS_SETTINGS).apply {
            putExtra(EXTRA_COMPONENT_NAME, component.flattenToString())
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        val fallback = Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS).apply {
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        val target = if (details.resolveActivity(context.packageManager) != null) details else fallback
        context.startActivity(target)
    }

    private const val ACTION_ACCESSIBILITY_DETAILS_SETTINGS =
        "android.settings.ACCESSIBILITY_DETAILS_SETTINGS"
    private const val EXTRA_COMPONENT_NAME = "android.intent.extra.COMPONENT_NAME"
}
