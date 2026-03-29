const fs = require('fs').promises
const { config } = require('../config')

let cached = null

const populateCredentials = async () => {
    try {
        const raw = await fs.readFile(config.storage.credentials, { encoding: 'utf-8' })
        const data = JSON.parse(raw)
        if (data && typeof data.usernameHash === 'string' && typeof data.passwordHash === 'string') {
            cached = { usernameHash: data.usernameHash, passwordHash: data.passwordHash }
        } else {
            cached = null
        }
    } catch {
        cached = null
    }
}

const hasAccount = () => cached != null

const getHashes = () => cached

const setCredentials = async (usernameHash, passwordHash) => {
    cached = { usernameHash, passwordHash }
    await fs.writeFile(
        config.storage.credentials,
        JSON.stringify({ usernameHash, passwordHash }),
        { encoding: 'utf-8' }
    )
}

const clearCredentials = async () => {
    cached = null
    await fs.unlink(config.storage.credentials).catch(() => {})
}

module.exports = {
    populateCredentials,
    hasAccount,
    getHashes,
    setCredentials,
    clearCredentials,
}
