package com.strayfade.netsocket.notification

import android.app.Activity
import android.view.View
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.updatePadding

object SettingsUi {
    fun applyInsets(activity: Activity, root: View) {
        val basePadding = (20 * activity.resources.displayMetrics.density).toInt()
        ViewCompat.setOnApplyWindowInsetsListener(root) { view, insets ->
            val systemBars = insets.getInsets(WindowInsetsCompat.Type.systemBars())
            view.updatePadding(
                top = basePadding + systemBars.top,
                bottom = basePadding + systemBars.bottom
            )
            insets
        }
    }
}
