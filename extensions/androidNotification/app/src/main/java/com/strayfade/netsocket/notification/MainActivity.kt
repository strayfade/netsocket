package com.strayfade.netsocket.notification

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.PowerManager
import android.provider.Settings
import android.widget.Toast
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import com.strayfade.netsocket.notification.databinding.ActivityMainBinding

class MainActivity : AppCompatActivity() {
    private lateinit var binding: ActivityMainBinding
    private lateinit var prefs: Prefs

    private val notificationPermissionLauncher =
        registerForActivityResult(ActivityResultContracts.RequestPermission()) {
            refreshStatus()
        }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityMainBinding.inflate(layoutInflater)
        setContentView(binding.root)
        prefs = Prefs(this)

        binding.hostInput.setText(prefs.host)
        binding.portInput.setText(prefs.port)
        binding.secretInput.setText(prefs.secret)
        binding.httpsSwitch.isChecked = prefs.useHttps
        binding.forwardingSwitch.isChecked = prefs.forwardingEnabled
        updateEndpointPreview()

        binding.hostInput.setOnFocusChangeListener { _, hasFocus ->
            if (!hasFocus) updateEndpointPreview()
        }
        binding.portInput.setOnFocusChangeListener { _, hasFocus ->
            if (!hasFocus) updateEndpointPreview()
        }
        binding.secretInput.setOnFocusChangeListener { _, hasFocus ->
            if (!hasFocus) updateEndpointPreview()
        }
        binding.httpsSwitch.setOnCheckedChangeListener { _, _ ->
            updateEndpointPreview()
        }

        binding.saveButton.setOnClickListener { saveSettings() }
        binding.openListenerButton.setOnClickListener {
            startActivity(Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS))
        }
        binding.batteryButton.setOnClickListener { requestBatteryExemption() }
        binding.startServiceButton.setOnClickListener {
            KeepAliveService.start(this)
            Toast.makeText(this, R.string.keepalive_started, Toast.LENGTH_SHORT).show()
            refreshStatus()
        }

        requestPostNotificationsIfNeeded()
        KeepAliveService.start(this)
        binding.deviceIdValue.text = DeviceId.get(this)
    }

    override fun onResume() {
        super.onResume()
        refreshStatus()
    }

    private fun saveSettings() {
        prefs.host = binding.hostInput.text?.toString().orEmpty()
        prefs.port = binding.portInput.text?.toString().orEmpty()
        prefs.secret = binding.secretInput.text?.toString().orEmpty()
        prefs.useHttps = binding.httpsSwitch.isChecked
        prefs.forwardingEnabled = binding.forwardingSwitch.isChecked
        updateEndpointPreview()
        Toast.makeText(this, R.string.settings_saved, Toast.LENGTH_SHORT).show()
        refreshStatus()
    }

    private fun updateEndpointPreview() {
        binding.endpointPreview.text = Prefs.buildEndpointUrl(
            host = binding.hostInput.text?.toString().orEmpty(),
            port = binding.portInput.text?.toString().orEmpty(),
            useHttps = binding.httpsSwitch.isChecked,
            secret = binding.secretInput.text?.toString().orEmpty()
        )
    }

    private fun refreshStatus() {
        val listenerEnabled = isNotificationListenerEnabled()
        val batteryUnrestricted = isIgnoringBatteryOptimizations()
        binding.listenerStatus.text = getString(
            if (listenerEnabled) R.string.status_listener_enabled else R.string.status_listener_disabled
        )
        binding.batteryStatus.text = getString(
            if (batteryUnrestricted) R.string.status_battery_ok else R.string.status_battery_restricted
        )
        updateEndpointPreview()
    }

    private fun isNotificationListenerEnabled(): Boolean {
        val enabled = NotificationManagerCompat.getEnabledListenerPackages(this)
        return enabled.contains(packageName)
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

    private fun requestPostNotificationsIfNeeded() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) {
            return
        }
        val granted = ContextCompat.checkSelfPermission(
            this,
            Manifest.permission.POST_NOTIFICATIONS
        ) == PackageManager.PERMISSION_GRANTED
        if (!granted) {
            notificationPermissionLauncher.launch(Manifest.permission.POST_NOTIFICATIONS)
        }
    }

}
