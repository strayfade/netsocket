const { google } = require('googleapis')
const { log, logColors } = require('../log')
const { getNodes } = require('../manager/saveState')
const { getGraphNodes } = require('../manager/graphUtils')
const { number } = require('./inputParser')
const { getAuthorizedGoogleClient } = require('./googleAuth')
const { onNewGmailEmail, onUpcomingCalendarEvent } = require('./waitForGoogleEvents')

const seenGmailIds = new Set()
const firedCalendarEventKeys = new Set()
let primedGmail = false
let pollTimer = null

const capSet = (set, maxSize = 300) => {
    while (set.size > maxSize) {
        const first = set.values().next().value
        set.delete(first)
    }
}

const getTriggerNodes = () => {
    const nodes = getGraphNodes(getNodes())
    return {
        gmail: nodes.filter((n) => n.type === 'Triggers/New Email (Gmail)'),
        calendar: nodes.filter((n) => n.type === 'Triggers/Google Calendar Upcoming Event'),
    }
}

const pollGmail = async (authClient, triggerNodes) => {
    if (!triggerNodes.length) return
    const gmail = google.gmail({ version: 'v1', auth: authClient })
    const list = await gmail.users.messages.list({
        userId: 'me',
        maxResults: 8,
        q: 'newer_than:2d'
    })
    const messages = list.data.messages || []

    if (!primedGmail) {
        for (const m of messages) seenGmailIds.add(m.id)
        capSet(seenGmailIds, 500)
        primedGmail = true
        return
    }

    for (const message of messages) {
        if (!message.id || seenGmailIds.has(message.id)) continue
        seenGmailIds.add(message.id)
        const full = await gmail.users.messages.get({
            userId: 'me',
            id: message.id,
            format: 'metadata',
            metadataHeaders: ['From', 'Subject']
        })
        const payload = full.data || {}
        const headers = payload.payload?.headers || []
        const from = headers.find((h) => h.name === 'From')?.value || ''
        const subject = headers.find((h) => h.name === 'Subject')?.value || ''
        for (const node of triggerNodes) {
            await onNewGmailEmail({
                from,
                subject,
                snippet: payload.snippet || '',
                messageId: payload.id || '',
                threadId: payload.threadId || '',
                payload
            }, node.id)
        }
    }
    capSet(seenGmailIds, 500)
}

const pollCalendar = async (authClient, triggerNodes) => {
    if (!triggerNodes.length) return
    const calendar = google.calendar({ version: 'v3', auth: authClient })
    const now = Date.now()
    for (const node of triggerNodes) {
        const lookaheadMins = Math.max(1, number(node.properties?.["Lookahead Minutes"] || "15"))
        const maxTime = new Date(now + lookaheadMins * 60 * 1000).toISOString()
        const eventsResponse = await calendar.events.list({
            calendarId: 'primary',
            timeMin: new Date(now).toISOString(),
            timeMax: maxTime,
            singleEvents: true,
            orderBy: 'startTime',
            maxResults: 10
        })
        const events = eventsResponse.data.items || []
        for (const event of events) {
            const start = event.start?.dateTime || event.start?.date || ''
            const end = event.end?.dateTime || event.end?.date || ''
            const key = `${node.id}:${event.id}:${start}`
            if (firedCalendarEventKeys.has(key)) continue
            firedCalendarEventKeys.add(key)
            await onUpcomingCalendarEvent({
                eventId: event.id || '',
                summary: event.summary || '(No title)',
                start,
                end,
                calendarId: 'primary',
                payload: event
            }, node.id)
        }
    }
    capSet(firedCalendarEventKeys, 1000)
}

const runPoll = async () => {
    try {
        const authClient = getAuthorizedGoogleClient()
        if (!authClient) return
        const nodes = getTriggerNodes()
        if (!nodes.gmail.length && !nodes.calendar.length) return
        await pollGmail(authClient, nodes.gmail)
        await pollCalendar(authClient, nodes.calendar)
    } catch (e) {
        log(`Google trigger poller error: ${e}`, logColors.Warning)
    }
}

const startGoogleTriggerPoller = () => {
    if (pollTimer) return
    pollTimer = setInterval(runPoll, 30000)
    runPoll().catch(() => { })
    log('Google trigger poller started')
}

module.exports = { startGoogleTriggerPoller, runPoll }
