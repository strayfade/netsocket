package com.strayfade.netsocket.notification

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import android.view.KeyEvent
import android.view.inputmethod.EditorInfo
import android.widget.Toast
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.updatePadding
import androidx.recyclerview.widget.LinearLayoutManager
import com.strayfade.netsocket.notification.databinding.ActivityMainBinding

class MainActivity : AppCompatActivity() {
    private lateinit var binding: ActivityMainBinding
    private lateinit var adapter: MessageAdapter
    private var redirectedToVoice = false

    private val notificationPermissionLauncher =
        registerForActivityResult(ActivityResultContracts.RequestPermission()) { }

    private val conversationListener = object : ConversationRepository.Listener {
        override fun onMessagesChanged(messages: List<ChatMessage>) {
            runOnUiThread {
                adapter.submitList(messages.toList()) {
                    if (messages.isNotEmpty()) {
                        binding.messageList.scrollToPosition(messages.lastIndex)
                    }
                }
                binding.emptyState.visibility =
                    if (messages.isEmpty()) android.view.View.VISIBLE else android.view.View.GONE
            }
        }
    }

    private val connectionListener = object : HostConnection.Listener {
        override fun onStateChanged(state: HostConnection.State) {
            runOnUiThread { renderConnection(state) }
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        if (shouldOpenVoiceByDefault(savedInstanceState)) {
            redirectedToVoice = true
            startActivity(Intent(this, VoiceActivity::class.java))
            finish()
            return
        }

        binding = ActivityMainBinding.inflate(layoutInflater)
        setContentView(binding.root)
        applyInsets()

        ConversationRepository.init(this)
        IncomingNotifier.ensureChannel(this)

        adapter = MessageAdapter(MarkdownRenderer.create(this))
        binding.messageList.layoutManager = LinearLayoutManager(this).apply {
            stackFromEnd = true
        }
        binding.messageList.adapter = adapter
        // Show any persisted history immediately.
        adapter.submitList(ConversationRepository.snapshot())
        binding.emptyState.visibility =
            if (ConversationRepository.snapshot().isEmpty()) {
                android.view.View.VISIBLE
            } else {
                android.view.View.GONE
            }
        binding.voiceButton.setOnClickListener {
            startActivity(Intent(this, VoiceActivity::class.java))
        }
        binding.settingsButton.setOnClickListener {
            startActivity(Intent(this, SettingsActivity::class.java))
        }
        binding.clearButton.setOnClickListener {
            confirmClearConversation()
        }
        binding.sendButton.setOnClickListener { sendCurrentCommand() }
        binding.commandInput.setOnEditorActionListener { _, actionId, _ ->
            if (actionId == EditorInfo.IME_ACTION_SEND) {
                sendCurrentCommand()
                true
            } else {
                false
            }
        }
        binding.commandInput.setOnKeyListener { _, keyCode, event ->
            if (keyCode == KeyEvent.KEYCODE_ENTER && event.action == KeyEvent.ACTION_DOWN) {
                if (event.isShiftPressed) {
                    false
                } else {
                    sendCurrentCommand()
                    true
                }
            } else {
                false
            }
        }

        requestPostNotificationsIfNeeded()
        KeepAliveService.start(this)

        if (Prefs(this).commandSecret.isBlank()) {
            // First launch / unconfigured — nudge toward settings.
            Toast.makeText(this, R.string.setup_required_toast, Toast.LENGTH_LONG).show()
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
    }

    private fun shouldOpenVoiceByDefault(savedInstanceState: Bundle?): Boolean {
        if (savedInstanceState != null) return false
        if (intent.getBooleanExtra(EXTRA_SKIP_VOICE_REDIRECT, false)) return false
        if (intent.getBooleanExtra(EXTRA_FOCUS_CHAT, false)) return false
        return Prefs(this).voiceModeDefault
    }

    override fun onStart() {
        super.onStart()
        if (redirectedToVoice || !::binding.isInitialized) return
        ConversationRepository.setChatVisible(true)
        ConversationRepository.addListener(conversationListener)
        HostConnection.addListener(connectionListener)
    }

    override fun onStop() {
        if (::binding.isInitialized && !redirectedToVoice) {
            ConversationRepository.setChatVisible(false)
            ConversationRepository.removeListener(conversationListener)
            HostConnection.removeListener(connectionListener)
        }
        super.onStop()
    }

    private fun confirmClearConversation() {
        if (ConversationRepository.snapshot().isEmpty()) return
        AlertDialog.Builder(this)
            .setTitle(R.string.clear_chat_confirm_title)
            .setMessage(R.string.clear_chat_confirm_message)
            .setPositiveButton(R.string.clear_chat_confirm_positive) { _, _ ->
                ConversationRepository.clear()
            }
            .setNegativeButton(R.string.clear_chat_confirm_negative, null)
            .show()
    }

    private fun sendCurrentCommand() {
        val text = binding.commandInput.text?.toString().orEmpty()
        if (text.isBlank()) return

        val result = ConversationRepository.sendCommand(text)
        when (result) {
            "/settings" -> {
                binding.commandInput.text?.clear()
                startActivity(Intent(this, SettingsActivity::class.java))
            }
            null -> binding.commandInput.text?.clear()
            else -> Toast.makeText(this, result, Toast.LENGTH_SHORT).show()
        }
    }

    private fun renderConnection(state: HostConnection.State) {
        binding.connectionStatus.text = when {
            state.connected -> getString(R.string.status_connected)
            state.connecting -> getString(R.string.status_connecting)
            state.lastError.isNotBlank() -> state.lastError
            else -> getString(R.string.status_disconnected)
        }
        binding.sendButton.isEnabled = true
    }

    private fun applyInsets() {
        ViewCompat.setOnApplyWindowInsetsListener(binding.rootContainer) { view, insets ->
            val systemBars = insets.getInsets(WindowInsetsCompat.Type.systemBars())
            val ime = insets.getInsets(WindowInsetsCompat.Type.ime())
            val bottom = maxOf(systemBars.bottom, ime.bottom)
            view.updatePadding(top = systemBars.top, bottom = bottom)
            insets
        }
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

    companion object {
        const val EXTRA_FOCUS_CHAT = "focus_chat"
        const val EXTRA_SKIP_VOICE_REDIRECT = "skip_voice_redirect"
    }
}
