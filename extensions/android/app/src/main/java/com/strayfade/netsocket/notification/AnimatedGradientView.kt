package com.strayfade.netsocket.notification

import android.animation.ValueAnimator
import android.content.Context
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.LinearGradient
import android.graphics.Paint
import android.graphics.PorterDuff
import android.graphics.PorterDuffXfermode
import android.graphics.Shader
import android.os.SystemClock
import android.util.AttributeSet
import android.view.View
import android.view.animation.LinearInterpolator
import androidx.core.content.ContextCompat
import kotlin.math.cos
import kotlin.math.sin

/**
 * Full-bleed animated color field. The entire page is painted with layered
 * linear gradients whose stops drift on a continuous clock (no cycle reset jump).
 */
class AnimatedGradientView @JvmOverloads constructor(
    context: Context,
    attrs: AttributeSet? = null,
    defStyleAttr: Int = 0,
) : View(context, attrs, defStyleAttr) {

    private val paint = Paint(Paint.ANTI_ALIAS_FLAG)
    private val blendPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        xfermode = PorterDuffXfermode(PorterDuff.Mode.SRC_OVER)
    }

    private val palette: IntArray
    private var animator: ValueAnimator? = null
    private var startMs = 0L
    private var intensity = 1f

    init {
        setLayerType(LAYER_TYPE_HARDWARE, null)
        palette = intArrayOf(
            ContextCompat.getColor(context, R.color.voice_orb_teal),
            ContextCompat.getColor(context, R.color.voice_orb_cyan),
            ContextCompat.getColor(context, R.color.voice_orb_magenta),
            ContextCompat.getColor(context, R.color.voice_orb_coral),
            ContextCompat.getColor(context, R.color.voice_orb_amber),
            ContextCompat.getColor(context, R.color.voice_bg_mid),
            ContextCompat.getColor(context, R.color.voice_orb_teal), // closes the loop
        )
    }

    fun setListening(listening: Boolean) {
        intensity = if (listening) 1.2f else 1f
        invalidate()
    }

    override fun onAttachedToWindow() {
        super.onAttachedToWindow()
        if (animator == null) {
            startMs = SystemClock.elapsedRealtime()
            animator = ValueAnimator.ofFloat(0f, 1f).apply {
                duration = 16_000L
                repeatCount = ValueAnimator.INFINITE
                interpolator = LinearInterpolator()
                addUpdateListener { invalidate() }
                start()
            }
        }
    }

    override fun onDetachedFromWindow() {
        animator?.cancel()
        animator = null
        super.onDetachedFromWindow()
    }

    override fun onDraw(canvas: Canvas) {
        val w = width.toFloat()
        val h = height.toFloat()
        if (w <= 0f || h <= 0f) return

        val t = (SystemClock.elapsedRealtime() - startMs) / 1000f

        // Layer 1 — primary diagonal wash covering the full page.
        val angle1 = t * 0.18f
        paint.shader = fullBleedGradient(
            w, h, angle1,
            colorsAt(t * 0.08f, boost = intensity),
        )
        canvas.drawRect(0f, 0f, w, h, paint)

        // Layer 2 — cross-angle wash for depth (semi-transparent).
        val angle2 = 1.1f + t * -0.14f
        blendPaint.shader = fullBleedGradient(
            w, h, angle2,
            colorsAt(t * 0.08f + 0.33f, alphaScale = 0.72f * intensity),
        )
        canvas.drawRect(0f, 0f, w, h, blendPaint)

        // Layer 3 — slow vertical drift so the field never looks static.
        val angle3 = 0.55f + t * 0.09f
        blendPaint.shader = fullBleedGradient(
            w, h, angle3,
            colorsAt(t * 0.05f + 0.66f, alphaScale = 0.58f * intensity),
        )
        canvas.drawRect(0f, 0f, w, h, blendPaint)

        paint.shader = null
        blendPaint.shader = null
    }

    private fun fullBleedGradient(w: Float, h: Float, angle: Float, colors: IntArray): LinearGradient {
        val cx = w * 0.5f
        val cy = h * 0.5f
        // Extend past the corners so the gradient always covers the full page.
        val reach = (w + h) * 0.75f
        val dx = cos(angle.toDouble()).toFloat() * reach
        val dy = sin(angle.toDouble()).toFloat() * reach
        return LinearGradient(
            cx - dx,
            cy - dy,
            cx + dx,
            cy + dy,
            colors,
            null,
            Shader.TileMode.CLAMP,
        )
    }

    /** Samples [count] colors from the looping palette at phase [u] (any real). */
    private fun colorsAt(u: Float, count: Int = 5, alphaScale: Float = 1f, boost: Float = 1f): IntArray {
        val span = palette.size - 1
        return IntArray(count) { i ->
            val pos = ((u + i.toFloat() / count) % 1f + 1f) % 1f
            val scaled = pos * span
            val idx = scaled.toInt().coerceIn(0, span - 1)
            val frac = scaled - idx
            val mixed = lerpColor(palette[idx], palette[idx + 1], frac)
            adjust(mixed, alphaScale = alphaScale, boost = boost)
        }
    }

    private fun lerpColor(a: Int, b: Int, t: Float): Int {
        val clamped = t.coerceIn(0f, 1f)
        val ar = Color.red(a)
        val ag = Color.green(a)
        val ab = Color.blue(a)
        val br = Color.red(b)
        val bg = Color.green(b)
        val bb = Color.blue(b)
        return Color.rgb(
            (ar + (br - ar) * clamped).toInt(),
            (ag + (bg - ag) * clamped).toInt(),
            (ab + (bb - ab) * clamped).toInt(),
        )
    }

    private fun adjust(color: Int, alphaScale: Float, boost: Float): Int {
        val hsv = FloatArray(3)
        Color.colorToHSV(color, hsv)
        // Push chroma so the field reads vivid rather than washed-out.
        hsv[1] = (hsv[1] * 1.4f).coerceIn(0f, 1f)
        hsv[2] = (hsv[2] * boost).coerceIn(0f, 1f)
        val saturated = Color.HSVToColor((255f * alphaScale.coerceIn(0f, 1f)).toInt(), hsv)
        return saturated
    }
}
