'use strict'

/**
 * Server-side schematic rendering of the nodegraph: SVG preview of nodes,
 * links and groups plus an HTML wrapper used for webmcp screenshots.
 *
 * This is intentionally schematic (not pixel-identical to the LiteGraph
 * canvas): port rows collapse to evenly spaced pins and widgets are not
 * drawn. It is enough to judge layout, alignment and wiring at a glance.
 */

const { sizeWH } = require('./graphStore')

const NODE_FILL = '#171717'
const NODE_STROKE = '#525252'
const TITLE_FILL = '#fafafa'
const TYPE_FILL = '#a3a3a3'
const GROUP_FILL = 'rgba(56,189,248,0.06)'
const GROUP_STROKE = '#0ea5e9'
const DATA_LINK = '#22d3ee'
const EVENT_LINK = '#a3e635'
const PORT_FILL = '#737373'

const escapeXml = (value) => String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')

const nodeBox = (node) => {
    const isReroute = node && node.type === 'Reroute'
    const [w, h] = sizeWH(node && node.size, ...(isReroute ? [24, 24] : [180, 60]))
    const x = Number(node.pos[0])
    const y = Number(node.pos[1])
    return { x, y, w, h, isReroute }
}

/** Evenly spaced pin positions along an edge, top-to-bottom. */
const pinPositions = (x, y, h, count) => {
    if (!count) return []
    if (count === 1) return [y + h / 2]
    const top = y + 10
    const bottom = y + h - 10
    if (bottom <= top) return Array.from({ length: count }, (_, i) => y + (h * (i + 1)) / (count + 1))
    return Array.from({ length: count }, (_, i) => top + ((bottom - top) * i) / (count - 1))
}

const renderGraphSvg = (inner, options = {}) => {
    const { fontScale = 1 } = options
    const nodes = (inner.nodes || []).filter(Boolean)
    const links = (inner.links || []).filter(Array.isArray)
    const groups = (inner.groups || []).filter(Boolean)

    const boxes = new Map()
    for (const node of nodes) {
        if (!Array.isArray(node.pos)) continue
        const box = nodeBox(node)
        const inputs = Array.isArray(node.inputs) ? node.inputs : []
        const outputs = Array.isArray(node.outputs) ? node.outputs : []
        boxes.set(node.id, {
            ...box,
            node,
            inPins: pinPositions(box.x, box.y, box.h, inputs.length),
            outPins: pinPositions(box.x, box.y, box.h, outputs.length),
        })
    }

    let minX = Infinity
    let minY = Infinity
    let maxX = -Infinity
    let maxY = -Infinity
    const grow = (x, y) => {
        if (x < minX) minX = x
        if (y < minY) minY = y
        if (x > maxX) maxX = x
        if (y > maxY) maxY = y
    }
    for (const group of groups) {
        const bounding = Array.isArray(group.bounding) ? group.bounding.map(Number) : [10, 10, 140, 80]
        grow(bounding[0], bounding[1])
        grow(bounding[0] + bounding[2], bounding[1] + bounding[3])
    }
    for (const box of boxes.values()) {
        grow(box.x, box.y)
        grow(box.x + box.w, box.y + box.h)
    }
    if (!Number.isFinite(minX)) {
        minX = 0
        minY = 0
        maxX = 800
        maxY = 600
    }
    const pad = 48
    minX -= pad
    minY -= pad
    maxX += pad
    maxY += pad
    const width = Math.max(320, Math.ceil(maxX - minX))
    const height = Math.max(240, Math.ceil(maxY - minY))

    const parts = []
    parts.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="${minX} ${minY} ${width} ${height}" font-family="ui-monospace,Menlo,Consolas,monospace">`)
    parts.push(`<rect x="${minX}" y="${minY}" width="${width}" height="${height}" fill="#0a0a0a"/>`)

    groups.forEach((group) => {
        const bounding = Array.isArray(group.bounding) ? group.bounding.map(Number) : [10, 10, 140, 80]
        const [gx, gy, gw, gh] = bounding
        parts.push(`<rect x="${gx}" y="${gy}" width="${gw}" height="${gh}" rx="8" fill="${GROUP_FILL}" stroke="${GROUP_STROKE}" stroke-width="1.5" stroke-dasharray="6 4"/>`)
        parts.push(`<text x="${gx + 10}" y="${gy + 22}" font-size="${20 * fontScale}" fill="${GROUP_STROKE}">${escapeXml(group.title || 'Group')}</text>`)
    })

    for (const link of links) {
        const [, originId, originSlot, targetId, targetSlot, type] = link
        const from = boxes.get(originId)
        const to = boxes.get(targetId)
        if (!from || !to) continue
        const x1 = from.x + from.w
        const y1 = from.outPins[originSlot] ?? (from.y + from.h / 2)
        const x2 = to.x
        const y2 = to.inPins[targetSlot] ?? (to.y + to.h / 2)
        const dx = Math.max(24, Math.abs(x2 - x1) / 2)
        const color = type === -1 ? EVENT_LINK : DATA_LINK
        const dash = type === -1 ? ' stroke-dasharray="5 4"' : ''
        parts.push(`<path d="M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}" fill="none" stroke="${color}" stroke-width="2"${dash}/>`)
    }

    for (const box of boxes.values()) {
        const { node, x, y, w, h, isReroute, inPins, outPins } = box
        if (isReroute) {
            const cx = x + w / 2
            const cy = y + h / 2
            parts.push(`<circle cx="${cx}" cy="${cy}" r="7" fill="#0a0a0a" stroke="#e5e5e5" stroke-width="2"/>`)
            continue
        }
        parts.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="6" fill="${NODE_FILL}" stroke="${NODE_STROKE}" stroke-width="1.5"/>`)
        const shortName = String(node.type || '').split('/').pop() || node.type
        parts.push(`<text x="${x + 10}" y="${y + 20}" font-size="${12 * fontScale}" fill="${TITLE_FILL}">${escapeXml(shortName).slice(0, 32)}</text>`)
        parts.push(`<text x="${x + 10}" y="${y + 34}" font-size="${9 * fontScale}" fill="${TYPE_FILL}">${escapeXml(String(node.type || '').split('/').slice(0, -1).join('/') || '').slice(0, 40)}</text>`)
        inPins.forEach((py) => {
            parts.push(`<circle cx="${x}" cy="${py}" r="3.5" fill="${PORT_FILL}"/>`)
        })
        outPins.forEach((py) => {
            parts.push(`<circle cx="${x + w}" cy="${py}" r="3.5" fill="${PORT_FILL}"/>`)
        })
    }

    if (nodes.length === 0) {
        parts.push(`<text x="${minX + width / 2}" y="${minY + height / 2}" font-size="16" fill="${TYPE_FILL}" text-anchor="middle">empty graph — add nodes with add_node</text>`)
    }

    parts.push('</svg>')
    return { svg: parts.join(''), width, height }
}

const renderPreviewHtml = (svg, width, height) => `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Netsocket graph ${width}x${height}</title>
<style>html,body{margin:0;padding:24px;background:#0a0a0a;}svg{display:block;}</style>
</head><body>${svg}</body></html>`

module.exports = { renderGraphSvg, renderPreviewHtml, escapeXml }
