'use strict'

const { describe, it } = require('node:test')
const assert = require('node:assert/strict')
const {
    buildSnippetContext,
    createQuickWebSearchTools,
    quickWebSearch,
} = require('../server/utils/quickWebSearch')

describe('quickWebSearch', () => {
    describe('buildSnippetContext', () => {
        it('formats search hits into labeled snippets', () => {
            const context = buildSnippetContext([
                { title: 'Example', snippet: 'A short summary.', url: 'https://example.com' },
                { title: 'Other', snippet: '', url: 'https://other.com' },
            ])

            assert.match(context, /\[1\] Example/)
            assert.match(context, /A short summary/)
            assert.match(context, /\[2\] Other/)
            assert.match(context, /\(no snippet\)/)
        })
    })

    describe('createQuickWebSearchTools', () => {
        it('defines read_web_page and enforces a page read limit', async () => {
            let fetchCount = 0
            const fetchFn = async () => {
                fetchCount += 1
                return {
                    ok: true,
                    status: 200,
                    url: 'https://example.com/detail',
                    headers: { get: () => 'text/html' },
                    body: null,
                    arrayBuffer: async () => Buffer.from('<html><title>Detail</title><body>Full price is $42.50</body></html>'),
                }
            }

            const tools = createQuickWebSearchTools({
                fetchFn,
                maxPageReads: 1,
                query: 'SNXX price',
                silent: true,
            })

            assert.ok(tools.read_web_page)
            assert.equal(typeof tools.read_web_page.execute, 'function')

            const first = await tools.read_web_page.execute({ url: 'https://example.com/detail' })
            const second = await tools.read_web_page.execute({ url: 'https://example.com/other' })

            assert.equal(fetchCount, 1)
            assert.match(first.text, /42\.50/)
            assert.match(second.error, /Page read limit reached/)
        })
    })

    describe('quickWebSearch', () => {
        it('returns an error for empty queries', async () => {
            const result = await quickWebSearch('   ')
            assert.equal(result.response, '')
            assert.equal(result.error, 'Query is empty')
        })

        it('synthesizes from search snippets without fetching pages when the model answers directly', async () => {
            const fetchFn = async (url) => {
                if (String(url).includes('api.duckduckgo.com')) {
                    return {
                        ok: true,
                        status: 200,
                        url: String(url),
                        headers: { get: () => 'application/json' },
                        body: null,
                        arrayBuffer: async () => Buffer.from(JSON.stringify({
                            Heading: 'SNXX',
                            AbstractText: 'SNXX trades at $42.50.',
                            AbstractURL: 'https://example.com/snxx',
                            RelatedTopics: [],
                        })),
                    }
                }
                throw new Error(`Unexpected fetch (page reads should not happen): ${url}`)
            }

            const result = await quickWebSearch('What is the price of SNXX stock right now', {
                fetchFn,
                silent: true,
                maxResults: 1,
                generateTextFn: async () => ({ text: 'SNXX is trading at $42.50.' }),
            })

            assert.equal(result.error, undefined)
            assert.equal(result.response, 'SNXX is trading at $42.50.')
        })
    })
})
