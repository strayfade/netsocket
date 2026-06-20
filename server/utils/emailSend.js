'use strict'

const net = require('node:net')
const tls = require('node:tls')

const readResponse = (socket) => new Promise((resolve, reject) => {
    let buffer = ''
    const onData = (chunk) => {
        buffer += chunk.toString('utf8')
        if (/^\d{3} /m.test(buffer) && buffer.includes('\r\n')) {
            cleanup()
            resolve(buffer)
        }
    }
    const onError = (error) => {
        cleanup()
        reject(error)
    }
    const cleanup = () => {
        socket.removeListener('data', onData)
        socket.removeListener('error', onError)
    }
    socket.on('data', onData)
    socket.on('error', onError)
})

const sendCommand = (socket, command) => new Promise((resolve, reject) => {
    socket.write(`${command}\r\n`, (error) => {
        if (error) reject(error)
        else resolve()
    })
})

const expectCode = (response, codes) => {
    const code = Number.parseInt(String(response).slice(0, 3), 10)
    return codes.includes(code)
}

const createTransport = (options) => {
    if (options.secure) {
        return tls.connect({
            host: options.host,
            port: options.port,
            servername: options.host,
        })
    }
    return net.connect({ host: options.host, port: options.port })
}

const sendEmail = async (options) => {
    const host = String(options.host || '').trim()
    const port = Number(options.port || 587)
    const secure = Boolean(options.secure)
    const username = String(options.username || '')
    const password = String(options.password || '')
    const from = String(options.from || username)
    const to = String(options.to || '').trim()
    const subject = String(options.subject || '')
    const text = String(options.text || '')
    const html = options.html != null ? String(options.html) : null

    if (!host || !from || !to) {
        throw new Error('SMTP host, from, and to addresses are required')
    }

    const socket = createTransport({ host, port, secure })
    await new Promise((resolve, reject) => {
        socket.once('secureConnect', resolve)
        socket.once('connect', resolve)
        socket.once('error', reject)
    })

    try {
        let response = await readResponse(socket)
        if (!expectCode(response, [220])) {
            throw new Error(`Unexpected SMTP greeting: ${response}`)
        }

        await sendCommand(socket, `EHLO ${host}`)
        response = await readResponse(socket)
        if (!expectCode(response, [250])) {
            throw new Error(`EHLO failed: ${response}`)
        }

        let activeSocket = socket

        if (!secure && port !== 465 && /STARTTLS/i.test(response)) {
            await sendCommand(activeSocket, 'STARTTLS')
            response = await readResponse(activeSocket)
            if (!expectCode(response, [220])) {
                throw new Error(`STARTTLS failed: ${response}`)
            }

            activeSocket = tls.connect({
                socket: activeSocket,
                servername: host,
            })

            await new Promise((resolve, reject) => {
                activeSocket.once('secureConnect', resolve)
                activeSocket.once('error', reject)
            })

            await sendCommand(activeSocket, `EHLO ${host}`)
            response = await readResponse(activeSocket)
            if (!expectCode(response, [250])) {
                throw new Error(`EHLO after STARTTLS failed: ${response}`)
            }
        }

        if (username) {
            await sendCommand(activeSocket, 'AUTH LOGIN')
            response = await readResponse(activeSocket)
            if (!expectCode(response, [334])) {
                throw new Error(`AUTH LOGIN failed: ${response}`)
            }

            await sendCommand(activeSocket, Buffer.from(username).toString('base64'))
            response = await readResponse(activeSocket)
            if (!expectCode(response, [334])) {
                throw new Error(`SMTP username rejected: ${response}`)
            }

            await sendCommand(activeSocket, Buffer.from(password).toString('base64'))
            response = await readResponse(activeSocket)
            if (!expectCode(response, [235])) {
                throw new Error(`SMTP password rejected: ${response}`)
            }
        }

        await sendCommand(activeSocket, `MAIL FROM:<${from}>`)
        response = await readResponse(activeSocket)
        if (!expectCode(response, [250])) {
            throw new Error(`MAIL FROM failed: ${response}`)
        }

        await sendCommand(activeSocket, `RCPT TO:<${to}>`)
        response = await readResponse(activeSocket)
        if (!expectCode(response, [250, 251])) {
            throw new Error(`RCPT TO failed: ${response}`)
        }

        await sendCommand(activeSocket, 'DATA')
        response = await readResponse(activeSocket)
        if (!expectCode(response, [354])) {
            throw new Error(`DATA command failed: ${response}`)
        }

        const headers = [
            `From: ${from}`,
            `To: ${to}`,
            `Subject: ${subject}`,
            'MIME-Version: 1.0',
        ]

        if (html) {
            const boundary = `netsocket-${Date.now()}`
            headers.push(`Content-Type: multipart/alternative; boundary="${boundary}"`)
            const body = [
                `--${boundary}`,
                'Content-Type: text/plain; charset=utf-8',
                '',
                text,
                `--${boundary}`,
                'Content-Type: text/html; charset=utf-8',
                '',
                html,
                `--${boundary}--`,
            ].join('\r\n')
            await sendCommand(activeSocket, `${headers.join('\r\n')}\r\n\r\n${body}\r\n.`)
        } else {
            headers.push('Content-Type: text/plain; charset=utf-8')
            await sendCommand(activeSocket, `${headers.join('\r\n')}\r\n\r\n${text}\r\n.`)
        }

        response = await readResponse(activeSocket)
        if (!expectCode(response, [250])) {
            throw new Error(`Message not accepted: ${response}`)
        }

        await sendCommand(activeSocket, 'QUIT')
        await readResponse(activeSocket)
        return true
    } finally {
        socket.end()
    }
}

module.exports = {
    sendEmail,
}
