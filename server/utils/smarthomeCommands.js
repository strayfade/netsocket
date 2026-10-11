'use strict';

// Pure mapping from a Device Command node `Command` value to the MQTT
// message published on the entity's command topic. No I/O.

const SWITCH_COMMANDS = { On: 'ON', Off: 'OFF', Toggle: 'TOGGLE' }
const COVER_COMMANDS = { Open: 'OPEN', Close: 'CLOSE', Stop: 'STOP' }
const RAW_COMMAND = 'Raw Payload'

const normalizeCommand = (command) => {
    const raw = command == null ? '' : String(command).trim()
    if (!raw) return ''
    return raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase()
}

const resolveCommandMessage = (entity, command, payload) => {
    if (!entity) return { ok: false, error: 'unknown device entity' }
    if (!entity.commandTopic) {
        return { ok: false, error: `entity ${entity.uniqueId} does not accept commands` }
    }
    const normalized = normalizeCommand(command)
    if (!normalized || normalized.toLowerCase() === RAW_COMMAND.toLowerCase()) {
        const message = payload == null ? '' : String(payload)
        if (!message) return { ok: false, error: 'payload is required for raw commands' }
        return { ok: true, message }
    }
    const table = entity.component === 'cover'
        ? COVER_COMMANDS
        : (entity.component === 'switch' || entity.component === 'light')
            ? SWITCH_COMMANDS
            : null
    if (!table) {
        return { ok: false, error: `commands are not supported for ${entity.component} entities` }
    }
    const message = table[normalized]
    if (!message) {
        return { ok: false, error: `command ${normalized} is not valid for ${entity.component} entities` }
    }
    return { ok: true, message }
}

module.exports = { SWITCH_COMMANDS, COVER_COMMANDS, RAW_COMMAND, resolveCommandMessage }
