package com.strayfade.netsocket.notification

import android.content.Intent
import android.os.Bundle
import androidx.appcompat.app.AppCompatActivity
import com.strayfade.netsocket.notification.databinding.ActivitySettingsBinding

/** Settings hub — opens category pages. */
class SettingsActivity : AppCompatActivity() {
    private lateinit var binding: ActivitySettingsBinding

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivitySettingsBinding.inflate(layoutInflater)
        setContentView(binding.root)
        SettingsUi.applyInsets(this, binding.rootContainer)

        binding.backButton.setOnClickListener { finish() }
        binding.rowGeneral.setOnClickListener {
            startActivity(Intent(this, GeneralSettingsActivity::class.java))
        }
        binding.rowCommand.setOnClickListener {
            startActivity(Intent(this, CommandSettingsActivity::class.java))
        }
        binding.rowForwarding.setOnClickListener {
            startActivity(Intent(this, ForwardingSettingsActivity::class.java))
        }
        binding.rowPermissions.setOnClickListener {
            startActivity(Intent(this, PermissionsSettingsActivity::class.java))
        }
    }
}
