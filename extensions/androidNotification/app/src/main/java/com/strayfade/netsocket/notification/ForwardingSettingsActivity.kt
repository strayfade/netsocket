package com.strayfade.netsocket.notification

import android.os.Bundle
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import com.strayfade.netsocket.notification.databinding.ActivitySettingsForwardingBinding

class ForwardingSettingsActivity : AppCompatActivity() {
    private lateinit var binding: ActivitySettingsForwardingBinding
    private lateinit var prefs: Prefs

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivitySettingsForwardingBinding.inflate(layoutInflater)
        setContentView(binding.root)
        SettingsUi.applyInsets(this, binding.rootContainer)
        prefs = Prefs(this)

        binding.secretInput.setText(prefs.notificationSecret)
        binding.forwardingSwitch.isChecked = prefs.forwardingEnabled
        updatePreview()

        binding.secretInput.setOnFocusChangeListener { _, hasFocus ->
            if (!hasFocus) updatePreview()
        }

        binding.backButton.setOnClickListener { finish() }
        binding.saveButton.setOnClickListener { save() }
    }

    private fun updatePreview() {
        binding.endpointPreview.text = Prefs.buildEndpointUrl(
            host = prefs.host,
            port = prefs.port,
            useHttps = prefs.useHttps,
            secret = binding.secretInput.text?.toString().orEmpty()
        )
    }

    private fun save() {
        prefs.notificationSecret = binding.secretInput.text?.toString().orEmpty()
        prefs.forwardingEnabled = binding.forwardingSwitch.isChecked
        updatePreview()
        Toast.makeText(this, R.string.settings_saved, Toast.LENGTH_SHORT).show()
    }
}
