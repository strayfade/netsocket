'use strict'

const escapeHtml = (text) => String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')

const inlineMarkdown = (text) => {
    let result = escapeHtml(text)
    result = result.replace(/`([^`]+)`/g, '<code>$1</code>')
    result = result.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    result = result.replace(/\*([^*]+)\*/g, '<em>$1</em>')
    result = result.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>')
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

const levenshteinDistance = (a, b) => {
    const left = String(a)
    const right = String(b)
    const rows = left.length + 1
    const cols = right.length + 1
    const matrix = Array.from({ length: rows }, () => Array(cols).fill(0))

    for (let i = 0; i < rows; i++) matrix[i][0] = i
    for (let j = 0; j < cols; j++) matrix[0][j] = j

    for (let i = 1; i < rows; i++) {
        for (let j = 1; j < cols; j++) {
            const cost = left[i - 1] === right[j - 1] ? 0 : 1
            matrix[i][j] = Math.min(
                matrix[i - 1][j] + 1,
                matrix[i][j - 1] + 1,
                matrix[i - 1][j - 1] + cost
            )
        }
    }

    return matrix[rows - 1][cols - 1]
}

const fuzzyMatchScore = (a, b) => {
    const left = String(a)
    const right = String(b)
    if (left.length === 0 && right.length === 0) {
        return 1
    }
    const maxLen = Math.max(left.length, right.length)
    if (maxLen === 0) {
        return 1
    }
    const distance = levenshteinDistance(left, right)
    return 1 - distance / maxLen
}

module.exports = {
    markdownToHtml,
    fuzzyMatchScore,
    levenshteinDistance,
}
