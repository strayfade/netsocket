// Minimal client for the Aria external API (docs/external-api.md).
// Glasses-friendly: non-streaming, short/plaintext presets, tool calls
// hidden — the caller only needs the final text.

import type { G2Config } from '../config'

const CHAT_TIMEOUT_MS = 120_000

export interface AriaProvider {
  id: string
  name: string
  defaultModel: string
  isDefault?: boolean
  models: { id: string }[] | null
  modelError: string | null
}

function baseUrl(cfg: G2Config): string {
  // Accept the host root with or without a trailing /api/v1 — the path
  // is appended below, and users paste the docs' base URL verbatim.
  return cfg.ariaEndpoint
    .replace(/\/+$/, '')
    .replace(/\/api\/v1$/i, '')
}

function headers(cfg: G2Config): Record<string, string> {
  return {
    Authorization: `Bearer ${cfg.ariaKey}`,
    'Content-Type': 'application/json',
  }
}

/**
 * Streaming chat: resolves with the full reply, calling onText with the
 * accumulated text as deltas arrive so the UI renders progressively.
 * Pass an AbortSignal to cancel (e.g. backing out of the reply view).
 */
export async function sendPromptStream(
  cfg: G2Config,
  message: string,
  onText: (fullText: string) => void,
  signal?: AbortSignal,
): Promise<string> {
  if (!cfg.ariaEndpoint || !cfg.ariaKey) throw new Error('aria not configured')
  if (!cfg.providerId || !cfg.model) throw new Error('aria model not set')
  const ctrl = new AbortController()
  const timer = window.setTimeout(() => ctrl.abort(), CHAT_TIMEOUT_MS)
  const forwardAbort = () => ctrl.abort()
  signal?.addEventListener('abort', forwardAbort)
  try {
    const res = await fetch(`${baseUrl(cfg)}/api/v1/chat`, {
      method: 'POST',
      headers: headers(cfg),
      signal: ctrl.signal,
      body: JSON.stringify({
        message,
        providerId: cfg.providerId,
        model: cfg.model,
        preset: cfg.preset,
        response_format: 'plaintext',
        include_tool_calls: false,
        include_tool_results: false,
        stream: true,
      }),
    })
    if (!res.ok) throw new Error(await readError(res))
    if (!res.body) throw new Error('aria empty stream')
    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    let full = ''
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const frames = buffer.split('\n\n')
      buffer = frames.pop() ?? ''
      for (const frame of frames) {
        for (const line of frame.split('\n')) {
          const text = line.startsWith('data:') ? line.slice(5).trim() : ''
          if (!text) continue
          let event: { type?: string; delta?: string; message?: string | { content?: string } }
          try {
            event = JSON.parse(text) as typeof event
          } catch {
            continue
          }
          if (event.type === 'text-delta' && typeof event.delta === 'string') {
            full += event.delta
            onText(full)
          } else if (event.type === 'done') {
            const content =
              typeof event.message === 'string' ? event.message : event.message?.content
            if (content && content.trim()) {
              full = content.trim()
              onText(full)
            }
          } else if (event.type === 'error' && event.message) {
            const msg = typeof event.message === 'string' ? event.message : JSON.stringify(event.message)
            throw new Error(`aria: ${msg.slice(0, 280)}`)
          }
        }
      }
    }
    if (!full.trim()) throw new Error('aria empty reply')
    return full.trim()
  } catch (err) {
    if (err instanceof Error && (err.name === 'AbortError' || ctrl.signal.aborted)) {
      throw new Error('cancelled')
    }
    throw err instanceof Error ? err : new Error('aria failed')
  } finally {
    signal?.removeEventListener('abort', forwardAbort)
    window.clearTimeout(timer)
  }
}

/** Turn an error status into a human message, preferring the API's own reason. */
async function readError(res: Response): Promise<string> {
  const fallback = `aria ${res.status}`
  try {
    const json = (await res.json()) as { error?: unknown }
    if (typeof json.error === 'string' && json.error.trim()) {
      return `${fallback}: ${json.error.trim().slice(0, 280)}`
    }
    if (json.error !== undefined) {
      return `${fallback}: ${JSON.stringify(json.error).slice(0, 280)}`
    }
  } catch {
    // not JSON — fall through
  }
  return fallback
}

export async function fetchProviders(cfg: G2Config): Promise<AriaProvider[]> {
  if (!cfg.ariaEndpoint || !cfg.ariaKey) throw new Error('aria not configured')
  const res = await fetch(`${baseUrl(cfg)}/api/v1/models`, { headers: headers(cfg) })
  if (!res.ok) throw new Error(`aria ${res.status}`)
  const json = (await res.json()) as { providers?: AriaProvider[] }
  return Array.isArray(json.providers) ? json.providers : []
}
