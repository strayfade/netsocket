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
    'text',
    '',
    'Open <a href="/v1/google/auth/start" target="_blank" rel="noopener">Google Connect</a> to sign in from the web UI.'
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

const getStoredTokens = () => {
    const raw = settingsManager.getSetting('google.oauth.tokens')
    if (!raw) return null
    try {
        return JSON.parse(raw)
    } catch {
        return null
    }
}

const setStoredTokens = async (tokens) => {
    settingsManager.setSetting('google.oauth.tokens', JSON.stringify(tokens || {}))
    await settingsManager.saveSettings()
}

const getAuthorizedGoogleClient = () => {
    const oAuth2Client = buildOAuthClient()
    if (!oAuth2Client) return null
    const tokens = getStoredTokens()
    if (!tokens) return null
    oAuth2Client.setCredentials(tokens)
    return oAuth2Client
}

module.exports = {
    SCOPES,
    buildOAuthClient,
    getStoredTokens,
    setStoredTokens,
    getAuthorizedGoogleClient
}
