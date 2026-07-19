package com.strayfade.netsocket.notification

import android.content.Context
import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.Typeface
import android.text.Spanned
import android.text.TextPaint
import android.text.style.LeadingMarginSpan
import android.text.style.LineBackgroundSpan
import android.text.style.MetricAffectingSpan
import androidx.core.content.ContextCompat
import androidx.core.content.res.ResourcesCompat
import io.noties.markwon.AbstractMarkwonPlugin
import io.noties.markwon.Markwon
import io.noties.markwon.MarkwonVisitor
import io.noties.markwon.SoftBreakAddsNewLinePlugin
import io.noties.markwon.core.MarkwonTheme
import io.noties.markwon.ext.strikethrough.StrikethroughPlugin
import io.noties.markwon.ext.tables.TablePlugin
import io.noties.markwon.ext.tables.TableTheme
import io.noties.markwon.html.HtmlPlugin
import io.noties.markwon.html.HtmlTag
import io.noties.markwon.html.MarkwonHtmlRenderer
import io.noties.markwon.html.TagHandler
import io.noties.markwon.linkify.LinkifyPlugin
import java.util.Collections

object MarkdownRenderer {
    fun create(context: Context): Markwon {
        val tableTheme = TableTheme.Builder()
            .tableBorderColor(ContextCompat.getColor(context, R.color.netsocket_outline))
            .tableBorderWidth(1)
            .tableCellPadding((8 * context.resources.displayMetrics.density).toInt())
            .tableHeaderRowBackgroundColor(
                ContextCompat.getColor(context, R.color.netsocket_surface_variant)
            )
            .tableOddRowBackgroundColor(ContextCompat.getColor(context, R.color.netsocket_background))
            .tableEvenRowBackgroundColor(
                ContextCompat.getColor(context, R.color.netsocket_surface_variant)
            )
            .build()

        val geistMono = ResourcesCompat.getFont(context, R.font.geist_mono) ?: Typeface.MONOSPACE
        val geistBold = ResourcesCompat.getFont(context, R.font.geist_bold) ?: Typeface.DEFAULT_BOLD

        return Markwon.builder(context)
            .usePlugin(SoftBreakAddsNewLinePlugin.create())
            .usePlugin(StrikethroughPlugin.create())
            .usePlugin(LinkifyPlugin.create())
            .usePlugin(TablePlugin.create(tableTheme))
            .usePlugin(
                HtmlPlugin.create { plugin ->
                    plugin.addHandler(AlertTagHandler(context, geistBold))
                }
            )
            .usePlugin(object : AbstractMarkwonPlugin() {
                override fun processMarkdown(markdown: String): String {
                    return AlertMarkdown.preprocess(markdown)
                }

                override fun configureTheme(builder: MarkwonTheme.Builder) {
                    builder
                        .codeTypeface(geistMono)
                        .codeTextColor(ContextCompat.getColor(context, R.color.netsocket_on_background))
                        .codeBackgroundColor(
                            ContextCompat.getColor(context, R.color.netsocket_surface_variant)
                        )
                        .blockQuoteColor(ContextCompat.getColor(context, R.color.netsocket_outline))
                        .linkColor(ContextCompat.getColor(context, R.color.netsocket_link))
                }
            })
            .build()
    }
}

/** Converts GitHub-style Markdown Alerts into custom HTML tags Markwon can style. */
object AlertMarkdown {
    private val BLOCK = Regex(
        pattern = """(?ms)^>[ \t]*\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\][ \t]*\R((?:^>.*\R?)*)""",
        option = RegexOption.IGNORE_CASE
    )

    fun preprocess(source: String): String {
        return BLOCK.replace(source) { match ->
            val type = match.groupValues[1].lowercase()
            val body = match.groupValues[2]
                .lineSequence()
                .map { line -> line.replace(Regex("^>[ \\t]?"), "") }
                .joinToString("\n")
                .trim()
            val escaped = body
                .replace("&", "&amp;")
                .replace("<", "&lt;")
                .replace(">", "&gt;")
            "\n\n<netsocket-alert type=\"$type\">$escaped</netsocket-alert>\n\n"
        }
    }
}

private class AlertTagHandler(
    context: Context,
    private val boldTypeface: Typeface,
) : TagHandler() {
    private val density = context.resources.displayMetrics.density
    private val colors = mapOf(
        "note" to AlertStyle(
            ContextCompat.getColor(context, R.color.alert_note_bg),
            ContextCompat.getColor(context, R.color.alert_note_accent),
            "Note"
        ),
        "tip" to AlertStyle(
            ContextCompat.getColor(context, R.color.alert_tip_bg),
            ContextCompat.getColor(context, R.color.alert_tip_accent),
            "Tip"
        ),
        "important" to AlertStyle(
            ContextCompat.getColor(context, R.color.alert_important_bg),
            ContextCompat.getColor(context, R.color.alert_important_accent),
            "Important"
        ),
        "warning" to AlertStyle(
            ContextCompat.getColor(context, R.color.alert_warning_bg),
            ContextCompat.getColor(context, R.color.alert_warning_accent),
            "Warning"
        ),
        "caution" to AlertStyle(
            ContextCompat.getColor(context, R.color.alert_caution_bg),
            ContextCompat.getColor(context, R.color.alert_caution_accent),
            "Caution"
        ),
    )

    override fun supportedTags(): Collection<String> =
        Collections.singleton("netsocket-alert")

    override fun handle(
        visitor: MarkwonVisitor,
        renderer: MarkwonHtmlRenderer,
        tag: HtmlTag
    ) {
        if (!tag.isBlock) return
        val block = tag as HtmlTag.Block
        val type = block.attributes()["type"]?.lowercase().orEmpty()
        val style = colors[type] ?: colors.getValue("note")
        val start = visitor.length()

        val titleStart = visitor.length()
        visitor.builder().append(style.title)
        val titleEnd = visitor.length()
        visitor.builder().setSpan(
            BoldSpan(boldTypeface),
            titleStart,
            titleEnd,
            Spanned.SPAN_EXCLUSIVE_EXCLUSIVE
        )
        visitor.builder().append('\n')

        visitChildren(visitor, renderer, block)

        val end = visitor.length()
        if (end > start) {
            val padding = (10 * density).toInt()
            val accent = (4 * density).toInt()
            visitor.builder().setSpan(
                AlertBackgroundSpan(style.background, style.accent),
                start,
                end,
                Spanned.SPAN_EXCLUSIVE_EXCLUSIVE
            )
            visitor.builder().setSpan(
                LeadingMarginSpan.Standard(padding + accent),
                start,
                end,
                Spanned.SPAN_EXCLUSIVE_EXCLUSIVE
            )
        }

        if (visitor.builder().isNotEmpty() &&
            visitor.builder()[visitor.builder().length - 1] != '\n'
        ) {
            visitor.forceNewLine()
        }
        visitor.forceNewLine()
    }

    private data class AlertStyle(
        val background: Int,
        val accent: Int,
        val title: String,
    )
}

private class BoldSpan(
    private val typeface: Typeface,
) : MetricAffectingSpan() {
    override fun updateDrawState(tp: TextPaint) {
        tp.typeface = typeface
    }

    override fun updateMeasureState(textPaint: TextPaint) {
        textPaint.typeface = typeface
    }
}

private class AlertBackgroundSpan(
    private val background: Int,
    private val accent: Int,
) : LineBackgroundSpan {
    private val bgPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = background }
    private val accentPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = accent }

    override fun drawBackground(
        canvas: Canvas,
        paint: Paint,
        left: Int,
        right: Int,
        top: Int,
        baseline: Int,
        bottom: Int,
        text: CharSequence,
        start: Int,
        end: Int,
        lineNumber: Int
    ) {
        canvas.drawRect(left.toFloat(), top.toFloat(), right.toFloat(), bottom.toFloat(), bgPaint)
        canvas.drawRect(
            left.toFloat(),
            top.toFloat(),
            left + 8f,
            bottom.toFloat(),
            accentPaint
        )
    }
}
