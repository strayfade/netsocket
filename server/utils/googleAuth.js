const { google } = require('googleapis')
const settingsManager = require('../manager/settingsManager')
require('../manager/nodePreferencesRegistry').addPref(
    'Google',
    'google.oauth.clientId',
    'Google OAuth Client ID',
    'text',
    '',
    'OAuth client ID from your Google Cloud app credentials.'
);
require('../manager/nodePreferencesRegistry').addPref(
    'Google',
    'google.oauth.clientSecret',
    'Google OAuth Client Secret',
    'text',
    '',
    'OAuth client secret from your Google Cloud app credentials.'
);
require('../manager/nodePreferencesRegistry').addPref(
    'Google',
    'google.oauth.redirectUri',
    'Google OAuth Redirect URI',
    'text',
    '',
    'Optional. Defaults to <code>http://127.0.0.1:4675/v1/google/auth/callback</code>.'
);
require('../manager/nodePreferencesRegistry').addPref(
    'Google',
    'google.oauth.connect',
    'Connect Google Account',
    'readonly',
    '',
    '<a href="/v1/google/auth/start" target="_blank" rel="noopener">Click here</a> to sign in or switch accounts from the web UI.'
);

const SCOPES = [
    'https://www.googleapis.com/auth/gmail.readonly',
    'https://www.googleapis.com/auth/calendar.readonly'
]

const getRedirectUri = (req) => {
    const configured = settingsManager.getSetting('google.oauth.redirectUri')
    if (configured && configured.trim()) return configured.trim()
    const host = req?.get ? req.get('host') : '127.0.0.1:4675'
    const protocol = req?.protocol || 'http'
    return `${protocol}://${host}/v1/google/auth/callback`
}

const buildOAuthClient = (req = null) => {
    const clientId = settingsManager.getSetting('google.oauth.clientId')
    const clientSecret = settingsManager.getSetting('google.oauth.clientSecret')
    if (!clientId || !clientSecret) return null
    return new google.auth.OAuth2(clientId, clientSecret, getRedirectUri(req))
}

const CONNECTED_EMAIL_KEY = 'google.oauth.connectedEmail'

const getStoredTokens = () => {
    const raw = settingsManager.getSetting('google.oauth.tokens')
    if (!raw) return null
    try {
        return JSON.parse(raw)
    } catch {
        return null
    }
}

/** Merge new OAuth tokens with existing; Google omits refresh_token on re-auth unless rotating. */
const mergeTokenSets = (existing, incoming) => {
    const merged = { ...(existing || {}), ...(incoming || {}) }
    if (!incoming?.refresh_token && existing?.refresh_token) {
        merged.refresh_token = existing.refresh_token
    }
    return merged
}

let authClientSingleton = null

const setStoredTokens = async (tokens) => {
    settingsManager.setSetting('google.oauth.tokens', JSON.stringify(tokens || {}))
    await settingsManager.saveSettings()
}

/**
 * After OAuth exchange: persist tokens, fetch Gmail profile email for settings UI.
 */
const persistOAuthSession = async (oAuth2Client, tokens) => {
    await setStoredTokens(tokens)
    oAuth2Client.setCredentials(tokens)
    try {
        const gmail = google.gmail({ version: 'v1', auth: oAuth2Client })
        const profile = await gmail.users.getProfile({ userId: 'me' })
        const email = profile.data.emailAddress || ''
        settingsManager.setSetting(CONNECTED_EMAIL_KEY, email)
        await settingsManager.saveSettings()
    } catch {
        // tokens still valid for API use; email is optional in UI
    }
}

const getAuthorizedGoogleClient = () => {
    const tokens = getStoredTokens()
    if (!tokens || !Object.keys(tokens).length) {
        authClientSingleton = null
        return null
    }
    if (!authClientSingleton) {
        const client = buildOAuthClient()
        if (!client) return null
        authClientSingleton = client
        authClientSingleton.on('tokens', async (newTokens) => {
            const existing = getStoredTokens() || {}
            const merged = mergeTokenSets(existing, newTokens)
            await setStoredTokens(merged)
        })
    }
    authClientSingleton.setCredentials(tokens)
    return authClientSingleton
}

module.exports = {
    SCOPES,
    buildOAuthClient,
    getStoredTokens,
    setStoredTokens,
    getAuthorizedGoogleClient,
    mergeTokenSets,
    persistOAuthSession,
    CONNECTED_EMAIL_KEY
}
