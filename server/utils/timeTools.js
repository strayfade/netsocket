'use strict'

const parseDate = (input) => {
    if (input == null || input === '') {
        return NaN
    }

    if (typeof input === 'number' && Number.isFinite(input)) {
        return input
    }

    const text = String(input).trim()
    if (/^\d+$/.test(text)) {
        const numeric = Number(text)
        return Number.isFinite(numeric) ? numeric : NaN
    }

    const parsed = Date.parse(text)
    return Number.isFinite(parsed) ? parsed : NaN
}

const UNIT_MS = {
    ms: 1,
    s: 1000,
    sec: 1000,
    second: 1000,
    seconds: 1000,
    m: 60 * 1000,
    min: 60 * 1000,
    minute: 60 * 1000,
    minutes: 60 * 1000,
    h: 60 * 60 * 1000,
    hr: 60 * 60 * 1000,
    hour: 60 * 60 * 1000,
    hours: 60 * 60 * 1000,
    d: 24 * 60 * 60 * 1000,
    day: 24 * 60 * 60 * 1000,
    days: 24 * 60 * 60 * 1000,
}

const addDuration = (timestamp, amount, unit) => {
    const base = parseDate(timestamp)
    if (!Number.isFinite(base)) {
        return NaN
    }

    const numericAmount = Number(amount)
    if (!Number.isFinite(numericAmount)) {
        return NaN
    }

    const multiplier = UNIT_MS[String(unit || 'ms').toLowerCase()]
    if (!multiplier) {
        return NaN
    }

    return base + numericAmount * multiplier
}

const isWithinRange = (value, start, end, inclusive = true) => {
    const point = parseDate(value)
    const rangeStart = parseDate(start)
    const rangeEnd = parseDate(end)

    if (!Number.isFinite(point) || !Number.isFinite(rangeStart) || !Number.isFinite(rangeEnd)) {
        return false
    }

    if (inclusive) {
        return point >= rangeStart && point <= rangeEnd
    }
    return point > rangeStart && point < rangeEnd
}

const parseWeekdays = (value) => {
    if (Array.isArray(value)) {
        return value.map(Number).filter((day) => day >= 0 && day <= 6)
    }

    return String(value || '1,2,3,4,5')
        .split(',')
        .map((part) => Number(part.trim()))
        .filter((day) => Number.isInteger(day) && day >= 0 && day <= 6)
}

const isBusinessHours = (timestamp, options = {}) => {
    const point = parseDate(timestamp != null ? timestamp : Date.now())
    if (!Number.isFinite(point)) {
        return false
    }

    const startHour = Number(options.startHour != null ? options.startHour : 9)
    const endHour = Number(options.endHour != null ? options.endHour : 17)
    const weekdays = parseWeekdays(options.weekdays)
    const timeZone = options.timeZone || 'UTC'

    const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone,
        weekday: 'short',
        hour: 'numeric',
        hour12: false,
    })

    const parts = formatter.formatToParts(new Date(point))
    const weekdayPart = parts.find((part) => part.type === 'weekday')
    const hourPart = parts.find((part) => part.type === 'hour')

    const weekdayMap = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }
    const weekday = weekdayMap[weekdayPart ? weekdayPart.value : '']
    const hour = Number(hourPart ? hourPart.value : NaN)

    if (!Number.isInteger(weekday) || !Number.isFinite(hour)) {
        return false
    }

    if (!weekdays.includes(weekday)) {
        return false
    }

    return hour >= startHour && hour < endHour
}

module.exports = {
    parseDate,
    addDuration,
    isWithinRange,
    isBusinessHours,
    parseWeekdays,
}
