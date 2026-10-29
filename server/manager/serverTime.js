'use strict';

const sessionAuth = require('../utils/sessionAuth')
const { queryNtp } = require('../utils/ntpClient')
const { log, logColors } = require('../log')

// Wall clocks on panels paint America/New_York (EST/EDT with DST).
const CLOCK_TIME_ZONE = 'America/New_York'
const RESYNC_INTERVAL_MS = 24 * 60 * 60 * 1000

/** @type {null | { ntpMs: number, monoNs: bigint, syncedAt: number, source: string }} */
let syncState = null
let syncInFlight = null
let resyncTimer = null

const monoNow = (deps = {}) => {
    if (deps.hrtime && typeof deps.hrtime.bigint === 'function') return deps.hrtime.bigint()
    return process.hrtime.bigint()
}

/**
 * Advance from the last NTP sample using a monotonic clock so the value
 * does not depend on the host OS wall clock after the sync.
 */
const getNtpNow = (deps = {}) => {
    if (!syncState) {
        const clock = deps.clock || Date
        return clock.now()
    }
    const elapsedNs = monoNow(deps) - syncState.monoNs
    const elapsedMs = Number(elapsedNs) / 1e6
    return Math.floor(syncState.ntpMs + elapsedMs)
}

const getSyncInfo = () => {
    if (!syncState) {
        return {
            source: 'fallback',
            syncedAt: null,
            timeZone: CLOCK_TIME_ZONE,
        }
    }
    return {
        source: syncState.source || 'ntp',
        syncedAt: syncState.syncedAt,
        timeZone: CLOCK_TIME_ZONE,
    }
}

const applySync = (ntpMs, deps = {}) => {
    const value = Number(ntpMs)
    if (!isFinite(value)) throw new Error('ntp_invalid')
    syncState = {
        ntpMs: value,
        monoNs: monoNow(deps),
        syncedAt: (deps.clock || Date).now(),
        source: deps.source || 'ntp',
    }
    return value
}

const syncFromNtp = async (deps = {}) => {
    if (syncInFlight) return syncInFlight
    const runQuery = deps.queryNtp || queryNtp
    syncInFlight = (async () => {
        try {
            const ntpMs = await runQuery(deps.ntpOptions || {})
            applySync(ntpMs, { ...deps, source: 'ntp' })
            log(`NTP sync ok (${new Date(ntpMs).toISOString()})`, logColors.Info)
            return getNtpNow(deps)
        } catch (err) {
            const message = err && err.message ? err.message : String(err)
            log(`NTP sync failed: ${message}`, logColors.Warn)
            if (!syncState) {
                // First sync failed — seed from local clock so clocks still paint.
                applySync((deps.clock || Date).now(), { ...deps, source: 'fallback' })
                log('NTP unavailable; seeded clock from host until next sync', logColors.Warn)
            }
            return getNtpNow(deps)
        } finally {
            syncInFlight = null
        }
    })()
    return syncInFlight
}

const ensureFreshSync = async (deps = {}) => {
    const maxAge = deps.resyncIntervalMs == null ? RESYNC_INTERVAL_MS : deps.resyncIntervalMs
    if (!syncState || ((deps.clock || Date).now() - syncState.syncedAt) >= maxAge) {
        await syncFromNtp(deps)
    }
    return getNtpNow(deps)
}

const startPeriodicSync = (deps = {}) => {
    stopPeriodicSync()
    const interval = deps.resyncIntervalMs == null ? RESYNC_INTERVAL_MS : deps.resyncIntervalMs
    // Kick an immediate sync, then refresh every 24h.
    syncFromNtp(deps).catch(() => { /* logged inside */ })
    resyncTimer = setInterval(() => {
        syncFromNtp(deps).catch(() => { /* logged inside */ })
    }, interval)
    if (typeof resyncTimer.unref === 'function') resyncTimer.unref()
}

const stopPeriodicSync = () => {
    if (resyncTimer) {
        clearInterval(resyncTimer)
        resyncTimer = null
    }
}

/** @deprecated Prefer getNtpNow — kept for call sites that still say "server time". */
const getServerNow = (deps = {}) => getNtpNow(deps)

const handleGetServerTime = async (req, res, deps = {}) => {
    const auth = deps.auth || sessionAuth
    if (!auth.canAccessPrivateApi(req, res)) {
        res.sendStatus(401)
        return
    }
    try {
        const now = await ensureFreshSync(deps)
        const info = getSyncInfo()
        return res.status(200).json({
            now,
            source: info.source,
            syncedAt: info.syncedAt,
            timeZone: info.timeZone,
        })
    } catch (err) {
        log(`time endpoint: ${err}`, logColors.Error)
        return res.sendStatus(500)
    }
}

const resetForTests = () => {
    stopPeriodicSync()
    syncState = null
    syncInFlight = null
}

module.exports = {
    CLOCK_TIME_ZONE,
    RESYNC_INTERVAL_MS,
    getNtpNow,
    getServerNow,
    getSyncInfo,
    syncFromNtp,
    ensureFreshSync,
    startPeriodicSync,
    stopPeriodicSync,
    applySync,
    handleGetServerTime,
    resetForTests,
}
