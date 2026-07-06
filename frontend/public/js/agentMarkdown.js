(function () {
    'use strict'

    const escapeHtml = (text) => String(text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')

    const safeHref = (url) => {
        const trimmed = String(url || '').trim()
        if (/^(https?:|mailto:)/i.test(trimmed)) {
            return escapeHtml(trimmed)
        }
        return '#'
    }

    const inlineMarkdown = (text) => {
        let result = escapeHtml(text)
        result = result.replace(/`([^`]+)`/g, '<code>$1</code>')
        result = result.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
        result = result.replace(/\*([^*]+)\*/g, '<em>$1</em>')
        result = result.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_match, label, href) => {
            const safe = safeHref(href)
            const external = /^https?:/i.test(String(href || '').trim())
            const rel = external ? ' rel="noopener noreferrer" target="_blank"' : ''
            return `<a href="${safe}"${rel}>${label}</a>`
        })
        return result
    }

    const markdownToHtml = (markdown) => {
        const lines = String(markdown || '').replace(/\r\n/g, '\n').split('\n')
        const html = []
        let inCode = false
        let codeLines = []
        let listType = null

        const flushList = () => {
            if (listType) {
                html.push(`</${listType}>`)
                listType = null
            }
        }

        for (const line of lines) {
            if (line.trim().startsWith('```')) {
                flushList()
                if (!inCode) {
                    inCode = true
                    codeLines = []
                } else {
                    html.push(`<pre><code>${escapeHtml(codeLines.join('\n'))}</code></pre>`)
                    inCode = false
                }
                continue
            }

            if (inCode) {
                codeLines.push(line)
                continue
            }

            const heading = line.match(/^(#{1,6})\s+(.*)$/)
            if (heading) {
                flushList()
                const level = heading[1].length
                html.push(`<h${level}>${inlineMarkdown(heading[2])}</h${level}>`)
                continue
            }

            const ul = line.match(/^\s*[-*]\s+(.*)$/)
            if (ul) {
                if (listType !== 'ul') {
                    flushList()
                    html.push('<ul>')
                    listType = 'ul'
                }
                html.push(`<li>${inlineMarkdown(ul[1])}</li>`)
                continue
            }

            const ol = line.match(/^\s*\d+\.\s+(.*)$/)
            if (ol) {
                if (listType !== 'ol') {
                    flushList()
                    html.push('<ol>')
                    listType = 'ol'
                }
                html.push(`<li>${inlineMarkdown(ol[1])}</li>`)
                continue
            }

            if (line.trim() === '') {
                flushList()
                continue
            }

            flushList()
            html.push(`<p>${inlineMarkdown(line)}</p>`)
        }

        flushList()
        if (inCode) {
            html.push(`<pre><code>${escapeHtml(codeLines.join('\n'))}</code></pre>`)
        }

        return html.join('\n')
    }

    window.renderAgentMarkdown = markdownToHtml
})()
