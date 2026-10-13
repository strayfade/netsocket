'use strict';

const sessionAuth = require('../utils/sessionAuth')

/**
 * Central time source for clock widgets. Pages sync a local offset from
 * this endpoint once (and from the `now` field on dashboard-summary and
 * panel-config payloads) and then paint `Date.now() + offset`, so wall
 * surfaces agree with the server even when the viewing device's own
 * clock has drifted.
 */
const getServerNow = (deps = {}) => {
    const clock = deps.clock || Date
    return clock.now()
}

const handleGetServerTime = (req, res, deps = {}) => {
    const auth = deps.auth || sessionAuth
    if (!auth.canAccessPrivateApi(req, res)) {
        res.sendStatus(401)
        return
    }
    return res.status(200).json({ now: getServerNow(deps) })
}

module.exports = {
    getServerNow,
    handleGetServerTime,
}
