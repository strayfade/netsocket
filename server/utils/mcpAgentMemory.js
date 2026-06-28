'use strict'

const fs = require('fs').promises
const { config } = require('../config')
const { log, logColors } = require('../log')

const MAX_MESSAGES_PER_SESSION = 40
const LOG_PREFIX = '[MCP Agent Memory]'

/** @type {{ sessions: Record<string, { messages: Array<{role: string, content: string}>, updatedAt: string }> }} */
let store = { sessions: {} }
let loaded = false
let saveChain = Promise.resolve()

function normalizeMessage(message) {
    const role = String(message?.role || '').trim()
    const content = String(message?.content || '').trim()
    if (!content || (role !== 'user' && role !== 'assistant')) {
        return null
    }
    return { role, content }
}

function trimMessages(messages) {
    if (messages.length <= MAX_MESSAGES_PER_SESSION) {
        return messages
    }
    return messages.slice(messages.length - MAX_MESSAGES_PER_SESSION)
}

async function persistStore() {
    const memoryPath = config.storage.mcpAgentMemory
    await fs.writeFile(memoryPath, JSON.stringify(store, null, 2), { encoding: 'utf-8' })
}

async function reloadMcpAgentMemory() {
    const memoryPath = config.storage.mcpAgentMemory
    try {
        const raw = JSON.parse(await fs.readFile(memoryPath, { encoding: 'utf-8' }))
        const sessions = raw && typeof raw.sessions === 'object' && raw.sessions != null
            ? raw.sessions
            : {}
        store = { sessions }
        loaded = true
        log(`${LOG_PREFIX} Loaded ${Object.keys(sessions).length} session(s)`)
    } catch {
        log(`${LOG_PREFIX} No memory file yet; starting fresh`, logColors.Warning)
        store = { sessions: {} }
        loaded = true
        await fs.writeFile(memoryPath, JSON.stringify(store, null, 2), { encoding: 'utf-8' })
    }
}

async function ensureLoaded() {
    if (!loaded) {
        await reloadMcpAgentMemory()
    }
}

function resolveSessionKey(options = {}) {
    const conversationId = String(options.conversationId || '').trim()
    if (conversationId) {
        return `conv:${conversationId}`
    }
    const memoryKey = String(options.memoryKey || '').trim()
    if (memoryKey) {
        return `key:${memoryKey}`
    }
    return 'default'
}

async function getSessionMessages(sessionKey) {
    await ensureLoaded()
    const session = store.sessions[sessionKey]
    if (!session || !Array.isArray(session.messages)) {
        return []
    }
    return session.messages
        .map(normalizeMessage)
        .filter(Boolean)
}

async function appendSessionTurn(sessionKey, userContent, assistantContent) {
    await ensureLoaded()

    const userMessage = normalizeMessage({ role: 'user', content: userContent })
    const assistantMessage = normalizeMessage({ role: 'assistant', content: assistantContent })
    if (!userMessage || !assistantMessage) {
        return
    }

    const existing = store.sessions[sessionKey]?.messages || []
    const messages = trimMessages([
        ...existing.map(normalizeMessage).filter(Boolean),
        userMessage,
        assistantMessage,
    ])

    store.sessions[sessionKey] = {
        messages,
        updatedAt: new Date().toISOString(),
    }

    saveChain = saveChain
        .then(() => persistStore())
        .catch((error) => {
            log(`${LOG_PREFIX} Failed to save memory: ${error.message}`, logColors.Error)
        })

    await saveChain
}

async function clearSession(sessionKey) {
    await ensureLoaded()
    delete store.sessions[sessionKey]
    saveChain = saveChain
        .then(() => persistStore())
        .catch((error) => {
            log(`${LOG_PREFIX} Failed to save memory: ${error.message}`, logColors.Error)
        })
    await saveChain
}

module.exports = {
    MAX_MESSAGES_PER_SESSION,
    resolveSessionKey,
    reloadMcpAgentMemory,
    getSessionMessages,
    appendSessionTurn,
    clearSession,
}
