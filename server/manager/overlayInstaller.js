const fs = require('fs')
const path = require('path')

const INSTALLER_FILENAME = 'netsocket-overlay-setup.exe'
const INSTALLER_PATH = path.join(
    __dirname,
    '../../extensions/overlay/installer',
    INSTALLER_FILENAME
)

const overlayInstallerAvailable = () => {
    try {
        const stat = fs.statSync(INSTALLER_PATH)
        return stat.isFile() && stat.size > 0
    } catch {
        return false
    }
}

module.exports = {
    INSTALLER_FILENAME,
    INSTALLER_PATH,
    overlayInstallerAvailable,
}
