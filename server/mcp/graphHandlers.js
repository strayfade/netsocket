'use strict'

/**
 * MCP-facing graph handlers with injectable dependencies.
 *
 * Production wiring (server/mcp/mount.js) injects the live stores:
 *   getRoot      () => saveState.getNodes()
 *   persistInner (inner) => saveState.setNodes({ nodes: inner, currentValues }) + cron sync + broadcast
 *   getSchema    (nodeType) => nodeImporter.getNodeMetadata(nodeType)
 *   runNode      (node, customInputs) => execute.executeGraph(node, customInputs, {})
 *
 * Tests inject fakes. History is per-context so tests stay isolated.
 */

const store = require('./graphStore')
const { createHistory } = require('./history')

const toErrorResult = (error, fallbackCode = 'FAILED') => {
    const result = {
        success: false,
        error: error?.message || String(error),
        code: error?.code || fallbackCode,
    }
    if (error?.opIndex != null) result.opIndex = error.opIndex
    if (error?.op != null) result.op = error.op
    return result
}

const createGraphContext = (deps = {}) => {
    const {
        getRoot = () => { throw new Error('getRoot not wired') },
        persistInner = () => { throw new Error('persistInner not wired') },
        getSchema = () => null,
        runNode = async () => { throw new Error('runNode not wired') },
        onLogLines = null,
    } = deps

    const history = createHistory()

    const snapshotInner = () => store.cloneRoot(store.getInner(getRoot()))

    /** Run `fn` against a cloned root; on success push history + persist. */
    const mutate = (label, fn) => {
        const root = store.cloneRoot(getRoot())
        const pre = store.cloneRoot(store.getInner(root))
        let result
        try {
            result = fn(root)
        } catch (error) {
            return { ok: false, result: toErrorResult(error) }
        }
        const post = store.getInner(root)
        const rev = history.push(pre, post, label)
        persistInner(post)
        return { ok: true, result, rev }
    }

    const ok = (payload, rev) => ({ success: true, rev: rev ?? history.getRev(), ...payload })

    const getGraph = (args = {}) => {
        try {
            return ok(store.readGraph(getRoot(), args))
        } catch (error) {
            return toErrorResult(error, 'READ_FAILED')
        }
    }

    const addNode = (args = {}) => {
        const schema = getSchema(args.nodeType)
        const step = mutate(`add ${args.nodeType}`, (root) => store.addNode(root, args, schema))
        if (!step.ok) return step.result
        return ok(step.result, step.rev)
    }

    const updateNode = (args = {}) => {
        const step = mutate(`update ${args.id}`, (root) => {
            const node = store.getInner(root).nodes.find((n) => n && n.id === args.id)
            const schema = node ? getSchema(node.type) : null
            return store.updateNode(root, args, schema)
        })
        if (!step.ok) return step.result
        return ok(step.result, step.rev)
    }

    const removeNode = (args = {}) => {
        const step = mutate(`remove ${args.id}`, (root) => store.removeNode(root, args.id))
        if (!step.ok) return step.result
        return ok(step.result, step.rev)
    }

    const connectNodes = (args = {}) => {
        const step = mutate(`connect ${args.originId} -> ${args.targetId}`, (root) => store.connect(root, args))
        if (!step.ok) return step.result
        return ok(step.result, step.rev)
    }

    const disconnectLink = (args = {}) => {
        const step = mutate(`disconnect ${args.linkId}`, (root) => store.disconnect(root, args.linkId))
        if (!step.ok) return step.result
        return ok(step.result, step.rev)
    }

    const alignNodes = (args = {}) => {
        const step = mutate(`align ${args.axis}`, (root) => store.alignNodes(root, args))
        if (!step.ok) return step.result
        return ok(step.result, step.rev)
    }

    const addGroup = (args = {}) => {
        const step = mutate(`add group ${args.title || 'Group'}`, (root) => store.addGroup(root, args))
        if (!step.ok) return step.result
        return ok(step.result, step.rev)
    }

    const updateGroup = (args = {}) => {
        const step = mutate(`update group ${args.groupIndex}`, (root) => store.updateGroup(root, args))
        if (!step.ok) return step.result
        return ok(step.result, step.rev)
    }

    const removeGroup = (args = {}) => {
        const step = mutate(`remove group ${args.groupIndex}`, (root) => store.removeGroup(root, args.groupIndex))
        if (!step.ok) return step.result
        return ok(step.result, step.rev)
    }

    const applyEdits = (args = {}) => {
        const { ops, baseRev, dryRun = false } = args
        if (baseRev != null && Number(baseRev) !== history.getRev()) {
            return {
                success: false,
                code: 'STALE_REV',
                error: `Graph changed since rev ${baseRev} (now at rev ${history.getRev()}). Call get_graph for the current layout, then retry.`,
                rev: history.getRev(),
            }
        }
        let applied
        try {
            applied = store.applyOps(store.cloneRoot(getRoot()), ops, (nodeType) => getSchema(nodeType))
        } catch (error) {
            return toErrorResult(error, 'APPLY_FAILED')
        }
        if (dryRun) {
            return ok({ dryRun: true, applied: applied.results, committed: false })
        }
        const root = store.cloneRoot(getRoot())
        const pre = store.cloneRoot(store.getInner(root))
        const rev = history.push(pre, store.getInner(applied.root), `batch ${applied.results.length} ops`)
        persistInner(store.getInner(applied.root))
        return ok({ applied: applied.results, committed: true }, rev)
    }

    const graphUndo = (args = {}) => {
        let current
        try {
            current = snapshotInner()
        } catch (error) {
            return toErrorResult(error, 'READ_FAILED')
        }
        const outcome = history.undo(current, args.force === true)
        if (!outcome.ok) return { success: false, code: outcome.code, error: outcome.error, rev: history.getRev() }
        persistInner(outcome.snapshot)
        return ok({ undone: outcome.label }, outcome.rev)
    }

    const graphRedo = (args = {}) => {
        let current
        try {
            current = snapshotInner()
        } catch (error) {
            return toErrorResult(error, 'READ_FAILED')
        }
        const outcome = history.redo(current, args.force === true)
        if (!outcome.ok) return { success: false, code: outcome.code, error: outcome.error, rev: history.getRev() }
        persistInner(outcome.snapshot)
        return ok({ redone: outcome.label }, outcome.rev)
    }

    const safeCloneValue = (value) => {
        try {
            const cloned = JSON.parse(JSON.stringify(value === undefined ? null : value))
            const text = JSON.stringify(cloned)
            if (text && text.length > 65536) {
                return { truncated: true, preview: text.slice(0, 65536) }
            }
            return cloned
        } catch (_) {
            return String(value)
        }
    }

    const executeGraphNode = async (args = {}) => {
        const { id, inputs } = args
        let node
        try {
            const inner = store.getInner(getRoot())
            node = inner.nodes.find((n) => n && n.id === id) ?? null
        } catch (error) {
            return toErrorResult(error, 'READ_FAILED')
        }
        if (!node) {
            return {
                success: false,
                code: 'UNKNOWN_NODE_ID',
                error: `No node with id ${JSON.stringify(id)}. Call get_graph to list ids.`,
                id,
            }
        }
        const lines = []
        let removeListener = null
        try {
            const { addPushLogListener } = require('../log')
            removeListener = addPushLogListener((line) => {
                if (lines.length < 200) lines.push(line)
            })
        } catch (_) { /* log capture is best-effort */ }

        try {
            const customInputs = inputs && typeof inputs === 'object' ? inputs : undefined
            await runNode(node, customInputs)
        } catch (error) {
            return { success: false, code: error?.code || 'EXECUTION_FAILED', error: error?.message || String(error), id, nodeType: node.type, logLines: lines }
        } finally {
            if (removeListener) removeListener()
        }

        let outputValues = {}
        try {
            const fresh = store.getInner(getRoot())
            const values = fresh.currentValues || []
            for (const port of node.outputs || []) {
                for (const linkId of (port && port.links) || []) {
                    outputValues[String(linkId)] = safeCloneValue(values[linkId])
                }
            }
        } catch (_) { /* output capture is best-effort */ }

        if (typeof onLogLines === 'function') {
            try { onLogLines(lines) } catch (_) { /* ignore */ }
        }

        return { success: true, id, nodeType: node.type, logLines: lines, outputValues, rev: history.getRev() }
    }

    return {
        history,
        getGraph,
        addNode,
        updateNode,
        removeNode,
        connectNodes,
        disconnectLink,
        alignNodes,
        addGroup,
        updateGroup,
        removeGroup,
        applyEdits,
        graphUndo,
        graphRedo,
        executeGraphNode,
    }
}

module.exports = { createGraphContext }
