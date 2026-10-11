'use strict';

// Pure parser for Home Assistant MQTT-discovery payloads.
// No I/O, no broker dependency — safe to unit test in isolation.
//
// Supported topic shapes (trailing `/config` required):
//   <prefix>/<component>/<nodeId>/<objectId>/config
//   <prefix>/<component>/<objectId>/config        (nodeId falls back to objectId)

const SUPPORTED_COMPONENTS = new Set([
    'switch',
    'light',
    'cover',
    'sensor',
    'binary_sensor',
    'device_automation',
])

const cleanString = (value) => {
    if (value == null) return ''
    const trimmed = String(value).trim()
    return trimmed
}

const parseDiscoveryTopic = (topic, discoveryPrefix) => {
    const prefix = cleanString(discoveryPrefix) || 'homeassistant'
    const raw = cleanString(topic)
    if (!raw) return null
    const parts = raw.split('/').filter((part) => part.length > 0)
    const last = parts[parts.length - 1]
    if (last !== 'config') return null
    const body = parts.slice(0, -1)
    // body[0] must be the discovery prefix
    if (body.length < 3 || body[0] !== prefix) return null
    const component = body[1]
    if (!SUPPORTED_COMPONENTS.has(component)) return null
    if (body.length === 4) {
        return { component, nodeId: body[2], objectId: body[3] }
    }
    if (body.length === 3) {
        return { component, nodeId: body[2], objectId: body[2] }
    }
    return null
}

const hasKey = (payload, key) => {
    return payload[key] != null && cleanString(payload[key]) !== ''
}

// ZMQ/HA entities often report JSON state (e.g. {"state":"ON","brightness":120})
// and select one field with a template like `{{ value_json.state }}`. We only
// support that single-key form; anything else falls back to raw payload text.
const parseValueTemplate = (template) => {
    const raw = cleanString(template)
    if (!raw) return null
    const match = raw.match(/\{\{\s*value_json\.([A-Za-z0-9_]+)\s*\}\}/)
    return match ? match[1] : null
}

const deriveCapabilities = (component, payload) => {
    const caps = []
    if (component === 'switch' || component === 'light') {
        caps.push(`${component}_state`)
        if (hasKey(payload, 'command_topic')) caps.push(`${component}_set`)
    } else if (component === 'cover') {
        caps.push('cover_state')
        if (hasKey(payload, 'position_topic') || hasKey(payload, 'set_position_topic')) {
            caps.push('cover_position')
        }
        if (hasKey(payload, 'command_topic') || hasKey(payload, 'set_position_topic')) {
            caps.push('cover_set')
        }
    } else if (component === 'sensor' || component === 'binary_sensor') {
        const deviceClass = cleanString(payload.device_class) || component
        caps.push(`${deviceClass}_reading`)
    } else if (component === 'device_automation') {
        if (cleanString(payload.automation_type) === 'trigger') caps.push('button_press')
    }
    if (hasKey(payload, 'brightness_state_topic') || hasKey(payload, 'brightness_command_topic')) {
        caps.push('brightness')
    }
    if (hasKey(payload, 'color_temp_state_topic') || hasKey(payload, 'color_temp_command_topic')) {
        caps.push('color_temp')
    }
    if (hasKey(payload, 'rgb_state_topic') || hasKey(payload, 'hs_state_topic')) {
        caps.push('color')
    }
    return caps
}

const parseDiscoveryPayload = (component, nodeId, objectId, payload) => {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
        return { error: 'discovery payload must be a JSON object' }
    }
    const uniqueId = cleanString(payload.unique_id)
    if (!uniqueId) return { error: 'discovery payload is missing unique_id' }
    const identifiers = payload.device && payload.device.identifiers
    const firstId = Array.isArray(identifiers) ? identifiers[0] : null
    const deviceId = cleanString(firstId)
    if (!deviceId) return { error: 'discovery payload is missing device.identifiers[0]' }
    const stateTopic = cleanString(payload.state_topic || payload.position_topic || payload.topic)
    if (!stateTopic) return { error: 'discovery payload has no state_topic' }
    const commandTopic = cleanString(
        payload.command_topic || payload.set_position_topic
    )
    const info = payload.device || {}
    const entity = {
        uniqueId,
        component,
        nodeId: cleanString(nodeId),
        objectId: cleanString(payload.object_id) || cleanString(objectId),
        name: payload.name == null ? null : cleanString(payload.name),
        stateTopic,
        commandTopic: commandTopic || null,
        availabilityTopic: cleanString(payload.availability_topic) || null,
        deviceClass: cleanString(payload.device_class) || null,
        statePath: parseValueTemplate(payload.value_template),
        capabilities: deriveCapabilities(component, payload),
    }
    const device = {
        deviceId,
        name: cleanString(info.name) || cleanString(nodeId),
        manufacturer: cleanString(info.manufacturer),
        model: cleanString(info.model),
        swVersion: cleanString(info.sw_version),
    }
    return { device, entity }
}

module.exports = {
    SUPPORTED_COMPONENTS: [...SUPPORTED_COMPONENTS],
    parseDiscoveryTopic,
    parseDiscoveryPayload,
    deriveCapabilities,
    parseValueTemplate,
}
