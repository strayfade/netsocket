package com.strayfade.netsocket.notification

import android.content.Context
import android.media.AudioAttributes
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.speech.tts.TextToSpeech
import android.speech.tts.UtteranceProgressListener
import android.speech.tts.Voice
import java.util.Locale
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicInteger

/**
 * Prefers Google's highest-quality neural / WaveNet / Studio voices (including
 * network voices when available) and speaks in sentence chunks for a more
 * natural cadence than dumping the full reply at once.
 */
class ResponseSpeaker(
    context: Context,
    private val onSpeakingChanged: (Boolean) -> Unit = {},
) : TextToSpeech.OnInitListener {
    private val appContext = context.applicationContext
    private val mainHandler = Handler(Looper.getMainLooper())
    private var tts: TextToSpeech? = TextToSpeech(appContext, this, GOOGLE_TTS_ENGINE)
    private val ready = AtomicBoolean(false)
    private val activeUtterances = AtomicInteger(0)
    private var speaking = false
    private var generation = 0

    override fun onInit(status: Int) {
        var engine = tts
        if (status != TextToSpeech.SUCCESS || engine == null) {
            // Fall back to the device default engine if Google TTS isn't installed.
            engine?.shutdown()
            engine = TextToSpeech(appContext, { fallbackStatus ->
                finishInit(fallbackStatus)
            })
            tts = engine
            return
        }
        finishInit(status)
    }

    private fun finishInit(status: Int) {
        val engine = tts ?: return
        if (status != TextToSpeech.SUCCESS) {
            ready.set(false)
            return
        }
        ready.set(true)
        engine.language = Locale.getDefault()
        // Slightly under 1.0 reads more naturally with neural voices.
        engine.setSpeechRate(0.92f)
        engine.setPitch(1.0f)
        engine.setAudioAttributes(
            AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_ASSISTANT)
                .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
                .build()
        )
        pickBestVoice(engine)?.let { engine.voice = it }
        engine.setOnUtteranceProgressListener(object : UtteranceProgressListener() {
            override fun onStart(utteranceId: String?) {
                if (activeUtterances.getAndIncrement() == 0) {
                    speaking = true
                    onSpeakingChanged(true)
                }
            }

            override fun onDone(utteranceId: String?) {
                if (activeUtterances.decrementAndGet() <= 0) {
                    activeUtterances.set(0)
                    speaking = false
                    onSpeakingChanged(false)
                }
            }

            @Deprecated("Deprecated in Java")
            override fun onError(utteranceId: String?) {
                onDone(utteranceId)
            }

            override fun onError(utteranceId: String?, errorCode: Int) {
                onDone(utteranceId)
            }
        })
    }

    fun speak(raw: String) {
        val engine = tts ?: return
        if (!ready.get()) return
        val text = SpokenText.forSpeech(raw)
        if (text.isBlank()) return

        stop()
        val chunks = SpokenText.chunks(text)
        if (chunks.isEmpty()) return

        val gen = ++generation
        val params = Bundle()
        chunks.forEachIndexed { index, chunk ->
            val mode = if (index == 0) TextToSpeech.QUEUE_FLUSH else TextToSpeech.QUEUE_ADD
            engine.speak(chunk, mode, params, "netsocket-voice-$gen-$index")
        }
    }

    fun stop() {
        generation++
        mainHandler.removeCallbacksAndMessages(null)
        tts?.stop()
        activeUtterances.set(0)
        if (speaking) {
            speaking = false
            onSpeakingChanged(false)
        }
    }

    fun shutdown() {
        stop()
        tts?.shutdown()
        tts = null
        ready.set(false)
    }

    fun isSpeaking(): Boolean = speaking

    private fun pickBestVoice(engine: TextToSpeech): Voice? {
        val voices = runCatching { engine.voices }.getOrNull().orEmpty()
        if (voices.isEmpty()) return null

        val locale = Locale.getDefault()
        val language = locale.language

        fun score(voice: Voice): Int {
            var points = 0
            if (voice.locale.language.equals(language, ignoreCase = true)) points += 120
            if (voice.locale.country.equals(locale.country, ignoreCase = true)) points += 50

            points += when {
                voice.quality >= Voice.QUALITY_VERY_HIGH -> 40
                voice.quality >= Voice.QUALITY_HIGH -> 25
                voice.quality >= Voice.QUALITY_NORMAL -> 10
                else -> 0
            }

            val name = voice.name.lowercase(Locale.US)
            // Explicitly favor the most human-sounding Google families.
            when {
                name.contains("studio") -> points += 80
                name.contains("journey") || name.contains("chirp") -> points += 70
                name.contains("wavenet") || name.contains("neural2") -> points += 60
                name.contains("neural") || name.contains("natural") -> points += 50
                name.contains("news") || name.contains("polyglot") -> points += 35
            }

            // Network neural voices are usually more realistic than compressed local ones.
            if (voice.isNetworkConnectionRequired &&
                (name.contains("wavenet") ||
                    name.contains("neural") ||
                    name.contains("studio") ||
                    name.contains("journey") ||
                    name.contains("chirp"))
            ) {
                points += 45
            } else if (!voice.isNetworkConnectionRequired) {
                points += 10
            }

            if (name.contains("dumb") || name.contains("robot")) {
                points -= 80
            }
            return points
        }

        return voices.maxByOrNull(::score)
    }

    companion object {
        private const val GOOGLE_TTS_ENGINE = "com.google.android.tts"
    }
}

object SpokenText {
    private val markdownNoise = Regex(
        """(\*\*|__|~~|`+|#{1,6}\s*|!\[[^\]]*]\([^)]*\)|\[[^\]]*]\([^)]*\)|>\s*|[-*+]\s+|\d+\.\s+)"""
    )
    private val multiSpace = Regex("""\s+""")
    private val sentenceSplit = Regex("""(?<=[.!?])\s+""")

    fun forSpeech(raw: String): String {
        return raw
            .replace(markdownNoise, " ")
            .replace(multiSpace, " ")
            .trim()
    }

    fun chunks(text: String): List<String> {
        val parts = text.split(sentenceSplit).map { it.trim() }.filter { it.isNotEmpty() }
        if (parts.isEmpty()) return emptyList()
        // Keep very short fragments attached so cadence stays natural.
        val merged = mutableListOf<String>()
        for (part in parts) {
            val last = merged.lastOrNull()
            if (last != null && last.length < 48) {
                merged[merged.lastIndex] = "$last $part"
            } else {
                merged.add(part)
            }
        }
        return merged
    }
}
