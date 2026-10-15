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
        val details = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            Intent(Settings.ACTION_ACCESSIBILITY_DETAILS_SETTINGS).apply {
                putExtra(Intent.EXTRA_COMPONENT_NAME, component.flattenToString())
            }
        } else {
            null
        }
        val fallback = Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS)
        val target = details?.takeIf { it.resolveActivity(context.packageManager) != null } ?: fallback
        target.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        context.startActivity(target)
    }
}
