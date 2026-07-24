const { log } = require('../log')
const { triggerNodesByType } = require('../manager/execute')

const onNewCommand = async (textContent, conversationId = null, deviceId = null) => {
    log(`Command received: ${textContent}`)
    await triggerNodesByType('Triggers/Command Palette', {
        'Content': textContent,
        'Conversation ID': conversationId,
        'Device ID': deviceId,
    })
}

module.exports = { onNewCommand }
