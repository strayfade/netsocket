'use strict'

const { spawnSync } = require('node:child_process')

function parseWindowsNetstatListeningPids(output, port) {
    const pids = new Set()
    const portPattern = new RegExp(`:${port}\\s`)

    for (const line of String(output || '').split(/\r?\n/)) {
        if (!/LISTENING/i.test(line) || !portPattern.test(line)) continue
        const parts = line.trim().split(/\s+/)
        const pid = Number.parseInt(parts[parts.length - 1], 10)
        if (Number.isInteger(pid) && pid > 0) pids.add(pid)
    }

    return [...pids]
}

function parseUnixLsofPids(output) {
    const pids = new Set()

    for (const line of String(output || '').split(/\r?\n/)) {
        const pid = Number.parseInt(line.trim(), 10)
        if (Number.isInteger(pid) && pid > 0) pids.add(pid)
    }

    return [...pids]
}

function parseSsListeningPids(output) {
    const pids = new Set()

    for (const match of String(output || '').matchAll(/pid=(\d+)/g)) {
        const pid = Number.parseInt(match[1], 10)
        if (Number.isInteger(pid) && pid > 0) pids.add(pid)
    }

    return [...pids]
}

function findListeningPids(port) {
    const normalizedPort = Number(port)
    if (!Number.isInteger(normalizedPort) || normalizedPort <= 0 || normalizedPort > 65535) {
        throw new Error(`Invalid port: ${port}`)
    }

    if (process.platform === 'win32') {
        const result = spawnSync('netstat', ['-ano'], { encoding: 'utf8', windowsHide: true })
        return parseWindowsNetstatListeningPids(result.stdout, normalizedPort)
    }

    const lsof = spawnSync('lsof', ['-t', `-iTCP:${normalizedPort}`, '-sTCP:LISTEN'], {
        encoding: 'utf8',
    })
    if (lsof.status === 0 && lsof.stdout) {
        return parseUnixLsofPids(lsof.stdout)
    }

    const ss = spawnSync('ss', ['-lptn', `sport = :${normalizedPort}`], { encoding: 'utf8' })
    if (ss.status === 0 && ss.stdout) {
        return parseSsListeningPids(ss.stdout)
    }

    return []
}

function killPid(pid) {
    if (process.platform === 'win32') {
        const result = spawnSync('taskkill', ['/PID', String(pid), '/F'], {
            encoding: 'utf8',
            windowsHide: true,
        })
        if (result.status !== 0) {
            throw new Error((result.stderr || result.stdout || `taskkill failed for pid ${pid}`).trim())
        }
        return
    }

    process.kill(pid, 'SIGKILL')
}

function killProcessOnPort(port, options = {}) {
    const excludePid = Number.isInteger(options.excludePid) ? options.excludePid : process.pid
    const pids = findListeningPids(port).filter((pid) => pid !== excludePid)

    for (const pid of pids) {
        killPid(pid)
    }

    return pids
}

module.exports = {
    parseWindowsNetstatListeningPids,
    parseUnixLsofPids,
    parseSsListeningPids,
    findListeningPids,
    killProcessOnPort,
}
