const { log, logColors } = require('../log')
const { triggerNodesByType } = require('../manager/execute')

const onGenericWebhook = async ({ method, path, query, headers, body }) => {
    await triggerNodesByType('Triggers/Webhook', {
        'Method': method || '',
        'Path': path || '',
        'Query': JSON.stringify(query || {}),
        'Headers': JSON.stringify(headers || {}),
        'Body': JSON.stringify(body || {}),
    })
}

const onGitHubWebhook = async ({ eventType, deliveryId, payload }) => {
    const repoName = payload?.repository?.full_name || ''
    const senderLogin = payload?.sender?.login || ''
    const action = payload?.action || ''

    await triggerNodesByType('Triggers/GitHub Webhook', {
        'Event Type': eventType || '',
        'Delivery ID': deliveryId || '',
        'Repository': repoName,
        'Action': action,
        'Sender': senderLogin,
        'Payload': JSON.stringify(payload || {}),
    })

    log(`GitHub webhook received: ${eventType || 'unknown'} (${repoName || 'no-repo'})`, logColors.Success)
}

module.exports = { onGenericWebhook, onGitHubWebhook }
