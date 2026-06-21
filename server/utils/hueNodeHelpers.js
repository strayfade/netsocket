const { log, logColors } = require('../log')
const { getHueApi, doesHueApiWork } = require('./hueApi')
const { string, number, json } = require('./inputParser')
const hueModel = require('node-hue-api').model

const failObject = {}
const failArray = []
const failArrayJson = '[]'
const failString = ''
const failBool = false
const failNumber = 0

const bridgeItemToPlain = (item) => {
    if (item == null)
        return item
    if (Array.isArray(item))
        return item.map(bridgeItemToPlain)
    if (typeof item.getJsonPayload === 'function')
        return item.getJsonPayload()
    if (typeof item.getHuePayload === 'function') {
        const plain = { ...item.getHuePayload() }
        if (item.id != null)
            plain.id = item.id
        if (item.type != null)
            plain.type = item.type
        return plain
    }
    return item
}

const serializeHueArray = (value) => JSON.stringify(bridgeItemToPlain(Array.isArray(value) ? value : []))

const formatReadOutput = (value, failFallback) => {
    if (Array.isArray(value) || Array.isArray(failFallback))
        return serializeHueArray(value)
    if (value != null && typeof value === 'object')
        return bridgeItemToPlain(value)
    return value
}

const formatReadFailure = (failFallback) => {
    if (Array.isArray(failFallback))
        return failArrayJson
    return failFallback
}

const logHueError = (context, err) => {
    log(`Philips Hue ${context}: ${err}`, logColors.Error)
}

const runHueRead = async (behaviors, failValues, fn) => {
    if (!doesHueApiWork()) {
        await behaviors.populateNextNodeLinks(failValues.map(formatReadFailure))
        return false
    }
    try {
        const values = await fn(getHueApi())
        await behaviors.populateNextNodeLinks(values.map((value, index) => formatReadOutput(value, failValues[index])))
        return true
    } catch (err) {
        logHueError('read', err)
        await behaviors.populateNextNodeLinks(failValues.map(formatReadFailure))
        return false
    }
}

const runHueWrite = async (behaviors, fn) => {
    if (!doesHueApiWork()) {
        await behaviors.triggerNodeGroup(behaviors.getOutputNodeGroups()[0] || [])
        return false
    }
    try {
        await fn(getHueApi(), behaviors)
        await behaviors.triggerNodeGroup(behaviors.getOutputNodeGroups()[0] || [])
        return true
    } catch (err) {
        logHueError('write', err)
        await behaviors.triggerNodeGroup(behaviors.getOutputNodeGroups()[0] || [])
        return false
    }
}

const runHueDiscovery = async (behaviors, failValues, fn) => {
    try {
        const values = await fn()
        await behaviors.populateNextNodeLinks(values)
        return true
    } catch (err) {
        logHueError('discovery', err)
        await behaviors.populateNextNodeLinks(failValues)
        return false
    }
}

const runHueRemoteRead = async (behaviors, failValues, fn) => {
    if (!doesHueApiWork()) {
        await behaviors.populateNextNodeLinks(failValues)
        return false
    }
    try {
        const api = getHueApi()
        if (!api.remote)
            throw new Error('Remote API is not connected')
        const values = await fn(api.remote)
        await behaviors.populateNextNodeLinks(values)
        return true
    } catch (err) {
        logHueError('remote read', err)
        await behaviors.populateNextNodeLinks(failValues)
        return false
    }
}

const runHueRemoteWrite = async (behaviors, fn) => {
    if (!doesHueApiWork()) {
        await behaviors.triggerNodeGroup(behaviors.getOutputNodeGroups()[0] || [])
        return false
    }
    try {
        const api = getHueApi()
        if (!api.remote)
            throw new Error('Remote API is not connected')
        await fn(api.remote, behaviors)
        await behaviors.triggerNodeGroup(behaviors.getOutputNodeGroups()[0] || [])
        return true
    } catch (err) {
        logHueError('remote write', err)
        await behaviors.triggerNodeGroup(behaviors.getOutputNodeGroups()[0] || [])
        return false
    }
}

const mergeModelPayload = (existing, updates) => {
    const payload = typeof existing.getHuePayload === 'function'
        ? existing.getHuePayload()
        : { ...(existing.data || {}), ...existing }
    return hueModel.createFromBridge(
        String(existing.type || payload.type || 'light').toLowerCase(),
        existing.id || payload.id || 0,
        { ...payload, ...updates }
    )
}

module.exports = {
    string,
    number,
    json,
    hueModel,
    failObject,
    failArray,
    failArrayJson,
    failString,
    failBool,
    failNumber,
    bridgeItemToPlain,
    serializeHueArray,
    runHueRead,
    runHueWrite,
    runHueDiscovery,
    runHueRemoteRead,
    runHueRemoteWrite,
    mergeModelPayload,
}
