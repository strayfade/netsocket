package com.strayfade.netsocket.notification

import android.os.Bundle
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import com.strayfade.netsocket.notification.databinding.ActivitySettingsGeneralBinding

class GeneralSettingsActivity : AppCompatActivity() {
    private lateinit var binding: ActivitySettingsGeneralBinding
    private lateinit var prefs: Prefs

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivitySettingsGeneralBinding.inflate(layoutInflater)
        setContentView(binding.root)
        SettingsUi.applyInsets(this, binding.rootContainer)
        prefs = Prefs(this)

        binding.hostInput.setText(prefs.host)
        binding.portInput.setText(prefs.port)
        binding.httpsSwitch.isChecked = prefs.useHttps
        binding.voiceDefaultSwitch.isChecked = prefs.voiceModeDefault
        binding.deviceIdValue.text = DeviceId.get(this)
        updatePreview()

        binding.hostInput.setOnFocusChangeListener { _, hasFocus ->
            if (!hasFocus) updatePreview()
        }
        binding.portInput.setOnFocusChangeListener { _, hasFocus ->
            if (!hasFocus) updatePreview()
        }
        binding.httpsSwitch.setOnCheckedChangeListener { _, _ -> updatePreview() }

        binding.backButton.setOnClickListener { finish() }
        binding.saveButton.setOnClickListener { save() }
    }

    private fun updatePreview() {
        binding.wsEndpointPreview.text = Prefs.buildWebSocketUrl(
            host = binding.hostInput.text?.toString().orEmpty(),
            port = binding.portInput.text?.toString().orEmpty(),
            useHttps = binding.httpsSwitch.isChecked
        )
    }

    private fun save() {
        prefs.host = binding.hostInput.text?.toString().orEmpty()
        prefs.port = binding.portInput.text?.toString().orEmpty()
        prefs.useHttps = binding.httpsSwitch.isChecked
        prefs.voiceModeDefault = binding.voiceDefaultSwitch.isChecked
        updatePreview()
        HostConnection.reconnect()
        KeepAliveService.start(this)
        Toast.makeText(this, R.string.settings_saved, Toast.LENGTH_SHORT).show()
    }
}
