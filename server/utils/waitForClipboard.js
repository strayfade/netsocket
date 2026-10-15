const { log } = require('../log')
const { triggerNodesByType } = require('../manager/execute')

const onNewClipboard = async (content, deviceId = null) => {
    log(`Clipboard updated${deviceId ? ` from ${deviceId}` : ''}`)
    await triggerNodesByType('Triggers/Clipboard Updated', {
        'Clipboard Content': content,
        'Device ID': deviceId,
    })
}

module.exports = { onNewClipboard }
