'use strict';

const dgram = require('dgram')

// Seconds between the NTP epoch (1900-01-01) and the Unix epoch (1970-01-01).
const NTP_UNIX_DELTA = 2208988800
const DEFAULT_HOSTS = Object.freeze([
    'time.google.com',
    'time.cloudflare.com',
    'pool.ntp.org',
])
const DEFAULT_TIMEOUT_MS = 2500
const PACKET_SIZE = 48

const ntpSecondsToUnixMs = (seconds, fraction) => {
    const whole = (seconds - NTP_UNIX_DELTA) * 1000
    const frac = Math.floor((fraction / 0x100000000) * 1000)
    return whole + frac
}

/**
 * Query one NTP/SNTP server over UDP and return Unix epoch milliseconds.
 * deps.send may inject a fake transport for tests.
 */
const queryNtpHost = (host, opts = {}) => {
    const timeoutMs = opts.timeoutMs == null ? DEFAULT_TIMEOUT_MS : opts.timeoutMs
    const port = opts.port == null ? 123 : opts.port
    if (typeof opts.send === 'function') {
        return opts.send(host, port, timeoutMs)
    }
    return new Promise((resolve, reject) => {
        const socket = dgram.createSocket('udp4')
        let settled = false
        const finish = (err, value) => {
            if (settled) return
            settled = true
            clearTimeout(timer)
            try { socket.close() } catch (_) { /* ignore */ }
            if (err) reject(err)
            else resolve(value)
        }
        const timer = setTimeout(() => finish(new Error('ntp_timeout')), timeoutMs)
        socket.on('error', (err) => finish(err))
        socket.on('message', (msg) => {
            if (!Buffer.isBuffer(msg) || msg.length < PACKET_SIZE) {
                finish(new Error('ntp_bad_packet'))
                return
            }
            const seconds = msg.readUInt32BE(40)
            const fraction = msg.readUInt32BE(44)
            if (!seconds) {
                finish(new Error('ntp_zero_timestamp'))
                return
            }
            finish(null, ntpSecondsToUnixMs(seconds, fraction))
        })
        const packet = Buffer.alloc(PACKET_SIZE)
        // LI = 0, VN = 3, Mode = 3 (client)
        packet[0] = 0x1b
        socket.send(packet, 0, packet.length, port, host, (err) => {
            if (err) finish(err)
        })
    })
}

/**
 * Try hosts in order until one returns a usable NTP timestamp.
 */
const queryNtp = async (opts = {}) => {
    const hosts = Array.isArray(opts.hosts) && opts.hosts.length
        ? opts.hosts
        : DEFAULT_HOSTS
    let lastError = null
    for (const host of hosts) {
        try {
            return await queryNtpHost(host, opts)
        } catch (err) {
            lastError = err
        }
    }
    throw lastError || new Error('ntp_failed')
}

module.exports = {
    NTP_UNIX_DELTA,
    DEFAULT_HOSTS,
    DEFAULT_TIMEOUT_MS,
    ntpSecondsToUnixMs,
    queryNtpHost,
    queryNtp,
}
