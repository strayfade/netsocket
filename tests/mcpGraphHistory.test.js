'use strict'

const { describe, it } = require('node:test')
const assert = require('node:assert/strict')

const { createHistory } = require('../server/mcp/history')

describe('graph history', () => {
    it('undoes and redoes a pushed change', () => {
        const history = createHistory()
        const pre = { nodes: [] }
        const post = { nodes: [{ id: 'a' }] }
        assert.equal(history.push(pre, post, 'add a'), 1)

        const undone = history.undo(post)
        assert.equal(undone.ok, true)
        assert.deepEqual(undone.snapshot, pre)

        const redone = history.redo(pre)
        assert.equal(redone.ok, true)
        assert.deepEqual(redone.snapshot, post)
        assert.deepEqual(history.depth(), { undo: 1, redo: 0 })
    })

    it('reports empty stacks', () => {
        const history = createHistory()
        assert.equal(history.undo({}).ok, false)
        assert.equal(history.undo({}).code, 'EMPTY')
        assert.equal(history.redo({}).code, 'EMPTY')
    })

    it('refuses to clobber outside edits without force', () => {
        const history = createHistory()
        const pre = { nodes: [] }
        const post = { nodes: [{ id: 'a' }] }
        history.push(pre, post, 'add a')

        const editedElsewhere = { nodes: [{ id: 'a' }, { id: 'human' }] }
        const refused = history.undo(editedElsewhere)
        assert.equal(refused.ok, false)
        assert.equal(refused.code, 'EXTERNAL_CHANGE')

        const forced = history.undo(editedElsewhere, true)
        assert.equal(forced.ok, true)
        assert.deepEqual(forced.snapshot, pre)
    })

    it('clears the redo stack on a new push and bumps rev', () => {
        const history = createHistory()
        history.push({ n: 0 }, { n: 1 }, 'one')
        history.undo({ n: 1 })
        assert.deepEqual(history.depth(), { undo: 0, redo: 1 })
        const rev = history.push({ n: 0 }, { n: 2 }, 'two')
        assert.equal(history.getRev(), rev)
        assert.deepEqual(history.depth(), { undo: 1, redo: 0 })
    })
})
