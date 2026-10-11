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

const store = require('../manager/smarthomeStore')
const discovery = require('./mqttDiscovery')

let client = null
let connected = false
let activeUrl = ''

/** topic -> { kind: 'state', uniqueId } | { kind: 'availability', deviceId } */
const topicIndex = new Map()

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
    return { url, username, password: String(password), discoveryPrefix, baseTopics }
}

const rebuildTopicIndex = (storeLib) => {
    topicIndex.clear()
    const lib = storeLib || store
    for (const device of lib.listDevices()) {
        for (const entity of device.entities || []) {
            if (entity.stateTopic) topicIndex.set(entity.stateTopic, { kind: 'state', uniqueId: entity.uniqueId })
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
        return { routed: true, kind: 'discovery', deviceId: outcome && outcome.deviceId }
    }
    const indexed = topicIndex.get(cleanTopic)
    if (!indexed) return { routed: false }
    if (indexed.kind === 'state') {
        const { text } = parsePayloadJson(payloadBuffer)
        storeLib.updateState(indexed.uniqueId, text)
        return { routed: true, kind: 'state', uniqueId: indexed.uniqueId }
    }
    if (indexed.kind === 'availability') {
        const { text } = parsePayloadJson(payloadBuffer)
        const value = text.trim().toLowerCase()
        if (value === 'online' || value === 'offline') {
            storeLib.updateAvailability(indexed.deviceId, value)
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
    const options = { reconnectPeriod: 5000, connectTimeout: 10000, clean: false }
    if (cfg.username) options.username = cfg.username
    if (cfg.password) options.password = cfg.password
    try {
        client = mqttLib.connect(cfg.url, options)
    } catch (err) {
        log(`Smart Home MQTT connect failed: ${err}`, logColors.Error)
        client = null
        return { ok: false, reason: 'connect-failed' }
    }
    activeUrl = cfg.url
    rebuildTopicIndex(storeLib)
    const subscriptions = [`${cfg.discoveryPrefix}/#`, ...cfg.baseTopics]
    client.on('connect', () => {
        connected = true
        rebuildTopicIndex(storeLib)
        client.subscribe(subscriptions, (err) => {
            if (err) log(`Smart Home MQTT subscribe failed: ${err}`, logColors.Error)
        })
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
    if (!active || (typeof active.connected === 'boolean' && !active.connected)) {
        return { ok: false, error: 'mqtt client is not connected' }
    }
    const message = payload == null ? '' : String(payload)
    return new Promise((resolve) => {
        active.publish(entity.commandTopic, message, { qos: 1 }, (err) => {
            if (err) resolve({ ok: false, error: String(err) })
            else resolve({ ok: true, topic: entity.commandTopic })
        })
    })
}

const getStatus = () => ({ connected: connected && !!client, url: activeUrl })

const resetForTests = () => {
    if (client && typeof client.end === 'function') {
        try { client.end(true) } catch { /* ignore */ }
    }
    client = null
    connected = false
    activeUrl = ''
    topicIndex.clear()
}

module.exports = {
    getMqttConfig,
    initSmartHomeMqtt,
    handleMessage,
    publishCommand,
    getStatus,
    rebuildTopicIndex,
    resetForTests,
}
