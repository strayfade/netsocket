'use strict'

const { describe, it } = require('node:test')
const assert = require('node:assert/strict')
const {
    htmlToText,
    extractTitle,
    isAllowedUrl,
    parseDuckDuckGoHtmlResults,
    parseDuckDuckGoInstantResults,
    webSearch,
    readWebPage,
    createWebResearchTools,
    excerptForQuery,
    buildResearchContext,
    formatAnswerWithSources,
    gatherSearchSourceContent,
} = require('../server/utils/webResearchTools')
const { stripThinkingTags, deepResearch } = require('../server/utils/deepResearch')

describe('webResearchTools', () => {
    describe('htmlToText', () => {
        it('strips tags and decodes entities', () => {
            const html = '<html><body><h1>Hello &amp; world</h1><script>ignore()</script><p>Line one</p></body></html>'
            const text = htmlToText(html)
            assert.match(text, /Hello & world/)
            assert.match(text, /Line one/)
            assert.doesNotMatch(text, /ignore/)
        })

        it('truncates very long pages', () => {
            const html = `<p>${'word '.repeat(5000)}</p>`
            const text = htmlToText(html, 100)
            assert.ok(text.length <= 120)
            assert.match(text, /\.\.\.\[truncated\]$/)
        })
    })

    describe('extractTitle', () => {
        it('reads the document title', () => {
            const html = '<html><head><title>Example &amp; Co</title></head><body></body></html>'
            assert.equal(extractTitle(html), 'Example & Co')
        })
    })

    describe('isAllowedUrl', () => {
        it('allows public http and https URLs', () => {
            assert.equal(isAllowedUrl('https://example.com/path'), true)
            assert.equal(isAllowedUrl('http://news.example.org/article'), true)
        })

        it('blocks local and private targets', () => {
            assert.equal(isAllowedUrl('http://127.0.0.1/admin'), false)
            assert.equal(isAllowedUrl('http://localhost/secret'), false)
            assert.equal(isAllowedUrl('http://192.168.0.10/internal'), false)
            assert.equal(isAllowedUrl('file:///etc/passwd'), false)
            assert.equal(isAllowedUrl('not-a-url'), false)
        })
    })

    describe('parseDuckDuckGoHtmlResults', () => {
        it('extracts result links and snippets', () => {
            const html = `
                <div class="result">
                    <a class="result__a" href="https://example.com/a">First Result</a>
                    <a class="result__snippet">Snippet one</a>
                </div>
                <div class="result">
                    <a class="result__a" href="http://127.0.0.1/b">Blocked</a>
                    <a class="result__snippet">Should not appear</a>
                </div>
            `
            const results = parseDuckDuckGoHtmlResults(html, 5)
            assert.equal(results.length, 1)
            assert.equal(results[0].url, 'https://example.com/a')
            assert.equal(results[0].title, 'First Result')
            assert.match(results[0].snippet, /Snippet one/)
        })
    })

    describe('parseDuckDuckGoInstantResults', () => {
        it('maps instant answer API payloads', () => {
            const payload = {
                Heading: 'Topic',
                AbstractText: 'A short summary.',
                AbstractURL: 'https://example.com/summary',
                RelatedTopics: [
                    { Text: 'Related item - details', FirstURL: 'https://example.com/related' },
                ],
            }
            const results = parseDuckDuckGoInstantResults(payload, 5)
            assert.equal(results.length, 2)
            assert.equal(results[0].url, 'https://example.com/summary')
            assert.equal(results[1].url, 'https://example.com/related')
        })
    })

    describe('webSearch', () => {
        it('returns parsed results from mocked fetch responses', async () => {
            const fetchFn = async (url, options = {}) => {
                if (String(url).includes('api.duckduckgo.com')) {
                    return {
                        ok: true,
                        status: 200,
                        url: String(url),
                        headers: { get: () => 'application/json' },
                        body: null,
                        arrayBuffer: async () => Buffer.from(JSON.stringify({
                            Heading: 'Test',
                            AbstractText: 'Instant answer',
                            AbstractURL: 'https://example.com/instant',
                            RelatedTopics: [],
                        })),
                    }
                }
                if (String(url).includes('html.duckduckgo.com')) {
                    return {
                        ok: true,
                        status: 200,
                        url: String(url),
                        headers: { get: () => 'text/html' },
                        body: null,
                        arrayBuffer: async () => Buffer.from(`
                            <div class="result">
                                <a class="result__a" href="https://example.com/html">HTML Result</a>
                                <a class="result__snippet">From HTML search</a>
                            </div>
                        `),
                    }
                }
                throw new Error(`Unexpected fetch: ${url}`)
            }

            const result = await webSearch('test query', { fetchFn, silent: true })
            assert.equal(result.query, 'test query')
            assert.ok(result.results.length >= 1)
            assert.equal(result.results[0].url, 'https://example.com/instant')
        })

        it('returns an error for empty queries', async () => {
            const result = await webSearch('   ')
            assert.deepEqual(result.results, [])
            assert.equal(result.error, 'Query is empty')
        })
    })

    describe('readWebPage', () => {
        it('returns extracted page text from mocked fetch', async () => {
            const fetchFn = async () => ({
                ok: true,
                status: 200,
                url: 'https://example.com/article',
                headers: { get: () => 'text/html' },
                body: null,
                arrayBuffer: async () => Buffer.from('<html><head><title>Article</title></head><body><p>Body text</p></body></html>'),
            })

            const page = await readWebPage('https://example.com/article', { fetchFn, silent: true })
            assert.equal(page.title, 'Article')
            assert.match(page.text, /Body text/)
        })

        it('rejects disallowed URLs without fetching', async () => {
            let called = false
            const fetchFn = async () => {
                called = true
                return {}
            }
            const page = await readWebPage('http://127.0.0.1/private', { fetchFn, silent: true })
            assert.equal(called, false)
            assert.equal(page.error, 'URL is not allowed')
        })
    })

    describe('excerptForQuery', () => {
        it('prefers paragraphs that match query terms', () => {
            const text = [
                'Unrelated introduction about weather patterns.',
                'Tokyo population statistics show steady growth in recent years.',
                'Another unrelated paragraph about transport systems.',
            ].join('\n\n')
            const excerpt = excerptForQuery(text, 'Tokyo population', 120)
            assert.match(excerpt, /Tokyo population statistics/)
            assert.doesNotMatch(excerpt, /transport systems/)
        })

        it('truncates long excerpts', () => {
            const text = 'alpha beta gamma delta '.repeat(100)
            const excerpt = excerptForQuery(text, 'alpha beta', 50)
            assert.ok(excerpt.length <= 70)
            assert.match(excerpt, /\.\.\.\[truncated\]$/)
        })
    })

    describe('buildResearchContext', () => {
        it('labels each source for synthesis', () => {
            const context = buildResearchContext([
                { index: 1, title: 'One', url: 'https://example.com/one', text: 'First body' },
                { index: 2, title: 'Two', url: 'https://example.com/two', text: 'Second body' },
            ])
            assert.match(context, /\[Source 1\] One/)
            assert.match(context, /URL: https:\/\/example.com\/one/)
            assert.match(context, /First body/)
            assert.match(context, /\[Source 2\] Two/)
        })
    })

    describe('formatAnswerWithSources', () => {
        it('appends numbered sources after the consensus answer', () => {
            const answer = formatAnswerWithSources('Consensus answer here.', [
                { index: 1, title: 'Example', url: 'https://example.com' },
            ])
            assert.match(answer, /^Consensus answer here\.\n\nSources:/)
            assert.match(answer, /\[1\] Example - https:\/\/example.com/)
        })
    })

    describe('gatherSearchSourceContent', () => {
        it('reads and extracts text from each search result', async () => {
            const fetchFn = async (url) => {
                if (String(url).includes('api.duckduckgo.com')) {
                    return {
                        ok: true,
                        status: 200,
                        url: String(url),
                        headers: { get: () => 'application/json' },
                        body: null,
                        arrayBuffer: async () => Buffer.from(JSON.stringify({
                            Heading: 'Test',
                            AbstractText: 'Instant answer',
                            AbstractURL: 'https://example.com/instant',
                            RelatedTopics: [],
                        })),
                    }
                }
                if (String(url).includes('html.duckduckgo.com')) {
                    return {
                        ok: true,
                        status: 200,
                        url: String(url),
                        headers: { get: () => 'text/html' },
                        body: null,
                        arrayBuffer: async () => Buffer.from(`
                            <div class="result">
                                <a class="result__a" href="https://example.com/html">HTML Result</a>
                                <a class="result__snippet">From HTML search</a>
                            </div>
                        `),
                    }
                }
                if (String(url).includes('example.com/instant')) {
                    return {
                        ok: true,
                        status: 200,
                        url: 'https://example.com/instant',
                        headers: { get: () => 'text/html' },
                        body: null,
                        arrayBuffer: async () => Buffer.from(
                            '<html><head><title>Instant Page</title></head><body><p>Instant page body about Tokyo population.</p></body></html>'
                        ),
                    }
                }
                if (String(url).includes('example.com/html')) {
                    return {
                        ok: true,
                        status: 200,
                        url: 'https://example.com/html',
                        headers: { get: () => 'text/html' },
                        body: null,
                        arrayBuffer: async () => Buffer.from(
                            '<html><head><title>HTML Page</title></head><body><p>HTML page body with more Tokyo population data.</p></body></html>'
                        ),
                    }
                }
                throw new Error(`Unexpected fetch: ${url}`)
            }

            const gathered = await gatherSearchSourceContent('Tokyo population', {
                fetchFn,
                silent: true,
                maxSearchResults: 2,
            })

            assert.equal(gathered.sources.length, 2)
            assert.match(gathered.sources[0].text, /Tokyo population/)
            assert.match(gathered.sources[1].text, /Tokyo population/)
            assert.ok(gathered.sources.every((source) => source.url && source.title))
        })
    })

    describe('createWebResearchTools', () => {
        it('defines web_search and read_web_page tools', () => {
            const tools = createWebResearchTools()
            assert.ok(tools.web_search)
            assert.ok(tools.read_web_page)
            assert.equal(typeof tools.web_search.execute, 'function')
            assert.equal(typeof tools.read_web_page.execute, 'function')
        })
    })
})

describe('deepResearch', () => {
    it('strips thinking tags from model output', () => {
        const raw = '<think>hidden</think>Final answer'
        assert.equal(stripThinkingTags(raw), 'Final answer')
    })

    it('returns an error for empty questions', async () => {
        const result = await deepResearch('   ')
        assert.equal(result.answer, '')
        assert.equal(result.error, 'Question is empty')
    })
})
