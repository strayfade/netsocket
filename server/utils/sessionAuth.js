const crypto = require('crypto')
const cookie = require('cookie')
const { getUsers, setUsers, flushUsersSync } = require('../manager/saveUsers.js')
const deviceRegistry = require('../manager/deviceRegistry')

/**
 * Login is opt-in: disabled by default on new installs and updates, so the
 * server serves the dashboard with no account. Enable sign-in with
 * `--enable-auth` or `NETSOCKET_ENABLE_AUTH=1`. The old `--skip-auth` flag is
 * deprecated — skipping is now the default and the flag is not parsed.
 */
const authEnabled = () => process.argv.includes('--enable-auth') || process.env.NETSOCKET_ENABLE_AUTH === '1'
const authSkipped = () => !authEnabled()

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

/**
 * Cookies carry `Secure` unless the operator explicitly opts out for plain-HTTP
 * LAN access (`COOKIE_SECURE=0`). Secure used to be opt-IN, so on this
 * deployment (which terminates TLS at Cloudflare/the launcher) both the
 * session cookie and the kiosk `ns_device` cookie were issued without Secure
 * and could cross the wire in cleartext. Opting in also enables
 * `app.set('trust proxy', 1)` in server/index.js, so the per-IP login limiter
 * keys on the real visitor instead of the gateway address.
 */
const secureCookies = process.env.COOKIE_SECURE !== '0'

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

/** True when a real session cookie is present and valid (never true when login is disabled). */
const hasUserSession = (req, res = null) => {
    if (authSkipped()) return false
    return sessionIsValidAndTouch(req.cookies?.tk, res)
}

/**
 * Session validity regardless of the login mode. Used by the device-facing
 * routes so a dashboard that signed in still counts while login is opt-in off;
 * a token can only be minted by /login, which is never launcher-whitelisted.
 */
const hasSessionCookie = (req, res = null) => sessionIsValidAndTouch(req.cookies?.tk, res)

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
    const users = getUsers()
    if (findSessionIndex(users, normalized) === -1) return
    setUsers(users.filter((u) => !tokensEqual(u.tk, normalized)))
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

const providedSecretMatches = (provided, expectedSecret) => {
    if (!expectedSecret) return false
    if (typeof provided !== 'string' || !provided.length) return false
    return tokensEqual(provided, expectedSecret)
}

/** Parse `Authorization: Bearer <token>` from a request (scheme is case-insensitive). */
const getBearerTokenFromHeader = (req) => {
    const header = req?.headers?.authorization ?? req?.headers?.Authorization
    if (typeof header !== 'string' || !header.length) return null
    const match = header.match(/^Bearer\s+(.+)$/i)
    if (!match) return null
    const token = match[1].trim()
    return token.length ? token : null
}

const bearerTokenMatches = (req, expectedSecret) => {
    if (!expectedSecret) return false
    const token = getBearerTokenFromHeader(req)
    if (!token) return false
    return tokensEqual(token, expectedSecret)
}

/**
 * Device credentials: an approved device presents its token either as
 * `Authorization: Bearer <token>` (native clients) or as the `ns_device`
 * cookie (kiosk WebViews, so existing relative fetches keep working).
 */
const DEVICE_COOKIE_NAME = 'ns_device'
const deviceCookieOpts = {
    httpOnly: true,
    sameSite: 'strict',
    path: '/',
    secure: secureCookies,
}

const getDeviceCookieOpts = () => ({ ...deviceCookieOpts })

const getDeviceTokenFromRequest = (req) => {
    const bearer = getBearerTokenFromHeader(req)
    if (bearer) return bearer
    const fromCookie = req?.cookies?.[DEVICE_COOKIE_NAME]
    return typeof fromCookie === 'string' && fromCookie.length ? fromCookie : null
}

/** Resolve this request's approved device id, or null. Never trusts authSkipped(). */
const getApprovedDeviceId = (req) => {
    const token = getDeviceTokenFromRequest(req)
    if (!token) return null
    return deviceRegistry.verifyDeviceToken(token)
}

/**
 * Panel-scoped kiosk token for this request, or null. Wall browsers have no
 * device keypair, so their token authorizes exactly one panel.
 */
const getPanelKioskId = (req) => {
    const token = getDeviceTokenFromRequest(req)
    if (!token) return null
    // Lazy require: panelStore holds the panel records and does not require
    // sessionAuth, but keeping this out of module load avoids a cycle with
    // panelApi (which requires both).
    return require('../manager/panelStore').verifyKioskToken(token)
}

const isLoopbackPeer = (req) => {
    const address = normalizeClientAddress(getClientSocketAddress(req))
    return address === '127.0.0.1' || address === '::1'
}

/**
 * Admin access for the device-facing routes: a real login session, or a
 * direct local-dev caller. `authSkipped()` is deliberately not enough on its
 * own - every internet request arrives through the launcher on a private
 * (non-loopback) address, so only a loopback peer is trusted as local.
 */
const hasAdminAccess = (req, res = null) => {
    if (hasSessionCookie(req, res)) return true
    return authSkipped() && isLoopbackPeer(req)
}

const canAccessAsDeviceOrAdmin = (req, res = null) =>
    hasAdminAccess(req, res) || Boolean(getApprovedDeviceId(req))

const sendDeviceAuthFailure = (res, code, message) => {
    if (!res || typeof res.status !== 'function') return
    const error = code === 403 ? 'device_not_approved' : 'device_required'
    res.status(code).json({ error, message })
}

/** Routes only devices (and admins) may call: no shared secret, no authSkipped. */
const requireApprovedDevice = (req, res, next) => {
    if (!getDeviceTokenFromRequest(req)) {
        sendDeviceAuthFailure(res, 401, 'Pair this device in the netsocket dashboard and send its token.')
        return
    }
    if (!getApprovedDeviceId(req)) {
        sendDeviceAuthFailure(res, 403, 'Device token unknown or revoked, or the device is not approved.')
        return
    }
    next()
}

/** Device-or-admin gate for routes the dashboard also uses (panel shell, /v1/session). */
const requireDeviceOrAdmin = (req, res, next) => {
    if (canAccessAsDeviceOrAdmin(req, res)) return next()
    const wantsHtml = typeof req.accepts === 'function' && req.accepts('html')
    if (wantsHtml) {
        const redirect = encodeURIComponent(safeRedirectPath(req.originalUrl || '/dashboard'))
        return res.status(403).redirect(`/login?redirect=${redirect}`)
    }
    return sendDeviceAuthFailure(res, 401, 'An approved device or a dashboard session is required.')
}

/**
 * Flood guard for the device write routes (command intake, notification
 * forwarding). Tokens are 256-bit, so this is anti-flood rather than
 * anti-guessing; it keys on the device when known, else the socket peer.
 */
const DEVICE_RATE_WINDOW_MS = 60 * 1000
const DEVICE_RATE_MAX_REQUESTS = 60
const deviceRateBuckets = new Map()

const pruneDeviceRateBuckets = (now) => {
    for (const [key, entry] of deviceRateBuckets) {
        if (now - entry.windowStart > DEVICE_RATE_WINDOW_MS) deviceRateBuckets.delete(key)
    }
}

const deviceRequestKey = (req) =>
    getApprovedDeviceId(req) || `peer:${getClientSocketAddress(req) || 'unknown'}`

const allowDeviceRequest = (key, limit = DEVICE_RATE_MAX_REQUESTS) => {
    const now = Date.now()
    if (deviceRateBuckets.size > 0) pruneDeviceRateBuckets(now)
    let entry = deviceRateBuckets.get(key)
    if (!entry || now - entry.windowStart > DEVICE_RATE_WINDOW_MS) {
        entry = { windowStart: now, count: 0 }
    }
    entry.count += 1
    deviceRateBuckets.set(key, entry)
    return entry.count <= limit
}

const resetDeviceRateLimit = () => deviceRateBuckets.clear()

/**
 * Flood guard for credential endpoints (`/login`, `/v1/device/login`). It runs
 * regardless of the login mode: a disabled login screen is not a reason to
 * accept unbounded requests, and the device login endpoint is public by design.
 * Keyed by peer + scope so one caller cannot exhaust another's budget.
 */
const AUTH_RATE_MAX_ATTEMPTS = 20
const allowAuthAttempt = (req, scope, limit = AUTH_RATE_MAX_ATTEMPTS) =>
    allowDeviceRequest(`auth:${scope}:${getClientSocketAddress(req) || 'unknown'}`, limit)

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
    '/automate',
    '/panels',
    '/constructnodes.js',
    '/createnode.js',
    '/litegraph-editor.css',
    '/litegraph.css',
    '/litegraph.js',
    '/netsocket-editor.css',
    '/css/editor.css',
    '/css/shell.css',
    '/js/shell.js',
    '/js/widgets.js',
    '/js/widgeteditor.js',
    '/js/settingsmodal.js',
    '/js/editorbootstrap.js',
    '/js/panelsbootstrap.js',
    '/js/panelkioskbootstrap.js',
    '/js/paneldevicepicker.js',
    '/js/agentmarkdown.js',
    '/downloads/overlay',
    '/downloads/android',
    '/vendor/gridstack-all.js',
    '/inset.browser.js',
    '/graphmigration.js',
    '/aiproviders.js',
    '/subgrapheditor.js',
])

const isProtectedPagePath = (url) => {
    const pathOnly = String(url || '').split('?')[0].toLowerCase()
    if (PROTECTED_PAGE_PATHS.has(pathOnly)) return true
    // SPA hashed bundles under /assets are public (login page needs them);
    // hub HTML routes stay gated above. Panel kiosk is gated via requireUserSession.
    return false
}

const requireUserSession = (req, res, next) => {
    if (authSkipped()) return next()
    if (hasUserSession(req, res)) return next()
    revokeToken(req.cookies?.tk)
    res.clearCookie('tk', clearCookieOpts)
    const redirect = encodeURIComponent(safeRedirectPath(req.originalUrl || '/dashboard'))
    return res.status(403).redirect(`/login?redirect=${redirect}`)
}

/** Drop expired rate-limit buckets so spoofed/rotating addresses can't grow the map. */
const pruneLoginAttempts = (now = Date.now()) => {
    for (const [ip, entry] of loginAttemptsByIp) {
        if (now - entry.windowStart > LOGIN_RATE_WINDOW_MS) loginAttemptsByIp.delete(ip)
    }
}

const loginRateLimit = (req, res, next) => {
    if (authSkipped()) return next()
    const ip = req.ip || req.socket?.remoteAddress || 'unknown'
    const now = Date.now()
    if (loginAttemptsByIp.size > 0) pruneLoginAttempts(now)
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

/** Successful sign-in clears the failure counter so a legit user isn't held out. */
const clearLoginAttempts = (req) => {
    const ip = req.ip || req.socket?.remoteAddress || 'unknown'
    loginAttemptsByIp.delete(ip)
}

const resetLoginRateLimit = () => {
    loginAttemptsByIp.clear()
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
    authEnabled,
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
    providedSecretMatches,
    getBearerTokenFromHeader,
    bearerTokenMatches,
    DEVICE_COOKIE_NAME,
    deviceCookieOpts,
    getDeviceCookieOpts,
    getDeviceTokenFromRequest,
    getApprovedDeviceId,
    getPanelKioskId,
    isLoopbackPeer,
    hasAdminAccess,
    hasSessionCookie,
    canAccessAsDeviceOrAdmin,
    requireApprovedDevice,
    requireDeviceOrAdmin,
    deviceRequestKey,
    allowDeviceRequest,
    allowAuthAttempt,
    resetDeviceRateLimit,
    isLanAddress,
    isLanClient,
    getClientSocketAddress,
    safeRedirectPath,
    isProtectedPagePath,
    requireUserSession,
    recordFailedLoginAttempt,
    clearLoginAttempts,
    resetLoginRateLimit,
    loginRateLimit,
    securityHeaders,
}
