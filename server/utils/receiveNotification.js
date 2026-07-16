const { askAI, DEFAULT_MODEL } = require('./languageModel')
const { log, logColors } = require('../log')
const { triggerNodesByType } = require('../manager/execute')

let newOTP = false
let lastOTP = 0

const onNewNotification = async (notificationContent) => {
    await triggerNodesByType('Triggers/Notification Received', {
        'Title': notificationContent.title,
        'Content': notificationContent.textContent,
        'Bundle ID': notificationContent.bundleIdentifier,
        'Device ID': notificationContent.deviceId,
    })
}

module.exports = { onNewNotification }
