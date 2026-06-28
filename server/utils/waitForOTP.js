const { askAI, DEFAULT_MODEL } = require('./languageModel')
const { log, logColors } = require('../log')
const { triggerNodesByType } = require('../manager/execute')

let newOTP = false
let lastOTP = 0

const onNewNotification = async (notificationContent) => {
    await triggerNodesByType('Triggers/iOS Notification', {
        'Title': notificationContent.title,
        'Content': notificationContent.textContent,
        'Bundle ID': notificationContent.bundleIdentifier,
    })

    const prompt = `
    The following is the content of an iOS notification. If the notification contains a two-factor/OTP authentication code, respond with ONLY the code, isolating it from the rest of the text. If it does NOT contain a two-factor/OTP code, simply respond with "None". Codes will usually be six-digit numerical values, so prioritize those if they exist in the notification.
    
    ${notificationContent.textContent}
    `
    try {
        const code = await askAI(prompt, null, DEFAULT_MODEL)
        if (code.trim().toLowerCase() != 'none') {
            lastOTP = code
            log(`OTP Received: ${lastOTP}`, logColors.SuccessVisible)
            newOTP = true
        }
    } catch (e) {
        log(`Error: ${e}`, logColors.Error)
    }
}

const waitForOTP = async () => {
    while (!newOTP) {
        await new Promise((resolve) => setTimeout(resolve, 100))
    }
    newOTP = false
    return lastOTP.toString()
}

module.exports = { onNewNotification, waitForOTP }
