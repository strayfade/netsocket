'use strict';

const { log, logColors } = require('../log')
const settingsManager = require('../manager/settingsManager')
require('../manager/nodePreferencesRegistry').addPref(
    'Smart Home',
    'smarthome.mqtt.url',
    'MQTT Broker URL',
    'text',
    'mqtt://127.0.0.1:1883',
    '<p>Broker for smart-home devices (for example <code>mqtt://127.0.0.1:1883</code> locally or <code>mqtt://mosquitto:1883</code> in Docker). Empty disables the integration.</p>'
)
require('../manager/nodePreferencesRegistry').addPref(
    'Smart Home',
    'smarthome.mqtt.username',
    'MQTT Username',
    'text',
    '',
    '<p>Optional broker username. Leave empty for anonymous LAN access.</p>'
)
require('../manager/nodePreferencesRegistry').addPref(
    'Smart Home',
    'smarthome.mqtt.password',
    'MQTT Password',
    'text',
    '',
    '<p>Optional broker password. Stored with other integration secrets; never logged.</p>'
)
require('../manager/nodePreferencesRegistry').addPref(
    'Smart Home',
    'smarthome.mqtt.discoveryPrefix',
    'MQTT Discovery Prefix',
    'text',
    'homeassistant',
    '<p>Discovery root subscribed as <code>&lt;prefix&gt;/#</code> (Home Assistant convention).</p>'
)
require('../manager/nodePreferencesRegistry').addPref(
    'Smart Home',
    'smarthome.mqtt.baseTopics',
    'MQTT State Topics',
    'text',
    'netsocket/dev/#,zigbee2mqtt/#',
    '<p>Comma-separated state topic filters for bespoke devices and Zigbee2MQTT.</p>'
)
require('../manager/nodePreferencesRegistry').addPref(
    'Smart Home',
    'smarthome.mqtt.tls',
    'MQTT TLS',
    'text',
    'false',
    '<p>Set to <code>true</code> to connect over TLS (typically port 8883). Upgrades a plain <code>mqtt://</code> URL to <code>mqtts://</code>.</p>'
)
require('../manager/nodePreferencesRegistry').addPref(
    'Smart Home',
    'smarthome.mqtt.caFile',
    'MQTT CA File',
    'text',
    '',
    '<p>Optional path to the broker CA certificate (PEM). When set, the server verifies the broker.</p>'
)
require('../manager/nodePreferencesRegistry').addPref(
    'Smart Home',
    'smarthome.mqtt.rejectUnauthorized',
    'MQTT Verify TLS',
    'text',
    'true',
    '<p>Set to <code>false</code> only for self-signed brokers during bring-up.</p>'
)

const store = require('../manager/smarthomeStore')
const discovery = require('./mqttDiscovery')

let client = null
let connected = false
let activeUrl = ''

/** topic -> { kind: 'state', uniqueId } | { kind: 'availability', deviceId } */
const topicIndex = new Map()

/** Fire-and-forget subscribers for approved device state changes (trigger dispatch). */
const stateListeners = []

// Commands issued while the broker is unreachable are held (bounded) and
// flushed on reconnect, so a brief outage does not silently drop a press.
const MAX_QUEUED_COMMANDS = 100
const pendingCommands = []

const queueCommand = (topic, message) => {
    if (pendingCommands.length >= MAX_QUEUED_COMMANDS) pendingCommands.shift()
    pendingCommands.push({ topic, message })
}

const flushPendingCommands = (active) => {
    if (!active || !pendingCommands.length) return 0
    if (typeof active.connected === 'boolean' && !active.connected) return 0
    const queued = pendingCommands.splice(0, pendingCommands.length)
    for (const item of queued) {
        try {
            active.publish(item.topic, item.message, { qos: 1 }, () => {})
        } catch { /* drop individual failures; connection state will re-queue later */ }
    }
    return queued.length
}

/** Notified when a discovery message registers a brand-new entity (live inbox). */
let registryChangeListener = null

const setRegistryChangeListener = (fn) => {
    registryChangeListener = typeof fn === 'function' ? fn : null
}

const notifyRegistryChanged = () => {
    if (!registryChangeListener) return
    try {
        Promise.resolve()
            .then(() => registryChangeListener())
            .catch((err) => log(`Smart Home registry listener failed: ${err}`, logColors.Error))
    } catch (err) {
        log(`Smart Home registry listener failed: ${err}`, logColors.Error)
    }
}

const addStateListener = (fn) => {
    if (typeof fn === 'function' && !stateListeners.includes(fn)) stateListeners.push(fn)
}

const removeStateListener = (fn) => {
    const idx = stateListeners.indexOf(fn)
    if (idx !== -1) stateListeners.splice(idx, 1)
}

const notifyStateListeners = (event) => {
    for (const fn of [...stateListeners]) {
        try {
            Promise.resolve()
                .then(() => fn(event))
                .catch((err) => log(`Smart Home state listener failed: ${err}`, logColors.Error))
        } catch (err) {
            log(`Smart Home state listener failed: ${err}`, logColors.Error)
        }
    }
}

const getMqttConfig = (settings) => {
    const get = settings && typeof settings.getSetting === 'function'
        ? (key) => settings.getSetting(key)
        : (key) => settingsManager.getSetting(key)
    const url = String(get('smarthome.mqtt.url') || '').trim()
    const username = String(get('smarthome.mqtt.username') || '').trim()
    const password = get('smarthome.mqtt.password') || ''
    const discoveryPrefix = String(get('smarthome.mqtt.discoveryPrefix') || 'homeassistant').trim()
        || 'homeassistant'
    const baseTopics = String(get('smarthome.mqtt.baseTopics') || 'netsocket/dev/#,zigbee2mqtt/#')
        .split(',')
        .map((part) => part.trim())
        .filter((part) => part.length > 0)
    const tls = String(get('smarthome.mqtt.tls') || 'false').trim().toLowerCase() === 'true'
    const caFile = String(get('smarthome.mqtt.caFile') || '').trim()
    const rejectUnauthorized = String(get('smarthome.mqtt.rejectUnauthorized') || 'true').trim().toLowerCase() !== 'false'
    return { url, username, password: String(password), discoveryPrefix, baseTopics, tls, caFile, rejectUnauthorized }
}

// Pure options builder so TLS wiring can be unit tested without a broker.
// `readFile` is injectable; a TLS connection with an unreadable CA fails
// closed rather than silently downgrading to an unverified socket.
const buildMqttOptions = (cfg, readFile) => {
    // mqtt.js requires a clientId whenever clean is false (persistent session).
    const options = {
        reconnectPeriod: 5000,
        connectTimeout: 10000,
        clean: false,
        clientId: cfg.clientId || 'netsocket-server',
    }
    if (cfg.username) options.username = cfg.username
    if (cfg.password) options.password = cfg.password
    let url = cfg.url
    if (cfg.tls) {
        if (url.startsWith('mqtt://')) url = 'mqtts://' + url.slice('mqtt://'.length)
        options.rejectUnauthorized = cfg.rejectUnauthorized !== false
        if (cfg.caFile) {
            try {
                options.ca = readFile(cfg.caFile)
            } catch (err) {
                return { error: `TLS CA file could not be read: ${cfg.caFile}` }
            }
        }
    }
    return { url, options }
}

const rebuildTopicIndex = (storeLib) => {
    topicIndex.clear()
    const lib = storeLib || store
    for (const device of lib.listDevices()) {
        for (const entity of device.entities || []) {
            if (entity.stateTopic) {
                topicIndex.set(entity.stateTopic, {
                    kind: 'state',
                    uniqueId: entity.uniqueId,
                    deviceId: device.deviceId,
                    statePath: entity.statePath || null,
                })
            }
            if (entity.availabilityTopic) {
                topicIndex.set(entity.availabilityTopic, { kind: 'availability', deviceId: device.deviceId })
            }
        }
    }
}

const parsePayloadJson = (buffer) => {
    try {
        const raw = Buffer.isBuffer(buffer) ? buffer.toString('utf8') : String(buffer)
        if (!raw.trim()) return { text: '', json: null }
        return { text: raw, json: JSON.parse(raw) }
    } catch {
        const text = Buffer.isBuffer(buffer) ? buffer.toString('utf8') : String(buffer)
        return { text, json: null }
    }
}

const detectSource = (stateTopic) => {
    if (stateTopic && stateTopic.startsWith('zigbee2mqtt/')) return 'zigbee2mqtt'
    return 'bespoke'
}

// Apply a discovery `value_template` single-key path to a JSON state
// payload (e.g. {"state":"ON","brightness":120} -> "ON"). Falls back to
// the raw text when the payload is not JSON or the key is absent.
const extractStateText = (text, json, statePath) => {
    if (!statePath) return text
    if (json && typeof json === 'object' && !Array.isArray(json) && json[statePath] !== undefined) {
        const value = json[statePath]
        return value == null ? '' : String(value)
    }
    return text
}

const handleMessage = (topic, payloadBuffer, deps) => {
    const storeLib = (deps && deps.store) || store
    const discoveryLib = (deps && deps.discovery) || discovery
    const prefix = (deps && deps.discoveryPrefix) || getMqttConfig(deps && deps.settings).discoveryPrefix
    const cleanTopic = String(topic || '').trim()
    if (!cleanTopic) return { routed: false }
    const parsed = discoveryLib.parseDiscoveryTopic(cleanTopic, prefix)
    if (parsed) {
        const { text, json } = parsePayloadJson(payloadBuffer)
        if (!text) {
            // Retained discovery cleared (empty payload) — keep registry entry, ignore.
            return { routed: true, kind: 'discovery-cleared' }
        }
        if (!json || typeof json !== 'object' || Array.isArray(json)) {
            log(`Smart Home discovery on ${cleanTopic} is not a JSON object; ignoring`, logColors.Warning)
            return { routed: true, kind: 'discovery-invalid' }
        }
        const result = discoveryLib.parseDiscoveryPayload(parsed.component, parsed.nodeId, parsed.objectId, json)
        if (result.error) {
            log(`Smart Home discovery rejected (${result.error}): ${cleanTopic}`, logColors.Warning)
            return { routed: true, kind: 'discovery-rejected', error: result.error }
        }
        const outcome = storeLib.upsertFromDiscovery({
            device: result.device,
            entity: result.entity,
            source: detectSource(result.entity.stateTopic),
        })
        rebuildTopicIndex(storeLib)
        if (outcome && outcome.created) notifyRegistryChanged()
        return { routed: true, kind: 'discovery', deviceId: outcome && outcome.deviceId }
    }
    const indexed = topicIndex.get(cleanTopic)
    if (!indexed) return { routed: false }
    if (indexed.kind === 'state') {
        const { text, json } = parsePayloadJson(payloadBuffer)
        const value = extractStateText(text, json, indexed.statePath)
        storeLib.updateState(indexed.uniqueId, value)
        notifyStateListeners({ kind: 'state', uniqueId: indexed.uniqueId, deviceId: indexed.deviceId, state: value })
        return { routed: true, kind: 'state', uniqueId: indexed.uniqueId }
    }
    if (indexed.kind === 'availability') {
        const { text } = parsePayloadJson(payloadBuffer)
        const value = text.trim().toLowerCase()
        if (value === 'online' || value === 'offline') {
            storeLib.updateAvailability(indexed.deviceId, value)
            notifyStateListeners({ kind: 'availability', uniqueId: null, deviceId: indexed.deviceId, state: value })
            return { routed: true, kind: 'availability', deviceId: indexed.deviceId }
        }
        return { routed: true, kind: 'availability-ignored' }
    }
    return { routed: false }
}

const initSmartHomeMqtt = (deps) => {
    if (client) return { ok: true, url: activeUrl, reused: true }
    const settings = deps && deps.settings
    const mqttLib = (deps && deps.mqttLib) || require('mqtt')
    const storeLib = (deps && deps.store) || store
    const cfg = getMqttConfig(settings)
    if (!cfg.url) {
        log('Smart Home MQTT not configured; skipping broker connection', logColors.Warning)
        return { ok: false, reason: 'not-configured' }
    }
    const built = buildMqttOptions(cfg, (file) => require('fs').readFileSync(file))
    if (built.error) {
        log(`Smart Home MQTT not started: ${built.error}`, logColors.Error)
        return { ok: false, reason: 'tls-config' }
    }
    try {
        client = mqttLib.connect(built.url, built.options)
    } catch (err) {
        log(`Smart Home MQTT connect failed: ${err}`, logColors.Error)
        client = null
        return { ok: false, reason: 'connect-failed' }
    }
    activeUrl = built.url
    rebuildTopicIndex(storeLib)
    const subscriptions = [`${cfg.discoveryPrefix}/#`, ...cfg.baseTopics]
    client.on('connect', () => {
        connected = true
        rebuildTopicIndex(storeLib)
        client.subscribe(subscriptions, (err) => {
            if (err) log(`Smart Home MQTT subscribe failed: ${err}`, logColors.Error)
        })
        const flushed = flushPendingCommands(client)
        if (flushed) log(`Smart Home MQTT flushed ${flushed} queued command(s)`, logColors.Success)
    })
    client.on('message', (topic, payload) => {
        try {
            handleMessage(topic, payload, { store: storeLib, discoveryPrefix: cfg.discoveryPrefix })
        } catch (err) {
            log(`Smart Home MQTT message handling failed: ${err}`, logColors.Error)
        }
    })
    client.on('close', () => { connected = false })
    client.on('offline', () => { connected = false })
    return { ok: true, url: cfg.url }
}

const publishCommand = async (uniqueId, payload, deps) => {
    const storeLib = (deps && deps.store) || store
    const active = (deps && deps.client !== undefined) ? deps.client : client
    const key = uniqueId == null ? '' : String(uniqueId).trim()
    if (!key) return { ok: false, error: 'uniqueId is required' }
    const entity = storeLib.getEntity(key)
    if (!entity) return { ok: false, error: `unknown device entity: ${key}` }
    if (!entity.commandTopic) return { ok: false, error: `entity ${key} has no command topic` }
    const message = payload == null ? '' : String(payload)
    if (!active || (typeof active.connected === 'boolean' && !active.connected)) {
        queueCommand(entity.commandTopic, message)
        return { ok: false, queued: true, error: 'mqtt client is not connected; command queued' }
    }
    return new Promise((resolve) => {
        active.publish(entity.commandTopic, message, { qos: 1 }, (err) => {
            if (err) resolve({ ok: false, error: String(err) })
            else resolve({ ok: true, topic: entity.commandTopic })
        })
    })
}

const getStatus = () => ({ connected: connected && !!client, url: activeUrl, queued: pendingCommands.length })

const resetForTests = () => {
    if (client && typeof client.end === 'function') {
        try { client.end(true) } catch { /* ignore */ }
    }
    client = null
    connected = false
    activeUrl = ''
    topicIndex.clear()
    stateListeners.length = 0
    registryChangeListener = null
    pendingCommands.length = 0
}

module.exports = {
    getMqttConfig,
    buildMqttOptions,
    initSmartHomeMqtt,
    handleMessage,
    publishCommand,
    getStatus,
    rebuildTopicIndex,
    addStateListener,
    removeStateListener,
    setRegistryChangeListener,
    resetForTests,
}
