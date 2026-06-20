'use strict'

const { tool, jsonSchema } = require('ai')
const { log, logColors } = require('../log')

const DEFAULT_USER_AGENT = 'Netsocket-DeepResearch/1.0'
const DEFAULT_FETCH_TIMEOUT_MS = 15000
const DEFAULT_MAX_RESPONSE_BYTES = 1024 * 1024
const DEFAULT_MAX_PAGE_TEXT_CHARS = 12000
const DEFAULT_MAX_SEARCH_RESULTS = 5
const DEFAULT_SOURCE_TEXT_CHARS = 2500
const LOG_PREFIX = '[Deep Research]'

function truncateForLog(value, maxLen = 120) {
    const text = typeof value === 'string'
        ? value.replace(/\s+/g, ' ').trim()
        : JSON.stringify(value)
    if (!text) return ''
    return text.length <= maxLen ? text : `${text.slice(0, maxLen)}...`
}

function researchLog(message, colors = logColors.Default) {
    log(`${LOG_PREFIX} ${message}`, colors)
}

const HTML_ENTITIES = {
    '&amp;': '&',
    '&lt;': '<',
    '&gt;': '>',
    '&quot;': '"',
    '&#39;': "'",
    '&nbsp;': ' ',
}

function decodeHtmlEntities(text) {
    if (typeof text !== 'string') return ''
    let result = text.replace(/&#(\d+);/g, (_, code) => {
        const n = Number(code)
        return Number.isFinite(n) ? String.fromCharCode(n) : _
    })
    result = result.replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => {
        const n = parseInt(hex, 16)
        return Number.isFinite(n) ? String.fromCharCode(n) : _
    })
    for (const [entity, char] of Object.entries(HTML_ENTITIES)) {
        result = result.split(entity).join(char)
    }
    return result
}

function htmlToText(html, maxChars = DEFAULT_MAX_PAGE_TEXT_CHARS) {
    if (typeof html !== 'string' || !html) return ''

    let text = html
        .replace(/<script[\s\S]*?<\/script>/gi, ' ')
        .replace(/<style[\s\S]*?<\/style>/gi, ' ')
        .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
        .replace(/<!--[\s\S]*?-->/g, ' ')
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/(p|div|h[1-6]|li|tr|section|article)>/gi, '\n')
        .replace(/<[^>]+>/g, ' ')

    text = decodeHtmlEntities(text)
    text = text.replace(/\r\n/g, '\n').replace(/[ \t\f\v]+/g, ' ')
    text = text.replace(/\n{3,}/g, '\n\n').trim()

    if (text.length > maxChars) {
        text = `${text.slice(0, maxChars)}\n...[truncated]`
    }
    return text
}

function extractTitle(html) {
    if (typeof html !== 'string') return ''
    const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)
    if (!match) return ''
    return decodeHtmlEntities(match[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim())
}

function isPrivateIpv4(host) {
    const parts = host.split('.').map((part) => Number(part))
    if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
        return false
    }
    if (parts[0] === 10) return true
    if (parts[0] === 127) return true
    if (parts[0] === 169 && parts[1] === 254) return true
    if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true
    if (parts[0] === 192 && parts[1] === 168) return true
    if (parts[0] === 0) return true
    return false
}

function isBlockedHostname(hostname) {
    const host = String(hostname || '').toLowerCase().replace(/\.$/, '')
    if (!host) return true
    if (host === 'localhost' || host.endsWith('.localhost')) return true
    if (host === '0.0.0.0') return true
    if (host.startsWith('127.')) return true
    if (host === '::1' || host === '[::1]') return true
    if (host.startsWith('fe80:') || host.startsWith('fc') || host.startsWith('fd')) return true
    if (/^\d+\.\d+\.\d+\.\d+$/.test(host) && isPrivateIpv4(host)) return true
    return false
}

function isAllowedUrl(rawUrl) {
    try {
        const url = new URL(rawUrl)
        if (url.protocol !== 'http:' && url.protocol !== 'https:') return false
        if (url.username || url.password) return false
        return !isBlockedHostname(url.hostname)
    } catch (_) {
        return false
    }
}

function parseDuckDuckGoHtmlResults(html, maxResults = DEFAULT_MAX_SEARCH_RESULTS) {
    if (typeof html !== 'string' || !html) return []

    const results = []
    const linkPattern = /class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi

    for (const match of html.matchAll(linkPattern)) {
        const url = decodeHtmlEntities(match[1].trim())
        const title = htmlToText(match[2], 300)
        if (!url || !title) continue
        if (!isAllowedUrl(url)) continue

        const blockStart = Math.max(0, match.index - 200)
        const blockEnd = Math.min(html.length, match.index + 1200)
        const block = html.slice(blockStart, blockEnd)
        const snippetMatch = block.match(/class="result__snippet"[^>]*>([\s\S]*?)<\/a>/i)
            || block.match(/class="result__snippet"[^>]*>([\s\S]*?)<\/div>/i)
        const snippet = snippetMatch ? htmlToText(snippetMatch[1], 500) : ''

        results.push({ title, url, snippet })
        if (results.length >= maxResults) break
    }

    return results
}

function parseDuckDuckGoInstantResults(payload, maxResults = DEFAULT_MAX_SEARCH_RESULTS) {
    const results = []
    if (!payload || typeof payload !== 'object') return results

    if (payload.AbstractText && payload.AbstractURL && isAllowedUrl(payload.AbstractURL)) {
        results.push({
            title: payload.Heading || 'Summary',
            url: payload.AbstractURL,
            snippet: String(payload.AbstractText),
        })
    }

    const related = Array.isArray(payload.RelatedTopics) ? payload.RelatedTopics : []
    for (const item of related) {
        if (results.length >= maxResults) break
        if (item && Array.isArray(item.Topics)) {
            for (const topic of item.Topics) {
                if (results.length >= maxResults) break
                if (!topic || !topic.Text || !topic.FirstURL) continue
                if (!isAllowedUrl(topic.FirstURL)) continue
                results.push({
                    title: topic.Text.split(' - ')[0] || topic.Text,
                    url: topic.FirstURL,
                    snippet: topic.Text,
                })
            }
            continue
        }
        if (!item || !item.Text || !item.FirstURL) continue
        if (!isAllowedUrl(item.FirstURL)) continue
        results.push({
            title: item.Text.split(' - ')[0] || item.Text,
            url: item.FirstURL,
            snippet: item.Text,
        })
    }

    return results.slice(0, maxResults)
}

async function fetchWithLimits(url, options = {}) {
    const {
        fetchFn = globalThis.fetch,
        timeoutMs = DEFAULT_FETCH_TIMEOUT_MS,
        maxBytes = DEFAULT_MAX_RESPONSE_BYTES,
        userAgent = DEFAULT_USER_AGENT,
        method = 'GET',
        body,
        headers = {},
    } = options

    if (!isAllowedUrl(url)) {
        throw new Error('URL is not allowed')
    }

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)

    try {
        const response = await fetchFn(url, {
            method,
            headers: {
                'User-Agent': userAgent,
                Accept: 'text/html,application/json,text/plain,*/*',
                ...headers,
            },
            body,
            signal: controller.signal,
            redirect: 'follow',
        })

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`)
        }

        const reader = response.body && typeof response.body.getReader === 'function'
            ? response.body.getReader()
            : null

        let received = 0
        const chunks = []

        if (reader) {
            while (true) {
                const { done, value } = await reader.read()
                if (done) break
                received += value.byteLength
                if (received > maxBytes) {
                    throw new Error('Response too large')
                }
                chunks.push(value)
            }
        } else {
            const buffer = Buffer.from(await response.arrayBuffer())
            if (buffer.length > maxBytes) {
                throw new Error('Response too large')
            }
            chunks.push(buffer)
        }

        const text = Buffer.concat(chunks.map((chunk) => Buffer.from(chunk))).toString('utf8')
        return {
            text,
            contentType: response.headers.get('content-type') || '',
            finalUrl: response.url || url,
        }
    } finally {
        clearTimeout(timer)
    }
}

function excerptForQuery(text, query, maxChars = DEFAULT_SOURCE_TEXT_CHARS) {
    if (typeof text !== 'string' || !text) return ''
    if (text.length <= maxChars) return text

    const terms = String(query || '').toLowerCase()
        .split(/\s+/)
        .filter((term) => term.length > 2)

    const paragraphs = text.split(/\n\n+/).map((part) => part.trim()).filter(Boolean)
    if (paragraphs.length === 0) {
        return `${text.slice(0, maxChars)}...[truncated]`
    }

    const scored = paragraphs.map((paragraph) => {
        const lower = paragraph.toLowerCase()
        const score = terms.reduce((sum, term) => sum + (lower.includes(term) ? 1 : 0), 0)
        return { paragraph, score }
    })
    scored.sort((a, b) => b.score - a.score)

    let excerpt = ''
    for (const { paragraph } of scored) {
        const next = excerpt ? `${excerpt}\n\n${paragraph}` : paragraph
        if (next.length > maxChars) {
            if (!excerpt) excerpt = paragraph.slice(0, maxChars)
            break
        }
        excerpt = next
    }

    if (!excerpt) excerpt = text.slice(0, maxChars)
    if (excerpt.length > maxChars) excerpt = excerpt.slice(0, maxChars)
    if (excerpt.length < text.length) excerpt += '...[truncated]'
    return excerpt
}

function buildResearchContext(sources) {
    return sources.map((source) => (
        `[Source ${source.index}] ${source.title}\nURL: ${source.url}\nContent:\n${source.text}`
    )).join('\n\n---\n\n')
}

function formatAnswerWithSources(consensus, sources) {
    const body = String(consensus || '').trim()
    const lines = sources.map((source) => `[${source.index}] ${source.title} - ${source.url}`)
    if (lines.length === 0) return body
    if (!body) return `Sources:\n${lines.join('\n')}`
    return `${body}\n\nSources:\n${lines.join('\n')}`
}

async function gatherSearchSourceContent(query, options = {}) {
    const search = await webSearch(query, options)
    if (search.results.length === 0) {
        return {
            query: search.query,
            sources: [],
            error: search.error || 'No search results found',
        }
    }

    const perSourceChars = Number(options.sourceTextChars) > 0
        ? Number(options.sourceTextChars)
        : DEFAULT_SOURCE_TEXT_CHARS

    if (!options.silent) {
        researchLog(`Reading full text from ${search.results.length} search result(s)`)
    }

    const enriched = await Promise.all(search.results.map(async (hit, index) => {
        const sourceNum = index + 1
        if (!options.silent) {
            researchLog(`Source ${sourceNum}/${search.results.length}: ${hit.url}`)
        }

        const page = await readWebPage(hit.url, {
            fetchFn: options.fetchFn,
            timeoutMs: options.timeoutMs,
            maxBytes: options.maxBytes,
            userAgent: options.userAgent,
            maxPageTextChars: options.maxPageTextChars || DEFAULT_MAX_PAGE_TEXT_CHARS,
            silent: options.silent,
        })

        const rawText = page.text || hit.snippet || ''
        const text = excerptForQuery(rawText, search.query, perSourceChars)

        if (!options.silent) {
            if (page.text) {
                researchLog(
                    `Source ${sourceNum} parsed ${page.text.length} chars -> ${text.length} char excerpt`,
                    logColors.Success
                )
            } else if (page.error) {
                researchLog(`Source ${sourceNum} fetch failed; using snippet fallback`, logColors.Warning)
            }
        }

        return {
            index: sourceNum,
            title: page.title || hit.title,
            url: page.url || hit.url,
            snippet: hit.snippet,
            text,
            readError: page.error,
        }
    }))

    const sources = enriched.filter((source) => source.text)
    if (sources.length === 0) {
        return {
            query: search.query,
            sources: [],
            error: 'Could not extract text from any search results',
        }
    }

    if (!options.silent) {
        researchLog(
            `Extracted text from ${sources.length}/${search.results.length} source(s)`,
            logColors.Success
        )
    }

    return { query: search.query, sources }
}

async function webSearch(query, options = {}) {
    const q = String(query || '').trim()
    if (!q) return { query: q, results: [], error: 'Query is empty' }

    const fetchFn = options.fetchFn || globalThis.fetch
    const maxResults = Number(options.maxResults) > 0
        ? Math.min(Number(options.maxResults), 10)
        : DEFAULT_MAX_SEARCH_RESULTS

    if (!options.silent) {
        researchLog(`Searching web: "${truncateForLog(q, 80)}"`)
    }

    try {
        const instantUrl = `https://api.duckduckgo.com/?q=${encodeURIComponent(q)}&format=json&no_html=1&skip_disambig=1`
        const instantResponse = await fetchWithLimits(instantUrl, {
            fetchFn,
            timeoutMs: options.timeoutMs,
            maxBytes: options.maxBytes,
            userAgent: options.userAgent,
        })
        const instantPayload = JSON.parse(instantResponse.text)
        let results = parseDuckDuckGoInstantResults(instantPayload, maxResults)

        if (results.length < maxResults) {
            if (!options.silent) {
                researchLog('Instant results sparse; querying HTML search fallback')
            }
            const htmlUrl = 'https://html.duckduckgo.com/html/'
            const htmlResponse = await fetchWithLimits(htmlUrl, {
                fetchFn,
                timeoutMs: options.timeoutMs,
                maxBytes: options.maxBytes,
                userAgent: options.userAgent,
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                },
                body: `q=${encodeURIComponent(q)}`,
            })
            const htmlResults = parseDuckDuckGoHtmlResults(htmlResponse.text, maxResults)
            const seen = new Set(results.map((item) => item.url))
            for (const item of htmlResults) {
                if (seen.has(item.url)) continue
                results.push(item)
                seen.add(item.url)
                if (results.length >= maxResults) break
            }
        }

        if (!options.silent) {
            if (results.length > 0) {
                researchLog(`Search returned ${results.length} result(s)`, logColors.Success)
                for (const [index, item] of results.entries()) {
                    researchLog(`  ${index + 1}. ${truncateForLog(item.title, 80)} (${item.url})`)
                }
            } else {
                researchLog('Search returned no results', logColors.Warning)
            }
        }

        return { query: q, results }
    } catch (e) {
        researchLog(`Web search failed: ${e.message}`, logColors.Error)
        return { query: q, results: [], error: e.message }
    }
}

async function readWebPage(url, options = {}) {
    const targetUrl = String(url || '').trim()
    if (!targetUrl) return { url: targetUrl, error: 'URL is empty' }
    if (!isAllowedUrl(targetUrl)) {
        if (!options.silent) {
            researchLog(`Blocked page read: ${truncateForLog(targetUrl, 80)}`, logColors.Warning)
        }
        return { url: targetUrl, error: 'URL is not allowed' }
    }

    if (!options.silent) {
        researchLog(`Reading page: ${targetUrl}`)
    }

    try {
        const response = await fetchWithLimits(targetUrl, {
            fetchFn: options.fetchFn || globalThis.fetch,
            timeoutMs: options.timeoutMs,
            maxBytes: options.maxBytes,
            userAgent: options.userAgent,
        })

        const title = extractTitle(response.text)
        const text = htmlToText(response.text, options.maxPageTextChars || DEFAULT_MAX_PAGE_TEXT_CHARS)

        if (!options.silent) {
            const label = title ? `"${truncateForLog(title, 80)}"` : targetUrl
            researchLog(`Read page ${label} (${text.length} chars)`, logColors.Success)
        }

        return {
            url: response.finalUrl || targetUrl,
            title,
            text,
            contentType: response.contentType,
        }
    } catch (e) {
        researchLog(`Failed to read web page: ${e.message}`, logColors.Error)
        return { url: targetUrl, error: e.message }
    }
}

function createWebResearchTools(options = {}) {
    const toolOptions = {
        fetchFn: options.fetchFn,
        timeoutMs: options.timeoutMs,
        maxBytes: options.maxBytes,
        userAgent: options.userAgent,
        maxPageTextChars: options.maxPageTextChars,
        maxSearchResults: options.maxSearchResults,
        silent: options.silent,
    }

    return {
        web_search: tool({
            description: 'Search the public web for pages relevant to a query. Fetches each result, extracts plain text from HTML, and returns concise excerpts.',
            inputSchema: jsonSchema({
                type: 'object',
                properties: {
                    query: {
                        type: 'string',
                        description: 'Search query describing what to look up.',
                    },
                    maxResults: {
                        type: 'integer',
                        description: 'Maximum number of results to return (1-10).',
                        minimum: 1,
                        maximum: 10,
                    },
                },
                required: ['query'],
                additionalProperties: false,
            }),
            execute: async ({ query, maxResults }) => {
                if (!toolOptions.silent) {
                    researchLog(`Tool invoked: web_search`)
                }
                const gathered = await gatherSearchSourceContent(query, {
                    ...toolOptions,
                    maxResults: maxResults || toolOptions.maxSearchResults,
                })
                return {
                    query: gathered.query,
                    results: gathered.sources.map((source) => ({
                        title: source.title,
                        url: source.url,
                        snippet: source.snippet,
                        text: source.text,
                        readError: source.readError,
                    })),
                    error: gathered.error,
                }
            },
        }),
        read_web_page: tool({
            description: 'Fetch a public web page and return its readable text content.',
            inputSchema: jsonSchema({
                type: 'object',
                properties: {
                    url: {
                        type: 'string',
                        description: 'Absolute http(s) URL to fetch and read.',
                    },
                },
                required: ['url'],
                additionalProperties: false,
            }),
            execute: async ({ url }) => {
                if (!toolOptions.silent) {
                    researchLog(`Tool invoked: read_web_page`)
                }
                return readWebPage(url, toolOptions)
            },
        }),
    }
}

module.exports = {
    DEFAULT_MAX_PAGE_TEXT_CHARS,
    DEFAULT_MAX_SEARCH_RESULTS,
    DEFAULT_SOURCE_TEXT_CHARS,
    LOG_PREFIX,
    createWebResearchTools,
    decodeHtmlEntities,
    htmlToText,
    extractTitle,
    excerptForQuery,
    buildResearchContext,
    formatAnswerWithSources,
    gatherSearchSourceContent,
    isAllowedUrl,
    parseDuckDuckGoHtmlResults,
    parseDuckDuckGoInstantResults,
    fetchWithLimits,
    webSearch,
    readWebPage,
    truncateForLog,
}
