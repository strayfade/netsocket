// Global AI Providers cache for node property widgets
(function () {
    window.__netsocketProviders = []
    window.__netsocketProvidersFetch = async function () {
        try {
            const res = await fetch('/v1/providers', { credentials: 'same-origin' })
            if (!res.ok) return []
            const j = await res.json()
            window.__netsocketProviders = Array.isArray(j.providers) ? j.providers : []
            return window.__netsocketProviders
        } catch (e) { console.warn('providers fetch failed', e); return [] }
    }
    // Fetch on load
    window.__netsocketProvidersFetch()

    const AI_NODE_TYPES = new Set([
        'Language Processing/LLM',
        'Language Processing/Small LLM',
        'Language Processing/Structured Output LLM',
        'Language Processing/Deep Research LLM',
        'Language Processing/Quick Web Search LLM',
        'Language Processing/MCP Agent',
    ])

    window.__netsocketIsAiNode = function (type) { return AI_NODE_TYPES.has(type) }

    // Ensure Provider enum and Model enum are populated dynamically
    window.ensureProviderModelProperties = function (node) {
        if (!node || !node.properties) return
        const hasProvider = node.properties.hasOwnProperty('Provider')
        const hasModel = node.properties.hasOwnProperty('Model')
        if (!hasProvider && !hasModel) return
        if (!window.__netsocketIsAiNode(node.type)) return

        if (!node.properties_info) node.properties_info = []

        if (hasProvider) {
            let info = node.properties_info.find(p => p.name === 'Provider')
            const providers = window.__netsocketProviders || []
            const values = providers.map(p => p.id)
            // Map id -> display for tooltip? LiteGraph shows values as-is; we include names in dropdown via custom label? We'll use "name (id short)" but store id.
            // Keep values as ids; UI will show ids - patch display via widget custom.
            if (!info) {
                info = { name: 'Provider', type: 'enum', default_value: '', values: values.length ? values : [''] }
                node.properties_info.push(info)
            } else {
                info.type = 'enum'
                info.values = values.length ? values : ['']
            }
            // If current value is empty and there's a default provider, set it
            const def = providers.find(p => p.isDefault)
            if ((!node.properties['Provider'] || !String(node.properties['Provider']).trim()) && def) {
                node.properties['Provider'] = def.id
            } else if (node.properties['Provider'] && !providers.some(p => p.id === node.properties['Provider'])) {
                // stale provider id, fallback to default or keep as-is
                if (def) node.properties['Provider'] = def.id
            }
        }

        if (hasModel) {
            let info = node.properties_info.find(p => p.name === 'Model')
            // Model values will be populated on demand via fetch; start with current value plus empty
            const cur = String(node.properties['Model'] || '')
            const values = cur ? [cur, ''] : ['']
            if (!info) {
                info = { name: 'Model', type: 'string', default_value: '' }
                node.properties_info.push(info)
            }
            // Don't force enum; keep as string so user can type custom model. If providers have model lists cached, convert to enum
            // We'll lazily turn into enum when we have a model list for selected provider
            const providerId = String(node.properties['Provider'] || '')
            const cached = window.__netsocketModelCache && window.__netsocketModelCache[providerId]
            if (cached && Array.isArray(cached) && cached.length) {
                info.type = 'enum'
                const uniq = new Set([cur, ...cached].filter(Boolean))
                if (!cur) uniq.add('')
                info.values = Array.from(uniq)
                // If current model empty and provider has defaultModel, use it
                const prov = (window.__netsocketProviders || []).find(p => p.id === providerId)
                if (!cur && prov && prov.defaultModel) {
                    node.properties['Model'] = prov.defaultModel
                    if (!info.values.includes(prov.defaultModel)) info.values.unshift(prov.defaultModel)
                }
            } else {
                // keep as string input
                info.type = 'string'
                if (info.values) delete info.values
            }
        }
    }

    window.__netsocketModelCache = {}

    window.__netsocketFetchModels = async function (providerId) {
        if (!providerId) return []
        if (window.__netsocketModelCache[providerId]) return window.__netsocketModelCache[providerId]
        try {
            const res = await fetch('/v1/providers/' + encodeURIComponent(providerId) + '/models', { credentials: 'same-origin' })
            if (!res.ok) throw new Error('HTTP ' + res.status)
            const j = await res.json()
            const list = Array.isArray(j.models) ? j.models.map(m => String(m.id || '').trim()).filter(Boolean) : []
            window.__netsocketModelCache[providerId] = list
            return list
        } catch (e) {
            console.warn('fetch models failed', e)
            return []
        }
    }

    // Patch createNode lifecycle if available, otherwise hook into LiteGraph node creation
    const origEnsure = window.ensureProviderModelProperties
    // Expose refresh that node panel can call when provider selection changes
    window.__netsocketRefreshNodeModelValues = async function (node) {
        if (!node) return
        const pid = String(node.properties['Provider'] || '')
        if (pid) await window.__netsocketFetchModels(pid)
        window.ensureProviderModelProperties(node)
        // Trigger panel refresh if canvas panel is open
        if (window.LGraphCanvas && window.LGraphCanvas.prototype && window.LiteGraph) {
            // no-op, panel will re-render on next property change
        }
    }

    // Periodically refresh providers cache when editor is open
    setInterval(() => { window.__netsocketProvidersFetch() }, 30000)
})()
