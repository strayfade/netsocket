package com.strayfade.netsocket.notification

import android.content.Intent
import android.os.Bundle
import androidx.appcompat.app.AppCompatActivity
import com.strayfade.netsocket.notification.databinding.ActivityFeaturesBinding

/** Features hub — Authenticator, Panel, Website, and Settings. */
class FeaturesActivity : AppCompatActivity() {
    private lateinit var binding: ActivityFeaturesBinding

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityFeaturesBinding.inflate(layoutInflater)
        setContentView(binding.root)
        SettingsUi.applyInsets(this, binding.rootContainer)

        binding.backButton.setOnClickListener { finish() }
        binding.rowAuthenticator.setOnClickListener {
            startActivity(Intent(this, AuthenticatorActivity::class.java))
        }
        binding.rowWebsite.setOnClickListener {
            startActivity(Intent(this, BrowserActivity::class.java))
        }
        binding.rowPanel.setOnClickListener {
            startActivity(Intent(this, PanelActivity::class.java))
        }
        binding.rowSettings.setOnClickListener {
            startActivity(Intent(this, SettingsActivity::class.java))
        }
    }
}
