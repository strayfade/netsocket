const fs = require('fs').promises
const path = require('path')
const { config } = require(path.join(__dirname, '../config'))

async function main() {
    await fs.unlink(config.storage.credentials).catch(() => {})
    await fs.writeFile(config.storage.users, JSON.stringify([]), { encoding: 'utf-8' })
    console.log('Credentials removed and sessions cleared. Next visit to /login will show Create account.')
    console.log('If the server is running, restart it so it reloads credential state.')
}

main().catch((e) => {
    console.error(e)
    process.exit(1)
})
