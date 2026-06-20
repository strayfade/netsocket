const { log } = require('../log')
const { triggerNodesByType } = require('../manager/execute')

const onNewCommand = async (textContent, conversationId = null) => {
    log(`Command received: ${textContent}`)
    await triggerNodesByType('Triggers/Command Palette', {
        'Content': textContent,
        'Conversation ID': conversationId,
    })
}

module.exports = { onNewCommand }
