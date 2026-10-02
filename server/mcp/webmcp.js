'use strict'

/**
 * WebMCP settings: URL + API key so netsocket can drive an external headless
 * browser (webmcp, a Chrome DevTools MCP) — currently used by get_canvas to
 * turn an SVG graph preview into a real PNG screenshot without bundling a
 * browser in netsocket's own image.
 */

const { addPref } = require('../manager/nodePreferencesRegistry')

const WEBMCP_URL_SETTING = 'webmcp.url'
const WEBMCP_API_KEY_SETTING = 'webmcp.apiKey'

addPref(
    'MCP',
    WEBMCP_URL_SETTING,
    'WebMCP URL',
    'text',
    'https://webmcp.stfd.cc/mcp',
    '<p>URL of the WebMCP (Chrome DevTools MCP) endpoint used for canvas screenshots, e.g. <code>https://webmcp.stfd.cc/mcp</code>.</p>'
)

addPref(
    'MCP',
    WEBMCP_API_KEY_SETTING,
    'WebMCP API Key',
    'text',
    '',
    '<p>Bearer API key for the WebMCP endpoint. Stored with other settings; never shown back in clear text over MCP.</p>'
)

module.exports = { WEBMCP_URL_SETTING, WEBMCP_API_KEY_SETTING }
