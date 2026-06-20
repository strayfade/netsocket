'use strict'

const buckets = new Map()

const checkThrottle = (key, maxExecutions, windowMs, now = Date.now()) => {
    const limit = Math.max(1, Number(maxExecutions) || 1)
    const window = Math.max(1, Number(windowMs) || 1000)
    const bucketKey = String(key || 'default')

    let bucket = buckets.get(bucketKey)
    if (!bucket) {
        bucket = { timestamps: [] }
        buckets.set(bucketKey, bucket)
    }

    bucket.timestamps = bucket.timestamps.filter((stamp) => now - stamp < window)

    if (bucket.timestamps.length >= limit) {
        return {
            allowed: false,
            count: bucket.timestamps.length,
            retryAfterMs: window - (now - bucket.timestamps[0]),
        }
    }

    bucket.timestamps.push(now)
    return {
        allowed: true,
        count: bucket.timestamps.length,
        retryAfterMs: 0,
    }
}

const resetThrottle = (key) => {
    buckets.delete(String(key || 'default'))
}

const resetAllThrottles = () => {
    buckets.clear()
}

module.exports = {
    checkThrottle,
    resetThrottle,
    resetAllThrottles,
}
