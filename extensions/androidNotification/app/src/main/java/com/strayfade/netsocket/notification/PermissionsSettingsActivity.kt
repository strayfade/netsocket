package com.strayfade.netsocket.notification

import android.Manifest
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.PowerManager
import android.provider.Settings
import android.widget.Toast
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import com.strayfade.netsocket.notification.databinding.ActivitySettingsPermissionsBinding

class PermissionsSettingsActivity : AppCompatActivity() {
    private lateinit var binding: ActivitySettingsPermissionsBinding

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivitySettingsPermissionsBinding.inflate(layoutInflater)
        setContentView(binding.root)
        SettingsUi.applyInsets(this, binding.rootContainer)

        binding.backButton.setOnClickListener { finish() }
        binding.openListenerButton.setOnClickListener {
            startActivity(Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS))
        }
        binding.batteryButton.setOnClickListener { requestBatteryExemption() }
        binding.disableRedactionButton.setOnClickListener { disableNotificationRedaction() }
        binding.startServiceButton.setOnClickListener {
            KeepAliveService.start(this)
            Toast.makeText(this, R.string.keepalive_started, Toast.LENGTH_SHORT).show()
            refreshStatus()
        }

        KeepAliveService.start(this)
    }

    override fun onResume() {
        super.onResume()
        refreshStatus()
    }

    private fun refreshStatus() {
        val listenerEnabled = NotificationManagerCompat
            .getEnabledListenerPackages(this)
            .contains(packageName)
        val batteryUnrestricted = isIgnoringBatteryOptimizations()
        binding.listenerStatus.text = getString(
            if (listenerEnabled) R.string.status_listener_enabled else R.string.status_listener_disabled
        )
        binding.batteryStatus.text = getString(
            if (batteryUnrestricted) R.string.status_battery_ok else R.string.status_battery_restricted
        )
        binding.redactionStatus.text = getString(
            if (isEnhancedNotificationsEnabled()) R.string.status_redaction_on else R.string.status_redaction_off
        )
    }

    private fun isIgnoringBatteryOptimizations(): Boolean {
        val powerManager = getSystemService(POWER_SERVICE) as PowerManager
        return powerManager.isIgnoringBatteryOptimizations(packageName)
    }

    private fun requestBatteryExemption() {
        if (isIgnoringBatteryOptimizations()) {
            Toast.makeText(this, R.string.status_battery_ok, Toast.LENGTH_SHORT).show()
            return
        }
        val intent = Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS).apply {
            data = Uri.parse("package:$packageName")
        }
        startActivity(intent)
    }

    private fun isEnhancedNotificationsEnabled(): Boolean {
        val value = Settings.Secure.getString(contentResolver, NOTIFICATION_ASSISTANT)
        return value == null || value.isNotEmpty()
    }

    private fun hasWriteSecureSettings(): Boolean {
        return ContextCompat.checkSelfPermission(
            this,
            Manifest.permission.WRITE_SECURE_SETTINGS
        ) == PackageManager.PERMISSION_GRANTED
    }

    private fun disableNotificationRedaction() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.VANILLA_ICE_CREAM) {
            Toast.makeText(this, R.string.redaction_not_needed_toast, Toast.LENGTH_SHORT).show()
        }

        if (!isEnhancedNotificationsEnabled()) {
            Toast.makeText(this, R.string.redaction_already_off_toast, Toast.LENGTH_SHORT).show()
            refreshStatus()
            return
        }

        if (!hasWriteSecureSettings()) {
            showRedactionInstructionsDialog()
            return
        }

        val success = try {
            Settings.Secure.putString(contentResolver, NOTIFICATION_ASSISTANT, "")
        } catch (_: Exception) {
            false
        }

        if (success && !isEnhancedNotificationsEnabled()) {
            Toast.makeText(this, R.string.redaction_disabled_toast, Toast.LENGTH_LONG).show()
        } else {
            Toast.makeText(this, R.string.redaction_failed_toast, Toast.LENGTH_LONG).show()
        }
        refreshStatus()
    }

    private fun showRedactionInstructionsDialog() {
        val command = "adb shell pm grant $packageName android.permission.WRITE_SECURE_SETTINGS"
        AlertDialog.Builder(this)
            .setTitle(R.string.redaction_dialog_title)
            .setMessage(getString(R.string.redaction_dialog_message, packageName))
            .setPositiveButton(R.string.redaction_dialog_open_settings) { _, _ ->
                openNotificationSettings()
            }
            .setNeutralButton(R.string.redaction_dialog_copy_cmd) { _, _ ->
                val clipboard = getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
                clipboard.setPrimaryClip(ClipData.newPlainText("adb command", command))
                Toast.makeText(this, R.string.redaction_cmd_copied_toast, Toast.LENGTH_SHORT).show()
            }
            .setNegativeButton(R.string.redaction_dialog_close, null)
            .show()
    }

    private fun openNotificationSettings() {
        val intent = Intent("android.settings.NOTIFICATION_SETTINGS")
        if (intent.resolveActivity(packageManager) != null) {
            startActivity(intent)
        } else {
            startActivity(Intent(Settings.ACTION_SETTINGS))
        }
    }

    companion object {
        private const val NOTIFICATION_ASSISTANT = "notification_assistant"
    }
}
