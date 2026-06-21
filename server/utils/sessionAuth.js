const crypto = require('crypto')
const cookie = require('cookie')
const { getUsers, setUsers, flushUsersSync } = require('../manager/saveUsers.js')

const authSkipped = () => process.argv.includes('--skip-auth')

/** Sliding inactivity window for standard sign-in (browser session cookie). */
const SESSION_IDLE_MS = 1000 * 60 * 60 * 8
/** Legacy sessions created before remember-me used a seven-day window. */
const LEGACY_SESSION_IDLE_MS = 1000 * 60 * 60 * 24 * 7
/** Remember-me sessions stay valid while active within this period. */
const REMEMBER_ME_IDLE_MS = 1000 * 60 * 60 * 24 * 30
const MAX_ACTIVE_SESSIONS = 20
const MIN_PASSWORD_LENGTH = 8

const LOGIN_RATE_WINDOW_MS = 15 * 60 * 1000
const LOGIN_RATE_MAX_ATTEMPTS = 10
const loginAttemptsByIp = new Map()

const secureCookies = process.env.COOKIE_SECURE === '1'

const baseCookieOpts = {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    secure: secureCookies,
}

/** Session cookie — cleared when the browser closes. */
const sessionCookieOpts = { ...baseCookieOpts }

const clearCookieOpts = {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure: secureCookies,
}

const getSessionIdleMs = (session) => {
    if (session?.remember === true) return REMEMBER_ME_IDLE_MS
    if (session?.remember === false) return SESSION_IDLE_MS
    return LEGACY_SESSION_IDLE_MS
}

/** Cookie options for a persisted session record (or new login). */
const getSessionCookieOpts = (remember) => {
    if (remember === false) return sessionCookieOpts
    const maxAge = remember === true ? REMEMBER_ME_IDLE_MS : LEGACY_SESSION_IDLE_MS
    return { ...baseCookieOpts, maxAge }
}

const tokensEqual = (a, b) => {
    if (typeof a !== 'string' || typeof b !== 'string') return false
    const bufA = Buffer.from(a, 'utf8')
    const bufB = Buffer.from(b, 'utf8')
    if (bufA.length !== bufB.length) return false
    return crypto.timingSafeEqual(bufA, bufB)
}

const normalizeToken = (tk) => {
    if (tk == null || tk === '') return null
    try {
        return decodeURIComponent(String(tk))
    } catch {
        return null
    }
}

/** Parse session token from a raw Cookie header (WebSocket handshake). */
const getTokenFromCookieHeader = (cookieHeader) => {
    if (!cookieHeader || typeof cookieHeader !== 'string') return null
    const parsed = cookie.parse(cookieHeader)
    return normalizeToken(parsed.tk)
}

const pruneExpiredSessions = (users, now = Date.now()) => {
    const fresh = users.filter((u) => now - u.ts <= getSessionIdleMs(u))
    return fresh.length === users.length ? users : fresh
}

const findSessionIndex = (users, tk) => {
    const normalized = normalizeToken(tk)
    if (!normalized) return -1
    return users.findIndex((u) => tokensEqual(u.tk, normalized))
}

/**
 * Validates token, drops stale sessions, and refreshes last-activity time (sliding expiration).
 * When `res` is provided, refreshes the session cookie max-age on success.
 */
const sessionIsValidAndTouch = (tk, res = null) => {
    if (!tk) return false
    const now = Date.now()
    let users = pruneExpiredSessions(getUsers(), now)
    const idx = findSessionIndex(users, tk)
    if (idx === -1) {
        if (users !== getUsers()) setUsers(users)
        return false
    }
    users[idx].ts = now
    setUsers(users)
    if (res) {
        res.cookie('tk', users[idx].tk, getSessionCookieOpts(users[idx].remember))
    }
    return true
}

const validateToken = (tk) => {
    if (authSkipped()) return true
    return sessionIsValidAndTouch(tk)
}

/** True when a real session cookie is present and valid (never true when --skip-auth). */
const hasUserSession = (req, res = null) => {
    if (authSkipped()) return false
    return sessionIsValidAndTouch(req.cookies?.tk, res)
}

const generateRandomString = (length) => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
    let result = ''
    for (let i = 0; i < length; i++) {
        result += chars.charAt(crypto.randomInt(chars.length))
    }
    return result
}

const createToken = ({ rememberMe = false } = {}) => {
    const tk = Buffer.from(generateRandomString(128), 'utf8').toString('base64url')
    const now = Date.now()
    let users = pruneExpiredSessions(getUsers(), now)
    users.push({ ts: now, tk, remember: rememberMe === true })
    if (users.length > MAX_ACTIVE_SESSIONS) {
        users.sort((a, b) => a.ts - b.ts)
        users = users.slice(users.length - MAX_ACTIVE_SESSIONS)
    }
    setUsers(users)
    flushUsersSync({ allowEmpty: true })
    return tk
}

const revokeToken = (tk) => {
    const normalized = normalizeToken(tk)
    if (!normalized) return
    const users = getUsers().filter((u) => !tokensEqual(u.tk, normalized))
    setUsers(users)
    flushUsersSync({ allowEmpty: true })
}

const canAccessPrivateApi = (req, res = null) => authSkipped() || hasUserSession(req, res)

const normalizeClientAddress = (address) => {
    if (!address || typeof address !== 'string') return ''
    let normalized = address.split('%')[0]
    const ipv4Mapped = normalized.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i)
    if (ipv4Mapped) return ipv4Mapped[1]
    if (normalized.startsWith('[') && normalized.endsWith(']')) {
        normalized = normalized.slice(1, -1)
    }
    return normalized.toLowerCase()
}

const isPrivateIpv4 = (host) => {
    const parts = host.split('.').map((part) => Number(part))
    if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
        return false
    }
    if (parts[0] === 10) return true
    if (parts[0] === 127) return true
    if (parts[0] === 169 && parts[1] === 254) return true
    if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true
    if (parts[0] === 192 && parts[1] === 168) return true
    if (parts[0] === 0) return true
    return false
}

const isLanAddress = (rawAddress) => {
    const address = normalizeClientAddress(rawAddress)
    if (!address) return false
    if (/^\d+\.\d+\.\d+\.\d+$/.test(address)) return isPrivateIpv4(address)
    if (address === '::1') return true
    if (address.startsWith('fe80:')) return true
    if (/^f[cd][0-9a-f]{2}:/i.test(address)) return true
    return false
}

const getClientSocketAddress = (req) =>
    req?.socket?.remoteAddress || req?.connection?.remoteAddress || ''

/** True when the TCP peer is on a local/private network (loopback, RFC1918, link-local, ULA). */
const isLanClient = (req) => isLanAddress(getClientSocketAddress(req))

const integrationSecretMatches = (req, expectedSecret) => {
    if (!expectedSecret) return false
    const header = req.headers?.['x-socket-auth']
    if (typeof header !== 'string' || !header.length) return false
    return tokensEqual(header, expectedSecret)
}

const canAccessWithSessionOrIntegrationSecret = (req, res, expectedSecret) => {
    if (authSkipped()) return true
    if (hasUserSession(req, res)) return true
    return integrationSecretMatches(req, expectedSecret)
}

const safeRedirectPath = (path) => {
    if (typeof path !== 'string' || !path.startsWith('/') || path.startsWith('//')) {
        return '/dashboard'
    }
    return path
}

const PROTECTED_PAGE_PATHS = new Set([
    '/dashboard',
    '/constructnodes.js',
    '/createnode.js',
    '/litegraph-editor.css',
    '/litegraph.css',
    '/litegraph.js',
    '/netsocket-editor.css',
    '/css/editor.css',
    '/inset.browser.js',
])

const isProtectedPagePath = (url) => {
    const pathOnly = String(url || '').split('?')[0].toLowerCase()
    return PROTECTED_PAGE_PATHS.has(pathOnly)
}

const requireUserSession = (req, res, next) => {
    if (authSkipped()) return next()
    if (hasUserSession(req, res)) return next()
    revokeToken(req.cookies?.tk)
    res.clearCookie('tk', clearCookieOpts)
    const redirect = encodeURIComponent(safeRedirectPath(req.originalUrl || '/dashboard'))
    return res.status(403).redirect(`/login?redirect=${redirect}`)
}

const loginRateLimit = (req, res, next) => {
    if (authSkipped()) return next()
    const ip = req.ip || req.socket?.remoteAddress || 'unknown'
    const now = Date.now()
    const entry = loginAttemptsByIp.get(ip)
    if (entry && now - entry.windowStart <= LOGIN_RATE_WINDOW_MS && entry.count >= LOGIN_RATE_MAX_ATTEMPTS) {
        return res.sendStatus(429)
    }
    next()
}

const recordFailedLoginAttempt = (req) => {
    if (authSkipped()) return
    const ip = req.ip || req.socket?.remoteAddress || 'unknown'
    const now = Date.now()
    let entry = loginAttemptsByIp.get(ip)
    if (!entry || now - entry.windowStart > LOGIN_RATE_WINDOW_MS) {
        entry = { windowStart: now, count: 0 }
    }
    entry.count += 1
    loginAttemptsByIp.set(ip, entry)
}

const securityHeaders = (_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff')
    res.setHeader('X-Frame-Options', 'SAMEORIGIN')
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin')
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')
    next()
}

const parseRememberMe = (value) => value === true || value === 'true' || value === '1' || value === 1

module.exports = {
    authSkipped,
    SESSION_IDLE_MS,
    LEGACY_SESSION_IDLE_MS,
    REMEMBER_ME_IDLE_MS,
    MIN_PASSWORD_LENGTH,
    sessionCookieOpts,
    getSessionCookieOpts,
    clearCookieOpts,
    secureCookies,
    getSessionIdleMs,
    parseRememberMe,
    getTokenFromCookieHeader,
    validateToken,
    hasUserSession,
    createToken,
    revokeToken,
    canAccessPrivateApi,
    canAccessWithSessionOrIntegrationSecret,
    integrationSecretMatches,
    isLanAddress,
    isLanClient,
    getClientSocketAddress,
    safeRedirectPath,
    isProtectedPagePath,
    requireUserSession,
    recordFailedLoginAttempt,
    loginRateLimit,
    securityHeaders,
}
