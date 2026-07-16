/* global LiteGraph, LGraph, createNode */

const NetsocketSubgraphs = (() => {
    const SUBGRAPH_PREFIX = "Subgraphs/"
    const ON_TRIGGER = "Subgraph/On Trigger"
    const INPUT_TYPE = "Subgraph/Input"
    const OUTPUT_TYPE = "Subgraph/Output"
    const EVENT_TYPE = -1
    const PORT_TYPES = ["string", "number", "boolean", "array", "object", "*"]

    let api = null
    let definitions = []
    let editingSubgraphId = null
    let editingGraph = null
    let subgraphPersistChain = Promise.resolve()
    let ignoreSubgraphChange = false
    const registeredTitles = new Set()

    const defaultValueForType = (type) => {
        switch (type) {
            case "number":
                return 0
            case "boolean":
                return "False"
            case "array":
                return "[]"
            case "object":
                return "{}"
            default:
                return ""
        }
    }

    const titleFor = (name) => `${SUBGRAPH_PREFIX}${name}`

    // Storage key for a subgraph's persisted viewport (see editor.html viewport API).
    const viewportKeyFor = (id) => `subgraph:${id}`

    const isSubgraphCallNode = (node) => {
        if (!node) return false
        if (node.properties && node.properties.subgraphId) return true
        return typeof node.type === "string" && node.type.startsWith(SUBGRAPH_PREFIX)
    }

    const findDefinition = (idOrName) =>
        definitions.find((d) => d.id === idOrName || d.name === idOrName) || null

    const clone = (value) => JSON.parse(JSON.stringify(value))

    const normalizeType = (type) => {
        const t = typeof type === "string" ? type : "string"
        return PORT_TYPES.includes(t) ? t : "string"
    }

    const isEventPortType = (type) => type === EVENT_TYPE || type === LiteGraph.EVENT

    const createEmptyInnerGraph = () => {
        const g = new LGraph()
        const trigger = LiteGraph.createNode(ON_TRIGGER)
        if (trigger) {
            trigger.pos = [80, 120]
            g.add(trigger)
        }
        return g
    }

    const uniqueName = (hint, used) => {
        let portName = hint || "port"
        const base = portName
        let n = 2
        while (used.has(portName)) {
            portName = `${base}_${n++}`
        }
        used.add(portName)
        return portName
    }

    /**
     * Detach a node's ports WITHOUT deleting the underlying links from the graph pool.
     * We deliberately avoid removeInput/removeOutput here: those call
     * disconnectInput/disconnectOutput, which delete the links from graph.links and
     * clear the other side's references. Because syncPortsOnNode re-attaches links by
     * name right afterwards, using the destructive path (which fires whenever node.graph
     * is set, e.g. during graph.configure on reload) would leave the restored ports
     * pointing at link ids that no longer exist, so those links fail to render.
     */
    const clearNodePorts = (node) => {
        if (!node) return
        if (node.inputs) {
            for (const input of node.inputs) {
                if (input) input.link = null
            }
        }
        if (node.outputs) {
            for (const output of node.outputs) {
                if (output) output.links = null
            }
        }
        node.inputs = []
        node.outputs = []
    }

    /** Remove a link from the pool and both endpoints without relying on slot indices. */
    const dropLink = (graph, linkId) => {
        if (!graph || !graph.links || linkId == null) return
        const link = graph.links[linkId]
        if (!link) return
        const origin = graph.getNodeById(link.origin_id)
        if (origin && origin.outputs && origin.outputs[link.origin_slot]?.links) {
            const arr = origin.outputs[link.origin_slot].links
            const idx = arr.indexOf(linkId)
            if (idx >= 0) arr.splice(idx, 1)
        }
        const target = graph.getNodeById(link.target_id)
        if (target && target.inputs) {
            for (const input of target.inputs) {
                if (input && input.link === linkId) input.link = null
            }
        }
        delete graph.links[linkId]
    }

    const resolveEventOutputs = (definition) => {
        if (Array.isArray(definition.eventOutputs) && definition.eventOutputs.length) {
            return definition.eventOutputs.map((item) => ({
                name: String(item?.name || "Done").trim() || "Done",
            }))
        }
        return [{ name: "Done" }]
    }

    const syncPortsOnNode = (node, definition) => {
        if (!node || !definition) return

        if (!node.properties) node.properties = {}

        const graph = node.graph
        // Capture existing link references so they survive the port rebuild. The event
        // input has an empty name, so it must be tracked separately or its (trigger)
        // link would be dropped and fail to render on reload.
        const keepLinks = { inputs: {}, outputs: {} }
        let eventInputLink = null
        if (node.inputs) {
            for (const input of node.inputs) {
                if (!input) continue
                if (isEventPortType(input.type) && !input.name) {
                    eventInputLink = input.link
                } else if (input.name) {
                    keepLinks.inputs[input.name] = input.link
                }
            }
        }
        if (node.outputs) {
            for (const output of node.outputs) {
                if (output && output.name != null) {
                    keepLinks.outputs[output.name] = output.links ? output.links.slice() : null
                }
            }
        }

        const restoredInputLinkIds = new Set()
        const restoredOutputLinkIds = new Set()

        clearNodePorts(node)

        node.addInput("", LiteGraph.EVENT)
        if (eventInputLink != null && node.inputs[0]) {
            node.inputs[0].link = eventInputLink
            restoredInputLinkIds.add(eventInputLink)
            if (graph && graph.links && graph.links[eventInputLink]) {
                graph.links[eventInputLink].target_slot = 0
            }
        }
        for (const input of definition.inputs || []) {
            node.addInput(input.name, input.type === "*" ? "*" : input.type)
            if (node.properties[input.name] === undefined) {
                node.properties[input.name] = defaultValueForType(input.type)
            }
            const prev = keepLinks.inputs[input.name]
            const slot = node.inputs.length - 1
            if (prev != null && node.inputs[slot]) {
                node.inputs[slot].link = prev
                restoredInputLinkIds.add(prev)
                if (graph && graph.links && graph.links[prev]) {
                    graph.links[prev].target_slot = slot
                }
            }
        }

        const restoreOutputLinks = (name) => {
            const prev = keepLinks.outputs[name]
            const slot = node.outputs.length - 1
            if (prev && node.outputs[slot]) {
                node.outputs[slot].links = prev
                for (const id of prev) {
                    restoredOutputLinkIds.add(id)
                    if (graph && graph.links && graph.links[id]) {
                        graph.links[id].origin_slot = slot
                    }
                }
            }
        }

        for (const output of definition.outputs || []) {
            node.addOutput(output.name, output.type === "*" ? "*" : output.type)
            restoreOutputLinks(output.name)
        }
        for (const eventOut of resolveEventOutputs(definition)) {
            node.addOutput(eventOut.name, LiteGraph.EVENT)
            restoreOutputLinks(eventOut.name)
        }

        // Drop links whose port no longer exists after a definition change so they don't
        // linger in the pool pointing at slots that were removed.
        if (graph && graph.links) {
            if (eventInputLink != null && !restoredInputLinkIds.has(eventInputLink)) {
                dropLink(graph, eventInputLink)
            }
            for (const id of Object.values(keepLinks.inputs)) {
                if (id != null && !restoredInputLinkIds.has(id)) dropLink(graph, id)
            }
            for (const list of Object.values(keepLinks.outputs)) {
                for (const id of list || []) {
                    if (!restoredOutputLinkIds.has(id)) dropLink(graph, id)
                }
            }
        }

        node.properties.subgraphId = definition.id
        node.type = titleFor(definition.name)
        if (node.constructor) node.constructor.type = node.type
        node.title = definition.name
        if (typeof node.computeSize === "function") {
            node.size = node.computeSize()
        }
        if (node.graph) {
            node.setDirtyCanvas(true, true)
        }
    }

    const placeCallNodeOnCanvas = (definition, pos) => {
        const graph = api.getGraph()
        const canvas = api.getCanvas()
        registerCallType(definition)
        const callNode = LiteGraph.createNode(titleFor(definition.name))
        if (!callNode) {
            window.alert(`Failed to create subgraph node "${definition.name}".`)
            return null
        }
        if (!callNode.properties) callNode.properties = {}
        callNode.properties.subgraphId = definition.id
        callNode.pos = pos || [
            (canvas.graph_mouse && canvas.graph_mouse[0]) || 120,
            (canvas.graph_mouse && canvas.graph_mouse[1]) || 120,
        ]
        // Add first so port sync can use graph-aware removeInput/removeOutput safely
        graph.add(callNode)
        syncPortsOnNode(callNode, definition)
        canvas.selectNodes([callNode])
        if (api.enqueuePersistGraphChange) api.enqueuePersistGraphChange()
        if (api.updateNodeCounts) api.updateNodeCounts()
        return callNode
    }

    const registerCallType = (definition) => {
        const title = titleFor(definition.name)
        const eventOutputs = resolveEventOutputs(definition)
        const NodeClass = function SubgraphCallNode() {
            this.properties = this.properties || {}
            this.addInput("", LiteGraph.EVENT)
            for (const input of definition.inputs || []) {
                this.addInput(input.name, input.type === "*" ? "*" : input.type)
                this.addProperty(input.name, defaultValueForType(input.type))
            }
            for (const output of definition.outputs || []) {
                this.addOutput(output.name, output.type === "*" ? "*" : output.type)
            }
            for (const eventOut of eventOutputs) {
                this.addOutput(eventOut.name, LiteGraph.EVENT)
            }
            this.properties.subgraphId = definition.id
        }
        NodeClass.title = definition.name
        NodeClass.prototype.description = `Calls the "${definition.name}" subgraph. Double-click to edit.`
        NodeClass.prototype.color = "cyan"
        NodeClass.prototype.icon = "account_tree"
        NodeClass.prototype.onConfigure = function () {
            const def = findDefinition(this.properties.subgraphId) || definition
            if (def) syncPortsOnNode(this, def)
        }
        createNode(title, NodeClass)
        registeredTitles.add(title)
    }

    const renameSubgraph = async (node) => {
        if (!isSubgraphCallNode(node) || !node.properties?.subgraphId) return
        const def = findDefinition(node.properties.subgraphId)
        if (!def) {
            window.alert("Subgraph definition not found.")
            return
        }
        const newName = await promptName(def.name, "Rename subgraph")
        if (!newName || newName === def.name) return

        let response
        try {
            response = await api.sendWsRequest({
                broadcastPurpose: "saveSubgraph",
                broadcastData: {
                    id: def.id,
                    name: newName,
                    graph: def.graph,
                },
            })
        } catch (e) {
            console.warn("rename subgraph failed", e)
            window.alert("Failed to rename subgraph")
            return
        }
        const saved = response?.broadcastData
        if (!saved || saved.error) {
            window.alert(saved?.error || "Failed to rename subgraph")
            return
        }

        // Keep local state consistent with the server, then rebuild all registered
        // Call types and re-sync on-canvas nodes from scratch (this handles the
        // old title removal, new title registration, and node retitling).
        const idx = definitions.findIndex((d) => d.id === saved.id)
        if (idx >= 0) definitions[idx] = saved
        else definitions.push(saved)
        applyDefinitions(definitions.slice())

        const canvas = api.getCanvas()
        if (canvas) canvas.setDirty(true, true)
        if (api.enqueuePersistGraphChange) api.enqueuePersistGraphChange()
    }

    const unregisterStaleTypes = (nextDefs) => {
        const nextTitles = new Set(nextDefs.map((d) => titleFor(d.name)))
        for (const title of Array.from(registeredTitles)) {
            if (!nextTitles.has(title)) {
                try {
                    delete LiteGraph.registered_node_types[title]
                } catch (e) { /* ignore */ }
                registeredTitles.delete(title)
            }
        }
    }

    const refreshAllCallNodes = () => {
        const graph = api.getGraph()
        if (!graph || !graph._nodes) return
        for (const node of graph._nodes) {
            if (!isSubgraphCallNode(node)) continue
            const def = findDefinition(node.properties.subgraphId)
            if (def) syncPortsOnNode(node, def)
        }
        if (api.updateNodeCounts) api.updateNodeCounts()
    }

    const applyDefinitions = (list) => {
        definitions = Array.isArray(list) ? list : []
        unregisterStaleTypes(definitions)
        for (const def of definitions) registerCallType(def)
        refreshAllCallNodes()
    }

    // In-page modal instead of window.prompt: embedded browsers (Electron/webview)
    // suppress repeated native prompts after the first dialog, which silently broke rename.
    const promptName = (defaultName, titleText) => {
        return new Promise((resolve) => {
            const existing = document.getElementById("subgraph-name-modal")
            if (existing) existing.remove()

            const overlay = document.createElement("div")
            overlay.id = "subgraph-name-modal"
            overlay.style.cssText =
                "position:fixed;inset:0;z-index:10000;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.5);"

            const box = document.createElement("div")
            box.style.cssText =
                "background:#111;border:1px solid #333;border-radius:10px;padding:18px;min-width:320px;box-shadow:0 12px 40px #000a;font-family:'Geist',sans-serif;"

            const label = document.createElement("div")
            label.textContent = titleText || "Subgraph name"
            label.style.cssText = "color:#ddd;font-size:13px;margin-bottom:8px;"

            const input = document.createElement("input")
            input.type = "text"
            input.value = defaultName || "My Subgraph"
            input.style.cssText =
                "width:100%;box-sizing:border-box;padding:8px 10px;background:#1a1a1a;border:1px solid #444;border-radius:6px;color:#fff;font-size:14px;outline:none;"

            const row = document.createElement("div")
            row.style.cssText = "display:flex;justify-content:flex-end;gap:8px;margin-top:14px;"

            const cancelBtn = document.createElement("button")
            cancelBtn.type = "button"
            cancelBtn.textContent = "Cancel"
            cancelBtn.style.cssText =
                "padding:6px 12px;border:1px solid #444;background:#1a1a1a;color:#ddd;border-radius:6px;cursor:pointer;font-size:13px;"

            const okBtn = document.createElement("button")
            okBtn.type = "button"
            okBtn.textContent = "OK"
            okBtn.style.cssText =
                "padding:6px 12px;border:1px solid #2a6;background:#173;color:#fff;border-radius:6px;cursor:pointer;font-size:13px;"

            let settled = false
            const cleanup = (value) => {
                if (settled) return
                settled = true
                document.removeEventListener("keydown", onKey, true)
                overlay.remove()
                resolve(value)
            }
            const submit = () => {
                const cleaned = String(input.value || "").trim()
                cleanup(cleaned || null)
            }
            const onKey = (e) => {
                if (e.key === "Enter") {
                    e.preventDefault()
                    e.stopPropagation()
                    submit()
                } else if (e.key === "Escape") {
                    e.preventDefault()
                    e.stopPropagation()
                    cleanup(null)
                }
            }

            cancelBtn.addEventListener("click", () => cleanup(null))
            okBtn.addEventListener("click", submit)
            overlay.addEventListener("mousedown", (e) => {
                if (e.target === overlay) cleanup(null)
            })
            document.addEventListener("keydown", onKey, true)

            row.appendChild(cancelBtn)
            row.appendChild(okBtn)
            box.appendChild(label)
            box.appendChild(input)
            box.appendChild(row)
            overlay.appendChild(box)
            document.body.appendChild(overlay)
            setTimeout(() => {
                input.focus()
                input.select()
            }, 0)
        })
    }

    const isEditingSubgraph = () => !!editingSubgraphId

    let savedMainView = null

    const persistEditingSubgraph = async () => {
        if (!editingSubgraphId || !editingGraph || ignoreSubgraphChange) return
        const def = findDefinition(editingSubgraphId)
        if (!def) return
        const response = await api.sendWsRequest({
            broadcastPurpose: "saveSubgraph",
            broadcastData: {
                id: def.id,
                name: def.name,
                graph: editingGraph.serialize(),
            },
        })
        const saved = response?.broadcastData
        if (saved && !saved.error) {
            const idx = definitions.findIndex((d) => d.id === saved.id)
            if (idx >= 0) definitions[idx] = saved
            else definitions.push(saved)
            registerCallType(saved)
            refreshAllCallNodes()
        }
    }

    const enqueuePersistEditingSubgraph = () => {
        subgraphPersistChain = subgraphPersistChain
            .then(() => persistEditingSubgraph())
            .catch((err) => console.warn("Subgraph persist failed", err))
    }

    const updateSubgraphBanner = () => {
        let banner = document.getElementById("subgraph-editor-banner")
        if (!editingSubgraphId) {
            if (banner) banner.hidden = true
            return
        }
        const def = findDefinition(editingSubgraphId)
        if (!banner) {
            banner = document.createElement("div")
            banner.id = "subgraph-editor-banner"
            banner.className = "subgraph-editor-banner"
            banner.innerHTML = [
                '<span class="subgraph-editor-banner-label"></span>',
                '<button type="button" class="subgraph-editor-banner-close">Close</button>',
            ].join("")
            banner.querySelector(".subgraph-editor-banner-close").addEventListener("click", () => {
                closeEditingSubgraph()
            })
            document.body.appendChild(banner)
        }
        banner.hidden = false
        const label = banner.querySelector(".subgraph-editor-banner-label")
        if (label) {
            label.textContent = `Editing subgraph: ${def ? def.name : editingSubgraphId}`
        }
    }

    const resetCanvasPointerState = (canvas) => {
        canvas.last_click_position = null
        canvas.block_click = false
        canvas.pointer_is_down = false
        canvas.pointer_is_double = false
        canvas.node_dragged = null
        canvas.dragging_canvas = false
        canvas.connecting_node = null
        canvas.node_over = null
        canvas.node_capturing_input = null
        canvas.selected_nodes = {}
        canvas.highlighted_links = {}
    }

    const closeEditingSubgraph = async () => {
        if (!editingSubgraphId) {
            updateSubgraphBanner()
            return
        }
        try {
            await subgraphPersistChain
            await persistEditingSubgraph()
        } catch (e) {
            console.warn(e)
        }

        const canvas = api.getCanvas()
        const mainGraph = api.getGraph()
        editingSubgraphId = null
        editingGraph = null

        ignoreSubgraphChange = true
        try {
            // Swap back to the main graph without LiteGraph's subgraph stack/overlay
            canvas.setGraph(mainGraph)
            // Persist the subgraph view we're leaving and restore the main view's saved
            // pan/zoom. Fall back to the in-memory snapshot when the persistent API is absent.
            const restoredMain = api.viewport ? api.viewport.activate("main") : false
            if (!restoredMain && savedMainView && canvas.ds) {
                canvas.ds.offset[0] = savedMainView.offset[0]
                canvas.ds.offset[1] = savedMainView.offset[1]
                canvas.ds.scale = savedMainView.scale
            }
            savedMainView = null
            resetCanvasPointerState(canvas)
            canvas.setDirty(true, true)
        } finally {
            ignoreSubgraphChange = false
        }

        refreshAllCallNodes()
        if (api.enqueuePersistGraphChange) api.enqueuePersistGraphChange()
        updateSubgraphBanner()
    }

    const openSubgraphEditor = async (subgraphId) => {
        const def = findDefinition(subgraphId)
        if (!def) {
            window.alert("Subgraph definition not found.")
            return
        }
        if (editingSubgraphId) {
            await closeEditingSubgraph()
        }

        const canvas = api.getCanvas()
        const mainGraph = api.getGraph()
        // Fallback snapshot for restoring the main view when the persistent viewport API
        // (localStorage-backed, in editor.html) isn't available.
        savedMainView = canvas.ds
            ? {
                offset: [canvas.ds.offset[0], canvas.ds.offset[1]],
                scale: canvas.ds.scale,
            }
            : null

        const inner = new LGraph()
        ignoreSubgraphChange = true
        try {
            if (def.graph) inner.configure(clone(def.graph))
        } finally {
            ignoreSubgraphChange = false
        }

        editingSubgraphId = def.id
        editingGraph = inner
        inner.on_change = enqueuePersistEditingSubgraph
        inner.onAfterChange = enqueuePersistEditingSubgraph

        // Use setGraph (not openSubgraph). openSubgraph pushes _graph_stack and
        // draws LiteGraph's subgraph panel every frame; without a real
        // _subgraph_node that panel console.warns on every frame and freezes the UI.
        resetCanvasPointerState(canvas)
        canvas.setGraph(inner)
        // Keep main graph alive; setGraph detaches canvas from it but does not destroy it.
        void mainGraph
        resetCanvasPointerState(canvas)

        // Persist the main view we're leaving and restore this subgraph's saved pan/zoom.
        // Only fall back to centering on the first node when there's no stored view yet.
        const restoredView = api.viewport
            ? api.viewport.activate(viewportKeyFor(def.id))
            : false

        if (!restoredView) {
            if (inner._nodes && inner._nodes.length && typeof canvas.centerOnNode === "function") {
                try {
                    canvas.centerOnNode(inner._nodes[0])
                } catch (e) {
                    if (canvas.ds) {
                        canvas.ds.offset = [0, 0]
                        canvas.ds.scale = 1
                    }
                }
            } else if (canvas.ds) {
                canvas.ds.offset = [0, 0]
                canvas.ds.scale = 1
            }
        }
        canvas.setDirty(true, true)
        updateSubgraphBanner()
    }

    const createBlankSubgraph = async () => {
        if (isEditingSubgraph()) {
            window.alert("Close the current subgraph editor first.")
            return
        }
        const name = await promptName("My Subgraph", "New subgraph name")
        if (!name) return

        const temp = createEmptyInnerGraph()
        const response = await api.sendWsRequest({
            broadcastPurpose: "saveSubgraph",
            broadcastData: { name, graph: temp.serialize() },
        })
        const saved = response?.broadcastData
        if (!saved || saved.error) {
            window.alert(saved?.error || "Failed to create subgraph")
            return
        }
        const idx = definitions.findIndex((d) => d.id === saved.id)
        if (idx >= 0) definitions[idx] = saved
        else definitions.push(saved)
        registerCallType(saved)
        placeCallNodeOnCanvas(saved)
        await openSubgraphEditor(saved.id)
    }

    const createSubgraphFromSelection = async (anchorNode) => {
        if (isEditingSubgraph()) {
            window.alert("Close the current subgraph editor first.")
            return
        }
        const canvas = api.getCanvas()
        const graph = api.getGraph()
        let nodesList = Object.values(canvas.selected_nodes || {})
        if (!nodesList.length && anchorNode) nodesList = [anchorNode]
        nodesList = nodesList.filter((n) => n && graph._nodes.includes(n) && !isSubgraphCallNode(n))
        if (!nodesList.length) {
            window.alert("Select one or more nodes to wrap in a subgraph.")
            return
        }

        const name = await promptName("My Subgraph", "New subgraph name")
        if (!name) return

        const selectedIds = new Set(nodesList.map((n) => n.id))
        const idMap = new Map()
        const inbound = []
        const outbound = []

        for (const node of nodesList) {
            if (node.inputs) {
                node.inputs.forEach((input, slot) => {
                    if (input.link == null) return
                    const link = graph.links[input.link]
                    if (!link || selectedIds.has(link.origin_id)) return
                    inbound.push({
                        targetNodeId: node.id,
                        targetSlot: slot,
                        type: input.type,
                        nameHint: input.name || `in_${inbound.length + 1}`,
                        originId: link.origin_id,
                        originSlot: link.origin_slot,
                    })
                })
            }
            if (node.outputs) {
                node.outputs.forEach((output, slot) => {
                    const external = []
                    for (const linkId of output.links || []) {
                        const link = graph.links[linkId]
                        if (!link || selectedIds.has(link.target_id)) continue
                        external.push({
                            targetId: link.target_id,
                            targetSlot: link.target_slot,
                        })
                    }
                    if (external.length) {
                        outbound.push({
                            originNodeId: node.id,
                            originSlot: slot,
                            type: output.type,
                            nameHint: output.name || `out_${outbound.length + 1}`,
                            external,
                        })
                    }
                })
            }
        }

        const inner = new LGraph()
        let minX = Infinity
        let minY = Infinity
        for (const node of nodesList) {
            minX = Math.min(minX, node.pos[0])
            minY = Math.min(minY, node.pos[1])
        }

        for (const node of nodesList) {
            const serialized = node.serialize()
            const newId = crypto.randomUUID()
            idMap.set(node.id, newId)
            serialized.id = newId
            serialized.pos = [node.pos[0] - minX + 280, node.pos[1] - minY + 80]
            if (serialized.inputs) {
                for (const input of serialized.inputs) input.link = null
            }
            if (serialized.outputs) {
                for (const output of serialized.outputs) output.links = null
            }
            const created = LiteGraph.createNode(serialized.type)
            if (!created) continue
            created.configure(serialized)
            inner.add(created)
        }

        for (const node of nodesList) {
            if (!node.outputs) continue
            node.outputs.forEach((output, originSlot) => {
                for (const linkId of output.links || []) {
                    const link = graph.links[linkId]
                    if (!link || !selectedIds.has(link.target_id)) continue
                    const newOrigin = inner.getNodeById(idMap.get(node.id))
                    const newTarget = inner.getNodeById(idMap.get(link.target_id))
                    if (newOrigin && newTarget) {
                        newOrigin.connect(originSlot, newTarget, link.target_slot)
                    }
                }
            })
        }

        const triggerNode = LiteGraph.createNode(ON_TRIGGER)
        if (triggerNode) {
            triggerNode.pos = [40, 40]
            inner.add(triggerNode)
        }

        const inputPortMap = []
        const usedInputNames = new Set()
        for (const boundary of inbound) {
            if (isEventPortType(boundary.type)) {
                const target = inner.getNodeById(idMap.get(boundary.targetNodeId))
                if (triggerNode && target) {
                    triggerNode.connect(0, target, boundary.targetSlot)
                }
                continue
            }
            const portName = uniqueName(boundary.nameHint || "input", usedInputNames)
            const inputNode = LiteGraph.createNode(INPUT_TYPE)
            if (!inputNode) continue
            inputNode.pos = [40, 140 + inputPortMap.length * 90]
            inputNode.properties.Name = portName
            inputNode.properties.Type = normalizeType(boundary.type)
            inner.add(inputNode)
            const target = inner.getNodeById(idMap.get(boundary.targetNodeId))
            if (target) inputNode.connect(0, target, boundary.targetSlot)
            inputPortMap.push({ name: portName, boundary })
        }

        const outputPortMap = []
        const usedOutputNames = new Set()
        for (const boundary of outbound) {
            if (isEventPortType(boundary.type)) continue
            const portName = uniqueName(boundary.nameHint || "output", usedOutputNames)
            const outputNode = LiteGraph.createNode(OUTPUT_TYPE)
            if (!outputNode) continue
            outputNode.pos = [560, 140 + outputPortMap.length * 90]
            outputNode.properties.Name = portName
            outputNode.properties.Type = normalizeType(boundary.type)
            inner.add(outputNode)
            const origin = inner.getNodeById(idMap.get(boundary.originNodeId))
            if (origin) origin.connect(boundary.originSlot, outputNode, 0)
            outputPortMap.push({ name: portName, boundary })
        }

        const response = await api.sendWsRequest({
            broadcastPurpose: "saveSubgraph",
            broadcastData: { name, graph: inner.serialize() },
        })
        const saved = response?.broadcastData
        if (!saved || saved.error) {
            window.alert(saved?.error || "Failed to create subgraph")
            return
        }
        const existingIdx = definitions.findIndex((d) => d.id === saved.id)
        if (existingIdx >= 0) definitions[existingIdx] = saved
        else definitions.push(saved)
        registerCallType(saved)

        graph.beforeChange()
        const anchor = anchorNode && nodesList.includes(anchorNode) ? anchorNode : nodesList[0]
        const callPos = [anchor.pos[0], anchor.pos[1]]

        for (const node of nodesList.slice()) {
            graph.remove(node)
        }

        const callNode = placeCallNodeOnCanvas(saved, callPos)
        if (!callNode) {
            graph.afterChange()
            return
        }

        for (const mapped of inputPortMap) {
            const b = mapped.boundary
            let callSlot = -1
            for (let i = 0; i < callNode.inputs.length; i++) {
                if (callNode.inputs[i].name === mapped.name) {
                    callSlot = i
                    break
                }
            }
            if (callSlot < 0) continue
            const origin = graph.getNodeById(b.originId)
            if (origin) origin.connect(b.originSlot, callNode, callSlot)
        }

        for (const mapped of outputPortMap) {
            let callSlot = -1
            for (let i = 0; i < callNode.outputs.length; i++) {
                if (callNode.outputs[i].name === mapped.name) {
                    callSlot = i
                    break
                }
            }
            if (callSlot < 0) continue
            for (const ext of mapped.boundary.external) {
                const target = graph.getNodeById(ext.targetId)
                if (target) callNode.connect(callSlot, target, ext.targetSlot)
            }
        }

        for (const boundary of inbound) {
            if (!isEventPortType(boundary.type)) continue
            const origin = graph.getNodeById(boundary.originId)
            if (origin) origin.connect(boundary.originSlot, callNode, 0)
        }

        graph.afterChange()
        canvas.deselectAllNodes()
        canvas.selectNodes([callNode])
        if (api.enqueuePersistGraphChange) api.enqueuePersistGraphChange()
        if (api.updateNodeCounts) api.updateNodeCounts()
    }

    const onSubgraphsChanged = (list) => {
        applyDefinitions(list)
    }

    // Auto-delete a subgraph definition once its last instance is removed from the
    // main graph. Removals during graph load/undo/redo (isGraphBusy) are ignored so
    // reconfigure clears don't wipe every definition.
    const pendingRemovedIds = new Set()
    let sweepTimer = null

    const sweepRemovedSubgraphs = async () => {
        sweepTimer = null
        const ids = Array.from(pendingRemovedIds)
        pendingRemovedIds.clear()
        if (api && api.isGraphBusy && api.isGraphBusy()) return
        const graph = api.getGraph()
        if (!graph) return
        for (const id of ids) {
            if (id === editingSubgraphId) continue
            if (!findDefinition(id)) continue
            const stillUsed = (graph._nodes || []).some(
                (n) => isSubgraphCallNode(n) && n.properties && n.properties.subgraphId === id
            )
            if (stillUsed) continue
            try {
                await api.sendWsRequest({
                    broadcastPurpose: "deleteSubgraph",
                    broadcastData: { id },
                })
                // The server broadcasts subgraphsChanged, which unregisters the type.
            } catch (e) {
                console.warn("auto-delete subgraph failed", e)
            }
        }
    }

    const handleNodeRemoved = (node) => {
        if (!isSubgraphCallNode(node)) return
        if (api && api.isGraphBusy && api.isGraphBusy()) return
        if (isEditingSubgraph()) return
        const id = node.properties && node.properties.subgraphId
        if (!id) return
        pendingRemovedIds.add(id)
        if (sweepTimer) clearTimeout(sweepTimer)
        sweepTimer = setTimeout(sweepRemovedSubgraphs, 300)
    }

    const init = (editorApi) => {
        api = editorApi

        const mainGraph = api.getGraph()
        if (mainGraph) {
            const prevOnNodeRemoved = mainGraph.onNodeRemoved
            mainGraph.onNodeRemoved = function (node) {
                if (typeof prevOnNodeRemoved === "function") {
                    try { prevOnNodeRemoved.call(this, node) } catch (e) { /* ignore */ }
                }
                handleNodeRemoved(node)
            }
        }

        api.getCanvas().getExtraMenuOptions = function () {
            if (!isEditingSubgraph()) {
                return [{
                    content: "Create Subgraph…",
                    callback: () => { createBlankSubgraph() },
                }]
            }
            return [{
                content: "Close Subgraph Editor",
                callback: () => { closeEditingSubgraph() },
            }]
        }

        api.getGraph().onGetNodeMenuOptions = function (options, node) {
            if (isEditingSubgraph()) return
            options.push({
                content: "Create Subgraph",
                callback: () => { createSubgraphFromSelection(node) },
            })
            if (isSubgraphCallNode(node)) {
                options.unshift({
                    content: "Rename",
                    callback: () => { renameSubgraph(node) },
                })
                options.unshift({
                    content: "Edit Subgraph",
                    callback: () => { openSubgraphEditor(node.properties.subgraphId) },
                })
                options.unshift(null)
            }
        }

        const canvas = api.getCanvas()
        const prevShow = canvas.onShowNodePanel
        canvas.onShowNodePanel = function (n) {
            if (isSubgraphCallNode(n) && n.properties?.subgraphId) {
                // Defer so the double-click mouseup can finish before we swap graphs
                setTimeout(() => {
                    openSubgraphEditor(n.properties.subgraphId)
                }, 0)
                return
            }
            if (typeof prevShow === "function") prevShow.call(this, n)
            else canvas.showShowNodePanel(n)
        }

        // Keep setGraph-based editor; ignore LiteGraph's built-in closeSubgraph path
        canvas.closeSubgraph = function () {
            closeEditingSubgraph()
        }

        document.addEventListener("keydown", (e) => {
            if (e.key !== "Escape") return
            if (!editingSubgraphId) return
            const tag = (e.target && e.target.tagName && e.target.tagName.toLowerCase()) || ""
            if (tag === "input" || tag === "textarea" || tag === "select" || e.target?.isContentEditable) {
                return
            }
            e.preventDefault()
            closeEditingSubgraph()
        })

        api.sendWsRequest({ broadcastPurpose: "getSubgraphs" })
            .then((msg) => {
                if (Array.isArray(msg?.broadcastData)) {
                    applyDefinitions(msg.broadcastData)
                }
            })
            .catch((err) => console.warn("getSubgraphs failed", err))
            .finally(() => {
                if (typeof api.loadGraph === "function") {
                    api.loadGraph()
                }
            })
    }

    return {
        init,
        onSubgraphsChanged,
        isEditingSubgraph,
        isSubgraphCallNode,
        createBlankSubgraph,
        createSubgraphFromSelection,
        openSubgraphEditor,
        closeEditingSubgraph,
        getDefinitions: () => definitions.slice(),
    }
})()

window.NetsocketSubgraphs = NetsocketSubgraphs
