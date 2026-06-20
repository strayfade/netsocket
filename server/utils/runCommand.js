'use strict'

const { spawn } = require('node:child_process')

const runCommand = (options) => new Promise((resolve) => {
    const fullCommand = String(options.command || '').trim()
    const cwd = options.cwd ? String(options.cwd) : undefined
    const useShell = Boolean(options.useShell)
    const timeoutMs = Math.min(
        Math.max(Number(options.timeoutMs) || 30000, 1000),
        300000
    )

    if (!fullCommand) {
        resolve({
            ok: false,
            stdout: '',
            stderr: 'Command is required',
            exitCode: 1,
        })
        return
    }

    let stdout = ''
    let stderr = ''
    let timedOut = false

    const child = useShell
        ? spawn(fullCommand, {
            cwd,
            shell: true,
            windowsHide: true,
        })
        : (() => {
            const parts = fullCommand.split(/\s+/).filter(Boolean)
            const executable = parts[0]
            const args = parts.slice(1)
            return spawn(executable, args, {
                cwd,
                shell: false,
                windowsHide: true,
            })
        })()

    const timer = setTimeout(() => {
        timedOut = true
        child.kill('SIGTERM')
    }, timeoutMs)

    child.stdout.on('data', (chunk) => {
        stdout += chunk.toString('utf8')
    })

    child.stderr.on('data', (chunk) => {
        stderr += chunk.toString('utf8')
    })

    child.on('error', (error) => {
        clearTimeout(timer)
        resolve({
            ok: false,
            stdout,
            stderr: `${stderr}\n${error.message}`.trim(),
            exitCode: 1,
        })
    })

    child.on('close', (code) => {
        clearTimeout(timer)
        if (timedOut) {
            resolve({
                ok: false,
                stdout,
                stderr: `${stderr}\nCommand timed out after ${timeoutMs}ms`.trim(),
                exitCode: 124,
            })
            return
        }

        resolve({
            ok: code === 0,
            stdout,
            stderr,
            exitCode: code == null ? 1 : code,
        })
    })
})

module.exports = {
    runCommand,
}
