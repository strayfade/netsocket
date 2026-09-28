package com.strayfade.netsocket.notification

import android.os.Bundle
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import com.strayfade.netsocket.notification.databinding.ActivitySettingsCommandBinding

class CommandSettingsActivity : AppCompatActivity() {
    private lateinit var binding: ActivitySettingsCommandBinding
    private lateinit var prefs: Prefs

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivitySettingsCommandBinding.inflate(layoutInflater)
        setContentView(binding.root)
        SettingsUi.applyInsets(this, binding.rootContainer)
        prefs = Prefs(this)

        binding.commandSecretInput.setText(prefs.commandSecret)
        binding.responseTimeoutInput.setText(prefs.responseTimeoutSeconds.toString())

        binding.backButton.setOnClickListener { finish() }
        binding.saveButton.setOnClickListener { save() }
    }

    private fun save() {
        prefs.commandSecret = binding.commandSecretInput.text?.toString().orEmpty()
        prefs.responseTimeoutSeconds =
            binding.responseTimeoutInput.text?.toString()?.toIntOrNull()
                ?: Prefs.DEFAULT_RESPONSE_TIMEOUT_SECONDS
        HostConnection.reconnect()
        KeepAliveService.start(this)
        Toast.makeText(this, R.string.settings_saved, Toast.LENGTH_SHORT).show()
    }
}
