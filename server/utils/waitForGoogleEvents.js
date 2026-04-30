const { getNodes } = require('../manager/saveState')
const { executeGraph } = require('../manager/execute')

const onNewGmailEmail = async (email, nodeId = null) => {
    if (!getNodes().nodes) return;
    let nodes = getNodes().nodes.nodes
    for (i of nodes) {
        if (i.type == "Triggers/New Email (Gmail)" && (!nodeId || i.id == nodeId)) {
            await executeGraph(i, {
                "From": email.from || "",
                "Subject": email.subject || "",
                "Snippet": email.snippet || "",
                "Message ID": email.messageId || "",
                "Thread ID": email.threadId || "",
                "Payload": JSON.stringify(email.payload || {})
            })
        }
    }
}

const onUpcomingCalendarEvent = async (eventData, nodeId = null) => {
    if (!getNodes().nodes) return;
    let nodes = getNodes().nodes.nodes
    for (i of nodes) {
        if (i.type == "Triggers/Google Calendar Upcoming Event" && (!nodeId || i.id == nodeId)) {
            await executeGraph(i, {
                "Event ID": eventData.eventId || "",
                "Summary": eventData.summary || "",
                "Start": eventData.start || "",
                "End": eventData.end || "",
                "Calendar ID": eventData.calendarId || "primary",
                "Payload": JSON.stringify(eventData.payload || {})
            })
        }
    }
}

module.exports = { onNewGmailEmail, onUpcomingCalendarEvent }
