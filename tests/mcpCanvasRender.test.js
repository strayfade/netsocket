'use strict'

const { describe, it } = require('node:test')
const assert = require('node:assert/strict')

const { renderGraphSvg, renderPreviewHtml } = require('../server/mcp/canvasRender')

describe('canvas renderer', () => {
    it('renders nodes, links, reroutes and groups', () => {
        const inner = {
            nodes: [
                {
                    id: 'a', type: 'Math/Add', pos: [100, 100], size: [180, 60],
                    inputs: [{ name: 'A', type: 'number', link: null }],
                    outputs: [{ name: '', type: 'number', links: ['l1'], slot_index: 0 }],
                },
                {
                    id: 'r', type: 'Reroute', pos: [350, 120], size: [24, 24],
                    inputs: [{ name: '', type: '*', link: 'l1' }],
                    outputs: [{ name: '', type: '*', links: ['l2'], slot_index: 0 }],
                },
                {
                    id: 'b', type: 'Math/Add', pos: [500, 100], size: [180, 60],
                    inputs: [{ name: 'A', type: 'number', link: 'l2' }],
                    outputs: [{ name: '', type: 'number', links: [], slot_index: 0 }],
                },
            ],
            links: [
                ['l1', 'a', 0, 'r', 0, 'number'],
                ['l2', 'r', 0, 'b', 0, 'number'],
                ['l9', 'a', 0, 'b', 0, -1],
            ],
            groups: [{ title: 'Math', bounding: [50, 50, 700, 200], color: '#0ea5e9', font_size: 24 }],
        }
        const { svg, width, height } = renderGraphSvg(inner)
        assert.ok(svg.startsWith('<svg'))
        assert.ok(svg.includes('<circle'), 'reroute circle and port pins')
        assert.ok(svg.includes('stroke="#22d3ee"'), 'data link color')
        assert.ok(svg.includes('stroke="#a3e635"'), 'event link color')
        assert.ok(svg.includes('Math'), 'group title')
        assert.ok(width > 700 && height > 100)
    })

    it('escapes hostile labels', () => {
        const inner = {
            nodes: [{ id: 'x', type: 'Test/<img src=x onerror=alert(1)>', pos: [0, 0], size: [180, 60], inputs: [], outputs: [] }],
            links: [],
            groups: [],
        }
        const { svg } = renderGraphSvg(inner)
        assert.ok(!svg.includes('<img'), 'raw tag must not appear')
        assert.ok(svg.includes('&lt;img'))
    })

    it('handles object-form sizes and empty graphs', () => {
        const inner = {
            nodes: [{ id: 'a', type: 'Math/Add', pos: [10, 10], size: { 0: 160, 1: 30 }, inputs: [], outputs: [] }],
            links: [],
            groups: [],
        }
        const sized = renderGraphSvg(inner)
        assert.ok(sized.svg.includes('width="160"'))
        const empty = renderGraphSvg({ nodes: [], links: [], groups: [] })
        assert.ok(empty.svg.includes('empty graph'))
    })

    it('wraps svg in a dark preview document', () => {
        const html = renderPreviewHtml('<svg></svg>', 800, 600)
        assert.ok(html.includes('<!DOCTYPE html>'))
        assert.ok(html.includes('<svg></svg>'))
        assert.ok(html.includes('#0a0a0a'))
    })
})
