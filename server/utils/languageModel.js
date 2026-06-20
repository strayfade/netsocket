const { config } = require('../config')
const { log, logColors } = require('../log')
const settingsManager = require('../manager/settingsManager')
require('../manager/nodePreferencesRegistry').addPref(
    'Ollama',
    'ollama.ip',
    'Host (IP or hostname)',
    'text',
    '127.0.0.1',
    '<p>Hostname or IP where <strong>Ollama</strong> is listening (port <code>11434</code> is assumed). Examples: <code>127.0.0.1</code> or <code>my-server.local</code>.</p>'
)

const { createOllama } = require('ollama-ai-provider-v2');

// Keep models resident in Ollama memory; omitting keep_alive resets the timer to ~5m per request.
const OLLAMA_KEEP_ALIVE = -1

const createOllamaFetch = (baseFetch = globalThis.fetch) => {
    return async (url, options = {}) => {
        const urlStr = typeof url === 'string'
            ? url
            : url instanceof URL
                ? url.href
                : url.url

        if (urlStr.includes('/chat') || urlStr.includes('/generate')) {
            const body = options.body
            if (typeof body === 'string') {
                try {
                    const parsed = JSON.parse(body)
                    if (parsed.keep_alive === undefined) {
                        parsed.keep_alive = OLLAMA_KEEP_ALIVE
                    }
                    options = { ...options, body: JSON.stringify(parsed) }
                } catch (_) { /* leave body unchanged */ }
            }
        }

        return baseFetch(url, options)
    }
}

let ollama
let ollamaInitialized = false
const initOllama = () => {
    if (ollamaInitialized) return
    try {
        const ollamaHost = settingsManager.getSetting('ollama.ip') || '127.0.0.1'
        const baseURL = `http://${ollamaHost}:11434/api`
        ollama = createOllama({
            baseURL,
            fetch: createOllamaFetch()
        })
        ollamaInitialized = true
    }
    catch (e) {
        log(`Failed to initialize Ollama client: ${e.message}`, logColors.Error)
    }
}
const reinitOllama = () => {
    ollamaInitialized = false
    ollama = undefined
    initOllama()
}
const { generateText } = require('ai')
const defaultSystemPrompt = `You are an intelligent robot that is able to 
    perform a user's instructions efficiently and exactly as requested. 
    You may receive input in many different forms of text, but you will 
    be instructed to perform an operation with the data. If the user wants 
    the output in a certain form, make sure that your output fits that 
    form exactly. Do not add explanations or comments on your output - ONLY 
    return what is requested of you. Also, make sure that responses are concise, 
    unless longer output is specifically requested. If you are asked to return
    code such as a JSON object, print the JSON object in plaintext, without using
    codeblocks! Do not use any form of markdown syntax. Only respond using JSON if 
    requested. Otherwise, respond using plaintext answers.`
let currentConversation = [{
    role: "system",
    content: defaultSystemPrompt
}];
function sanitizeAiOutput(input) {
    if (typeof input !== "string") {
        return "";
    }

    // Normalize fancy Unicode quotes to ASCII
    const quoteMap = {
        "\u201C": '"', // “
        "\u201D": '"', // ”
        "\u201E": '"', // „
        "\u00AB": '"', // «
        "\u00BB": '"', // »
        "\u2018": "'", // ‘
        "\u2019": "'", // ’
        "\u2032": "'", // ′
        "\u2033": '"'  // ″
    };

    let normalized = "";
    for (let i = 0; i < input.length; i++) {
        normalized += quoteMap[input[i]] ?? input[i];
    }

    // Strip remaining non-ASCII (except LF and CR)
    let result = "";
    for (let i = 0; i < normalized.length; i++) {
        const code = normalized.charCodeAt(i);
        if (code <= 127 && code !== 10 && code !== 13) {
            result += normalized[i];
        }
    }

    return result;
}

const askAI = async (userText, systemPrompt, model) => {

    try {

        initOllama()

        if (!userText)
            userText = ""
        if (!systemPrompt)
            systemPrompt = defaultSystemPrompt
        if (!model)
            model = "lfm2.5"
        currentConversation = [{
            role: "system",
            content: systemPrompt
        }];

        currentConversation.push({ role: 'user', content: userText });

        // Send to Ollama model
        let { text } = await generateText({
            model: ollama(model),
            messages: currentConversation
        });

        if (text.includes("</think>"))
            text = text.substr(text.indexOf("</think>"))

        currentConversation.push({ role: 'assistant', content: text });

        const newText = sanitizeAiOutput(text)
        //log(`> ${userText}`)
        //log(`< ${text}`)

        return Buffer.from(newText, 'latin1').toString('utf8'), Buffer.from(text, 'latin1').toString('utf8')
    } catch (e) {
        log(`Failed to ask AI: ${e.message}`, logColors.Error)
        return "", ""
    }
}

const getOllamaProvider = () => {
    initOllama()
    return ollama
}

module.exports = { askAI, reinitOllama, getOllamaProvider, sanitizeAiOutput }