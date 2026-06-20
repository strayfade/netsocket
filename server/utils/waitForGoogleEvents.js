const { triggerNodesByType } = require('../manager/execute')

const onNewGmailEmail = async (email, nodeId = null) => {
    await triggerNodesByType('Triggers/New Email (Gmail)', {
        'From': email.from || '',
        'Subject': email.subject || '',
        'Snippet': email.snippet || '',
        'Message ID': email.messageId || '',
        'Thread ID': email.threadId || '',
        'Payload': JSON.stringify(email.payload || {}),
    }, {
        filter: (node) => !nodeId || node.id === nodeId,
    })
}

const onUpcomingCalendarEvent = async (eventData, nodeId = null) => {
    await triggerNodesByType('Triggers/Google Calendar Upcoming Event', {
        'Event ID': eventData.eventId || '',
        'Summary': eventData.summary || '',
        'Start': eventData.start || '',
        'End': eventData.end || '',
        'Calendar ID': eventData.calendarId || 'primary',
        'Payload': JSON.stringify(eventData.payload || {}),
    }, {
        filter: (node) => !nodeId || node.id === nodeId,
    })
}

module.exports = { onNewGmailEmail, onUpcomingCalendarEvent }
