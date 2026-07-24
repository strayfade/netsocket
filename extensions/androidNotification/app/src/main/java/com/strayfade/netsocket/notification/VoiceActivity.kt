package com.strayfade.netsocket.notification

import android.Manifest
import android.annotation.SuppressLint
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Color
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import android.view.MotionEvent
import android.widget.Toast
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import androidx.constraintlayout.widget.ConstraintLayout
import androidx.core.content.ContextCompat
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import androidx.core.view.updatePadding
import com.strayfade.netsocket.notification.databinding.ActivityVoiceBinding
import java.util.Locale

class VoiceActivity : AppCompatActivity() {
    private lateinit var binding: ActivityVoiceBinding
    private lateinit var speaker: ResponseSpeaker

    private var speechRecognizer: SpeechRecognizer? = null
    private var listening = false
    private var awaitingHoldResult = false
    private var suppressNextError = false
    private var awaitingHost = false
    private var speakNextResponse = false
    private var lastSpokenMessageId: String? = null

    private val mainHandler = Handler(Looper.getMainLooper())

    private val micPermissionLauncher =
        registerForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
            if (!granted) {
                Toast.makeText(this, R.string.voice_permission_needed, Toast.LENGTH_LONG).show()
            }
        }

    private val conversationListener = object : ConversationRepository.Listener {
        override fun onMessagesChanged(messages: List<ChatMessage>) {
            runOnUiThread { maybeSpeakLatest(messages) }
        }

        override fun onAwaitingChanged(awaiting: Boolean) {
            runOnUiThread {
                awaitingHost = awaiting
                if (awaiting) {
                    speakNextResponse = true
                    binding.statusLabel.setText(R.string.voice_hint_awaiting)
                } else if (!listening && !speaker.isSpeaking()) {
                    binding.statusLabel.setText(R.string.voice_hint_idle)
                }
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
        binding = ActivityVoiceBinding.inflate(layoutInflater)
        setContentView(binding.root)
        applyInsets()

        ConversationRepository.init(this)
        IncomingNotifier.ensureChannel(this)
        KeepAliveService.start(this)

        speaker = ResponseSpeaker(this) { speaking ->
            runOnUiThread {
                if (speaking) {
                    binding.statusLabel.setText(R.string.voice_hint_speaking)
                } else if (!awaitingHost && !listening) {
                    binding.statusLabel.setText(R.string.voice_hint_idle)
                }
            }
        }

        binding.chatButton.setOnClickListener {
            startActivity(
                Intent(this, MainActivity::class.java).apply {
                    putExtra(MainActivity.EXTRA_SKIP_VOICE_REDIRECT, true)
                    flags = Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP
                }
            )
            finish()
        }
        binding.clearButton.setOnClickListener { confirmClearConversation() }
        binding.settingsButton.setOnClickListener {
            startActivity(Intent(this, FeaturesActivity::class.java))
        }

        setupHoldButton()
        ensureMicPermission()
    }

    override fun onStart() {
        super.onStart()
        ConversationRepository.setVoiceVisible(true)
        lastSpokenMessageId = ConversationRepository.snapshot()
            .lastOrNull { (it.role == MessageRole.ASSISTANT || it.role == MessageRole.ERROR) && !it.pending }
            ?.id
        speakNextResponse = ConversationRepository.isAwaiting()
        ConversationRepository.addListener(conversationListener)
        HostConnection.addListener(connectionListener)
        renderConnection(HostConnection.currentState())
    }

    override fun onStop() {
        stopListening(cancel = true)
        speaker.stop()
        ConversationRepository.setVoiceVisible(false)
        ConversationRepository.removeListener(conversationListener)
        HostConnection.removeListener(connectionListener)
        super.onStop()
    }

    override fun onDestroy() {
        destroyRecognizer()
        speaker.shutdown()
        super.onDestroy()
    }

    @SuppressLint("ClickableViewAccessibility")
    private fun setupHoldButton() {
        binding.holdButton.setOnTouchListener { _, event ->
            when (event.actionMasked) {
                MotionEvent.ACTION_DOWN -> {
                    beginHoldToTalk()
                    true
                }
                MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL -> {
                    endHoldToTalk()
                    true
                }
                else -> false
            }
        }
    }

    private fun beginHoldToTalk() {
        if (awaitingHost) {
            Toast.makeText(this, R.string.voice_busy, Toast.LENGTH_SHORT).show()
            return
        }
        if (!hasMicPermission()) {
            ensureMicPermission()
            return
        }
        if (!SpeechRecognizer.isRecognitionAvailable(this)) {
            Toast.makeText(this, R.string.voice_recognition_unavailable, Toast.LENGTH_LONG).show()
            return
        }

        speaker.stop()
        awaitingHoldResult = true
        binding.transcriptText.text = ""
        binding.statusLabel.setText(R.string.voice_hint_listening)
        binding.holdButtonLabel.setText(R.string.voice_hold_button_listening)
        binding.holdButton.setBackgroundResource(R.drawable.bg_hold_button_active)
        binding.gradientBackground.setListening(true)
        startListening()
    }

    private fun endHoldToTalk() {
        if (!listening && !awaitingHoldResult) return
        binding.holdButton.setBackgroundResource(R.drawable.bg_hold_button)
        binding.holdButtonLabel.setText(R.string.voice_hold_button)
        binding.gradientBackground.setListening(false)
        if (listening) {
            binding.statusLabel.setText(R.string.voice_hint_processing)
            stopListening(cancel = false)
        }
    }

    private fun startListening() {
        destroyRecognizer()
        val recognizer = SpeechRecognizer.createSpeechRecognizer(this)
        speechRecognizer = recognizer
        recognizer.setRecognitionListener(object : RecognitionListener {
            override fun onReadyForSpeech(params: Bundle?) {
                listening = true
            }

            override fun onBeginningOfSpeech() = Unit

            override fun onRmsChanged(rmsdB: Float) = Unit

            override fun onBufferReceived(buffer: ByteArray?) = Unit

            override fun onEndOfSpeech() {
                listening = false
            }

            override fun onError(error: Int) {
                listening = false
                if (suppressNextError) {
                    suppressNextError = false
                    return
                }
                awaitingHoldResult = false
                resetHoldUi()
                if (!awaitingHost) {
                    binding.statusLabel.setText(R.string.voice_hint_idle)
                }
                if (error != SpeechRecognizer.ERROR_CLIENT &&
                    error != SpeechRecognizer.ERROR_NO_MATCH
                ) {
                    Toast.makeText(this@VoiceActivity, R.string.voice_error, Toast.LENGTH_SHORT).show()
                } else if (error == SpeechRecognizer.ERROR_NO_MATCH) {
                    Toast.makeText(
                        this@VoiceActivity,
                        R.string.voice_empty_transcript,
                        Toast.LENGTH_SHORT
                    ).show()
                }
            }

            override fun onResults(results: Bundle?) {
                listening = false
                awaitingHoldResult = false
                val matches = results
                    ?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)
                    .orEmpty()
                val text = matches.firstOrNull()?.trim().orEmpty()
                handleTranscript(text)
            }

            override fun onPartialResults(partialResults: Bundle?) {
                val matches = partialResults
                    ?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)
                    .orEmpty()
                val partial = matches.firstOrNull()?.trim().orEmpty()
                if (partial.isNotEmpty()) {
                    binding.transcriptText.text = partial
                }
            }

            override fun onEvent(eventType: Int, params: Bundle?) = Unit
        })

        val intent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
            putExtra(
                RecognizerIntent.EXTRA_LANGUAGE_MODEL,
                RecognizerIntent.LANGUAGE_MODEL_FREE_FORM
            )
            putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true)
            putExtra(RecognizerIntent.EXTRA_LANGUAGE, Locale.getDefault())
            putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 1)
            putExtra(RecognizerIntent.EXTRA_CALLING_PACKAGE, packageName)
        }
        runCatching { recognizer.startListening(intent) }
            .onFailure {
                Toast.makeText(this, R.string.voice_error, Toast.LENGTH_SHORT).show()
                resetHoldUi()
            }
    }

    private fun stopListening(cancel: Boolean) {
        val recognizer = speechRecognizer ?: return
        if (cancel) {
            suppressNextError = true
            awaitingHoldResult = false
            runCatching { recognizer.cancel() }
            listening = false
            resetHoldUi()
        } else {
            suppressNextError = true
            runCatching { recognizer.stopListening() }
            mainHandler.postDelayed({ suppressNextError = false }, 750L)
        }
    }

    private fun destroyRecognizer() {
        speechRecognizer?.setRecognitionListener(null)
        runCatching { speechRecognizer?.destroy() }
        speechRecognizer = null
        listening = false
    }

    private fun handleTranscript(text: String) {
        resetHoldUi()
        if (text.isBlank()) {
            Toast.makeText(this, R.string.voice_empty_transcript, Toast.LENGTH_SHORT).show()
            binding.statusLabel.setText(R.string.voice_hint_idle)
            return
        }
        binding.transcriptText.text = text
        val result = ConversationRepository.sendCommand(text)
        when (result) {
            "/settings" -> {
                startActivity(Intent(this, FeaturesActivity::class.java))
                binding.statusLabel.setText(R.string.voice_hint_idle)
            }
            null -> binding.statusLabel.setText(R.string.voice_hint_awaiting)
            else -> {
                Toast.makeText(this, result, Toast.LENGTH_SHORT).show()
                binding.statusLabel.setText(R.string.voice_hint_idle)
            }
        }
    }

    private fun maybeSpeakLatest(messages: List<ChatMessage>) {
        if (!ConversationRepository.isVoiceVisible()) return
        if (!speakNextResponse) return
        val latest = messages.lastOrNull {
            (it.role == MessageRole.ASSISTANT || it.role == MessageRole.ERROR) && !it.pending
        } ?: return
        if (latest.id == lastSpokenMessageId) return
        lastSpokenMessageId = latest.id
        speakNextResponse = false
        if (latest.text.isBlank()) return
        speaker.speak(latest.text)
        binding.transcriptText.text = SpokenText.forSpeech(latest.text)
    }

    private fun resetHoldUi() {
        binding.holdButton.setBackgroundResource(R.drawable.bg_hold_button)
        binding.holdButtonLabel.setText(R.string.voice_hold_button)
        binding.gradientBackground.setListening(false)
    }

    private fun confirmClearConversation() {
        if (ConversationRepository.snapshot().isEmpty()) return
        AlertDialog.Builder(this)
            .setTitle(R.string.clear_chat_confirm_title)
            .setMessage(R.string.clear_chat_confirm_message)
            .setPositiveButton(R.string.clear_chat_confirm_positive) { _, _ ->
                speaker.stop()
                ConversationRepository.clear()
                binding.transcriptText.text = ""
                binding.statusLabel.setText(R.string.voice_hint_idle)
                lastSpokenMessageId = null
                speakNextResponse = false
            }
            .setNegativeButton(R.string.clear_chat_confirm_negative, null)
            .show()
    }

    private fun renderConnection(state: HostConnection.State) {
        binding.connectionStatus.text = when {
            state.connected -> getString(R.string.status_connected)
            state.authStatus == "pending" -> getString(R.string.status_pending)
            state.authStatus == "denied" -> getString(R.string.status_denied)
            state.connecting -> getString(R.string.status_connecting)
            state.lastError.isNotBlank() -> state.lastError
            else -> getString(R.string.status_disconnected)
        }
    }

    private fun applyInsets() {
        WindowCompat.setDecorFitsSystemWindows(window, false)
        window.statusBarColor = Color.TRANSPARENT
        window.navigationBarColor = Color.TRANSPARENT
        WindowInsetsControllerCompat(window, window.decorView).apply {
            isAppearanceLightStatusBars = false
            isAppearanceLightNavigationBars = false
        }

        // Keep content clear of system bars; leave the gradient full-bleed on the root.
        val topBarBaseTop = binding.topBar.paddingTop
        val holdBaseBottom =
            (binding.holdButton.layoutParams as ConstraintLayout.LayoutParams).bottomMargin

        ViewCompat.setOnApplyWindowInsetsListener(binding.rootContainer) { _, insets ->
            val systemBars = insets.getInsets(WindowInsetsCompat.Type.systemBars())
            binding.topBar.updatePadding(top = systemBars.top + topBarBaseTop)
            val holdLp = binding.holdButton.layoutParams as ConstraintLayout.LayoutParams
            holdLp.bottomMargin = systemBars.bottom + holdBaseBottom
            binding.holdButton.layoutParams = holdLp
            insets
        }
    }

    private fun hasMicPermission(): Boolean {
        return ContextCompat.checkSelfPermission(
            this,
            Manifest.permission.RECORD_AUDIO
        ) == PackageManager.PERMISSION_GRANTED
    }

    private fun ensureMicPermission() {
        if (!hasMicPermission()) {
            micPermissionLauncher.launch(Manifest.permission.RECORD_AUDIO)
        }
    }
}
