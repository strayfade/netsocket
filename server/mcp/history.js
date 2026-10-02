'use strict'

/**
 * Bounded undo/redo over committed LiteGraph snapshots.
 *
 * Each entry stores the pre-image AND post-image of one committed MCP change,
 * so undo/redo can refuse to clobber edits made elsewhere (e.g. a human in
 * the editor) instead of silently discarding them. Pass `force: true` to
 * override the guard.
 */

const HISTORY_LIMIT = 200

const cloneInner = (inner) => JSON.parse(JSON.stringify(inner ?? null))

const sameSnapshot = (a, b) => JSON.stringify(a) === JSON.stringify(b)

const createHistory = (limit = HISTORY_LIMIT) => {
    const safeLimit = Math.max(Number(limit) || HISTORY_LIMIT, 1)
    let past = []
    let future = []
    let rev = 0

    const push = (preImage, postImage, label) => {
        past.push({ pre: cloneInner(preImage), post: cloneInner(postImage), label: label || 'edit' })
        if (past.length > safeLimit) past = past.slice(-safeLimit)
        future = []
        rev += 1
        return rev
    }

    const undo = (currentInner, force = false) => {
        const last = past[past.length - 1]
        if (!last) {
            return { ok: false, code: 'EMPTY', error: 'Nothing to undo' }
        }
        if (!force && !sameSnapshot(currentInner, last.post)) {
            return {
                ok: false,
                code: 'EXTERNAL_CHANGE',
                error: 'The graph changed outside MCP since this step (e.g. editor edits). Re-run with force:true to undo anyway, discarding those outside changes.',
            }
        }
        past.pop()
        future.push(last)
        rev += 1
        return { ok: true, snapshot: cloneInner(last.pre), rev, label: last.label }
    }

    const redo = (currentInner, force = false) => {
        const next = future[future.length - 1]
        if (!next) {
            return { ok: false, code: 'EMPTY', error: 'Nothing to redo' }
        }
        if (!force && !sameSnapshot(currentInner, next.pre)) {
            return {
                ok: false,
                code: 'EXTERNAL_CHANGE',
                error: 'The graph changed outside MCP since the undo (e.g. editor edits). Re-run with force:true to redo anyway, discarding those outside changes.',
            }
        }
        future.pop()
        past.push(next)
        rev += 1
        return { ok: true, snapshot: cloneInner(next.post), rev, label: next.label }
    }

    const getRev = () => rev
    const depth = () => ({ undo: past.length, redo: future.length })

    return { push, undo, redo, getRev, depth }
}

module.exports = { createHistory, HISTORY_LIMIT }
