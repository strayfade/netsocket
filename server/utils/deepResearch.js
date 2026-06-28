'use strict'

const { generateText } = require('ai')
const { log, logColors } = require('../log')
const { DEFAULT_MODEL, getOllamaProvider, sanitizeAiOutput } = require('./languageModel')
const {
    gatherSearchSourceContent,
    buildResearchContext,
    formatAnswerWithSources,
    truncateForLog,
    LOG_PREFIX,
} = require('./webResearchTools')

const SYNTHESIS_SYSTEM_PROMPT = `You synthesize a consensus answer from labeled web source excerpts.

Instructions:
- Compare all sources and form a consensus answer to the question.
- When sources agree, state the fact clearly.
- When sources disagree, explain the disagreement and note which sources support each view.
- Only use information present in the provided source content.
- Do not invent facts, URLs, quotes, or statistics.
- Write in plain text without markdown.
- Do not include a sources list; sources are appended separately after your answer.`

function researchLog(message, colors = logColors.Default) {
    log(`${LOG_PREFIX} ${message}`, colors)
}

function stripThinkingTags(text) {
    if (typeof text !== 'string') return ''
    if (text.includes('</think>')) {
        return text.slice(text.indexOf('</think>') + '</think>'.length).trim()
    }
    return text.trim()
}

async function deepResearch(question, options = {}) {
    const userQuestion = String(question || '').trim()
    if (!userQuestion) {
        return { answer: '', sources: [], error: 'Question is empty' }
    }

    const modelName = String(options.model || DEFAULT_MODEL).trim() || DEFAULT_MODEL
    const silent = options.silent === true

    try {
        const ollama = getOllamaProvider()
        if (!ollama) {
            return { answer: '', sources: [], error: 'Ollama is not configured' }
        }

        if (!silent) {
            researchLog(`Starting research with model "${modelName}"`)
            researchLog(`Question: ${truncateForLog(userQuestion, 200)}`)
        }

        const gathered = await gatherSearchSourceContent(userQuestion, {
            fetchFn: options.fetchFn,
            timeoutMs: options.timeoutMs,
            maxBytes: options.maxBytes,
            userAgent: options.userAgent,
            maxPageTextChars: options.maxPageTextChars,
            maxSearchResults: options.maxSearchResults,
            sourceTextChars: options.sourceTextChars,
            silent,
        })

        if (gathered.error && gathered.sources.length === 0) {
            researchLog(`No usable sources: ${gathered.error}`, logColors.Warning)
            return { answer: '', sources: [], error: gathered.error || 'No sources found' }
        }

        const { sources } = gathered
        const contextChars = sources.reduce((sum, source) => sum + source.text.length, 0)

        if (!silent) {
            researchLog(
                `Synthesizing consensus from ${sources.length} source(s) (${contextChars} chars of extracted text)`,
                logColors.Success
            )
        }

        const researchContext = buildResearchContext(sources)
        const { text } = await generateText({
            model: ollama(modelName),
            system: options.systemPrompt || SYNTHESIS_SYSTEM_PROMPT,
            prompt: `Question: ${userQuestion}\n\nSource material:\n${researchContext}`,
        })

        const consensus = sanitizeAiOutput(stripThinkingTags(text))
        const answer = formatAnswerWithSources(consensus, sources)

        if (!silent) {
            if (answer) {
                researchLog(`Final answer ready (${answer.length} chars, ${sources.length} source(s))`, logColors.Success)
            } else {
                researchLog('Research finished with an empty answer', logColors.Warning)
            }
        }

        return { answer, sources }
    } catch (e) {
        researchLog(`Deep research failed: ${e.message}`, logColors.Error)
        return { answer: '', sources: [], error: e.message }
    }
}

module.exports = {
    SYNTHESIS_SYSTEM_PROMPT,
    deepResearch,
    stripThinkingTags,
}
