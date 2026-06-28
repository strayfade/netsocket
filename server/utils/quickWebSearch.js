'use strict'

const { generateText, stepCountIs, tool, jsonSchema } = require('ai')
const { log, logColors } = require('../log')
const { DEFAULT_MODEL, getOllamaProvider, sanitizeAiOutput } = require('./languageModel')
const {
    webSearch,
    readWebPage,
    excerptForQuery,
    truncateForLog,
} = require('./webResearchTools')
const { stripThinkingTags } = require('./deepResearch')

const DEFAULT_MAX_RESULTS = 3
const DEFAULT_MAX_STEPS = 5
const DEFAULT_MAX_PAGE_READS = 2
const DEFAULT_TIMEOUT_MS = 8000
const DEFAULT_PAGE_TEXT_CHARS = 6000
const DEFAULT_SOURCE_TEXT_CHARS = 2000
const LOG_PREFIX = '[Quick Web Search]'

const SYNTHESIS_SYSTEM_PROMPT = `You answer questions using web search snippets and may read specific pages when needed.

Instructions:
- Start with the provided search snippets. If they fully answer the question, respond immediately without using tools.
- If snippets are insufficient or ambiguous, call read_web_page on the most relevant URL from the search results.
- Only read pages when necessary. Read at most two pages total.
- Give a concise, direct answer in one to three sentences when possible.
- Use only information from snippets or pages you read.
- Do not invent facts, prices, dates, or statistics.
- Plain text only, no markdown or source lists.`

function searchLog(message, colors = logColors.Default) {
    log(`${LOG_PREFIX} ${message}`, colors)
}

function buildSnippetContext(results) {
    return results.map((hit, index) => (
        `[${index + 1}] ${hit.title}\n${hit.snippet || '(no snippet)'}\nURL: ${hit.url}`
    )).join('\n\n')
}

function createQuickWebSearchTools(options = {}) {
    const toolOptions = {
        fetchFn: options.fetchFn,
        timeoutMs: options.timeoutMs,
        maxBytes: options.maxBytes,
        userAgent: options.userAgent,
        maxPageTextChars: options.maxPageTextChars || DEFAULT_PAGE_TEXT_CHARS,
        silent: options.silent,
    }
    const query = String(options.query || '')
    const maxPageReads = Number(options.maxPageReads) > 0
        ? Number(options.maxPageReads)
        : DEFAULT_MAX_PAGE_READS
    const sourceTextChars = Number(options.sourceTextChars) > 0
        ? Number(options.sourceTextChars)
        : DEFAULT_SOURCE_TEXT_CHARS

    let pagesRead = 0

    return {
        read_web_page: tool({
            description: 'Fetch a public web page and return readable text. Use only when search snippets are not enough to answer the question. Pass a URL from the search results.',
            inputSchema: jsonSchema({
                type: 'object',
                properties: {
                    url: {
                        type: 'string',
                        description: 'Absolute http(s) URL from the search results to read.',
                    },
                },
                required: ['url'],
                additionalProperties: false,
            }),
            execute: async ({ url }) => {
                if (pagesRead >= maxPageReads) {
                    return {
                        url,
                        error: `Page read limit reached (${maxPageReads}). Answer using information already gathered.`,
                    }
                }
                pagesRead += 1

                if (!toolOptions.silent) {
                    searchLog(`Tool invoked: read_web_page (${pagesRead}/${maxPageReads})`)
                }

                const page = await readWebPage(url, {
                    ...toolOptions,
                    silent: true,
                })

                if (page.text) {
                    page.text = excerptForQuery(page.text, query, sourceTextChars)
                }

                return page
            },
        }),
    }
}

async function quickWebSearch(query, options = {}) {
    const userQuery = String(query || '').trim()
    if (!userQuery) {
        return { response: '', error: 'Query is empty' }
    }

    const modelName = String(options.model || DEFAULT_MODEL).trim() || DEFAULT_MODEL
    const silent = options.silent === true
    const maxResults = Number(options.maxResults) > 0
        ? Math.min(Number(options.maxResults), 5)
        : DEFAULT_MAX_RESULTS
    const maxSteps = Number(options.maxSteps) > 0
        ? Math.min(Number(options.maxSteps), 10)
        : DEFAULT_MAX_STEPS

    try {
        const ollama = getOllamaProvider()
        if (!ollama) {
            return { response: '', error: 'Ollama is not configured' }
        }

        if (!silent) {
            searchLog(`Starting quick search with model "${modelName}"`)
            searchLog(`Query: ${truncateForLog(userQuery, 200)}`)
        }

        const search = await webSearch(userQuery, {
            fetchFn: options.fetchFn,
            timeoutMs: options.timeoutMs || DEFAULT_TIMEOUT_MS,
            maxBytes: options.maxBytes,
            userAgent: options.userAgent,
            maxResults,
            silent,
        })

        if (search.results.length === 0) {
            const err = search.error || 'No search results found'
            searchLog(`No results: ${err}`, logColors.Warning)
            return { response: '', error: err }
        }

        if (!silent) {
            searchLog(
                `Synthesizing from ${search.results.length} snippet(s); LLM may read up to ${options.maxPageReads || DEFAULT_MAX_PAGE_READS} page(s) if needed`,
                logColors.Success
            )
        }

        const snippetContext = buildSnippetContext(search.results)
        const prompt = `Query: ${userQuery}\n\nSearch snippets:\n${snippetContext}`
        const systemPrompt = options.systemPrompt || SYNTHESIS_SYSTEM_PROMPT
        const tools = createQuickWebSearchTools({
            fetchFn: options.fetchFn,
            timeoutMs: options.timeoutMs || DEFAULT_TIMEOUT_MS,
            maxBytes: options.maxBytes,
            userAgent: options.userAgent,
            maxPageTextChars: options.maxPageTextChars,
            maxPageReads: options.maxPageReads,
            sourceTextChars: options.sourceTextChars,
            query: userQuery,
            silent,
        })

        let text = ''

        if (options.generateTextFn) {
            const result = await options.generateTextFn({
                model: ollama(modelName),
                system: systemPrompt,
                prompt,
            })
            text = result.text
        } else {
            const result = await generateText({
                model: ollama(modelName),
                system: systemPrompt,
                prompt,
                tools,
                stopWhen: stepCountIs(maxSteps),
            })
            text = result.text
        }

        const response = sanitizeAiOutput(stripThinkingTags(text))

        if (!silent) {
            if (response) {
                searchLog(`Response ready (${response.length} chars)`, logColors.Success)
            } else {
                searchLog('Finished with an empty response', logColors.Warning)
            }
        }

        return { response }
    } catch (e) {
        searchLog(`Quick web search failed: ${e.message}`, logColors.Error)
        return { response: '', error: e.message }
    }
}

module.exports = {
    SYNTHESIS_SYSTEM_PROMPT,
    DEFAULT_MAX_RESULTS,
    DEFAULT_MAX_STEPS,
    DEFAULT_MAX_PAGE_READS,
    buildSnippetContext,
    createQuickWebSearchTools,
    quickWebSearch,
}
