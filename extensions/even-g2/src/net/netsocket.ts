// WebSocket client to the netsocket host with Android-style device
// pairing (deviceHello → deviceChallenge → deviceAuth → dashboard
// approval). After approval, app messages are AES-256-GCM encrypted,
// exactly like extensions/android HostConnection.

import type { G2Config } from '../config'
import type { AlertItem, StatusSnapshot } from '../state/store'
import {
  b64decode,
  buildChallengeMessage,
  decryptEnvelope,
  deriveSessionKey,
  encryptEnvelope,
  generateEcdhKeypair,
  generateIdentityKeypair,
  signChallenge,
  verifyServerSignature,
  type KeyPairB64,
} from '../crypto/device'

export type LinkState = 'idle' | 'connecting' | 'pending' | 'approved' | 'denied' | 'error'

export interface LinkStatus {
  state: LinkState
  detail: string
}

interface PendingRequest {
  resolve: (data: unknown) => void
  reject: (err: Error) => void
  timer: number
}

const IDENTITY_KEY = 'netsocket-g2-identity'
const DEVICE_KEY = 'netsocket-g2-device'
const SERVER_PIN_KEY = 'netsocket-g2-server-pin'
const PING_MS = 10_000
const RECONNECT_MS = 3_000
const REQUEST_TIMEOUT_MS = 15_000

function loadJson<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : null
  } catch {
    return null
  }
}

function saveJson(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // ignore — pairing just won't persist
  }
}

export function getOrCreateDeviceId(): string {
  const existing = loadJson<{ id: string }>(DEVICE_KEY)
  if (existing?.id) return existing.id
  const id = crypto.randomUUID()
  saveJson(DEVICE_KEY, { id })
  return id
}

function getOrCreateIdentity(): KeyPairB64 {
  const existing = loadJson<KeyPairB64>(IDENTITY_KEY)
  if (existing?.publicKeyB64 && existing?.privateKeyB64) return existing
  const created = generateIdentityKeypair()
  saveJson(IDENTITY_KEY, created)
  return created
}

export function buildWsUrl(cfg: G2Config): string {
  const scheme = cfg.useHttps ? 'wss' : 'ws'
  const port = cfg.port.trim() ? `:${cfg.port.trim()}` : ''
  return `${scheme}://${cfg.host}${port}/`
}

export class NetsocketLink {
  private ws: WebSocket | null = null
  private status: LinkStatus = { state: 'idle', detail: 'not configured' }
  private sessionKey: CryptoKey | null = null
  private approved = false
  private ecdh: KeyPairB64 | null = null
  private identity: KeyPairB64 | null = null
  private deviceId = ''
  private deviceName = ''
  private shouldRun = false
  private reconnectTimer = 0
  private pingTimer = 0
  private pending = new Map<string, PendingRequest>()
  private onStatus: (s: LinkStatus) => void = () => {}
  private onOverlay: (alert: AlertItem) => void = () => {}

  setHandlers(onStatus: (s: LinkStatus) => void, onOverlay: (alert: AlertItem) => void): void {
    this.onStatus = onStatus
    this.onOverlay = onOverlay
  }

  getStatus(): LinkStatus {
    return this.status
  }

  private setStatus(state: LinkState, detail: string): void {
    this.status = { state, detail }
    this.onStatus(this.status)
  }

  start(cfg: G2Config): void {
    this.stop()
    if (!cfg.host.trim()) {
      this.setStatus('idle', 'set host in settings')
      return
    }
    this.shouldRun = true
    this.deviceId = getOrCreateDeviceId()
    this.identity = getOrCreateIdentity()
    this.deviceName = cfg.deviceName
    this.openSocket(buildWsUrl(cfg))
  }

  stop(): void {
    this.shouldRun = false
    window.clearTimeout(this.reconnectTimer)
    window.clearInterval(this.pingTimer)
    for (const [, p] of this.pending) {
      window.clearTimeout(p.timer)
      p.reject(new Error('stopped'))
    }
    this.pending.clear()
    try {
      this.ws?.close(1000, 'stopped')
    } catch {
      // ignore
    }
    this.ws = null
    this.sessionKey = null
    this.approved = false
    this.ecdh = null
  }

  reconnect(cfg: G2Config): void {
    this.start(cfg)
  }

  private scheduleReconnect(cfgUrl: string): void {
    if (!this.shouldRun) return
    window.clearTimeout(this.reconnectTimer)
    this.reconnectTimer = window.setTimeout(() => {
      if (this.shouldRun) this.openSocket(cfgUrl)
    }, RECONNECT_MS)
  }

  private openSocket(url: string): void {
    this.setStatus('connecting', url)
    this.sessionKey = null
    this.approved = false
    let ws: WebSocket
    try {
      ws = new WebSocket(url)
    } catch (err) {
      this.setStatus('error', err instanceof Error ? err.message : 'connect failed')
      this.scheduleReconnect(url)
      return
    }
    this.ws = ws

    ws.addEventListener('open', () => {
      if (this.ws !== ws) return
      this.ecdh = generateEcdhKeypair()
      this.sendRaw({
        broadcastPurpose: 'deviceHello',
        broadcastData: {
          deviceId: this.deviceId,
          identityPublicKey: this.identity?.publicKeyB64,
          ecdhPublicKey: this.ecdh.publicKeyB64,
          name: this.deviceName,
          platform: 'even-g2',
        },
      })
      window.clearInterval(this.pingTimer)
      this.pingTimer = window.setInterval(() => this.sendPing(), PING_MS)
    })

    ws.addEventListener('message', (ev) => {
      if (this.ws !== ws) return
      void this.handleMessage(String(ev.data))
    })

    const onDown = () => {
      if (this.ws !== ws) return
      window.clearInterval(this.pingTimer)
      this.sessionKey = null
      this.approved = false
      if (this.shouldRun) {
        this.setStatus('connecting', 'reconnecting')
        this.scheduleReconnect(url)
      } else {
        this.setStatus('idle', 'stopped')
      }
    }
    ws.addEventListener('close', onDown)
    ws.addEventListener('error', () => {
      this.setStatus('error', 'socket error')
    })
  }

  private sendRaw(payload: unknown): boolean {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return false
    try {
      this.ws.send(JSON.stringify(payload))
      return true
    } catch {
      return false
    }
  }

  private async sendApp(payload: Record<string, unknown>): Promise<boolean> {
    if (this.approved && this.sessionKey) {
      try {
        const sealed = await encryptEnvelope(this.sessionKey, payload)
        return this.sendRaw({ broadcastPurpose: 'encrypted', broadcastData: sealed })
      } catch {
        return false
      }
    }
    return this.sendRaw(payload)
  }

  private sendPing(): void {
    void this.sendApp({ broadcastPurpose: 'ping', broadcastData: { deviceId: this.deviceId } })
  }

  requestAlerts(limit = 50): Promise<AlertItem[]> {
    return new Promise((resolve, reject) => {
      if (!this.approved) {
        reject(new Error('not approved'))
        return
      }
      const requestId = crypto.randomUUID()
      const timer = window.setTimeout(() => {
        this.pending.delete(requestId)
        reject(new Error('timed out'))
      }, REQUEST_TIMEOUT_MS)
      this.pending.set(requestId, {
        resolve: (data) => {
          const list = (data as { alerts?: AlertItem[] } | null)?.alerts
          resolve(Array.isArray(list) ? list : [])
        },
        reject,
        timer,
      })
      if (!this.sendApp({ broadcastPurpose: 'getRecentAlerts', requestId, broadcastData: { limit } })) {
        this.pending.delete(requestId)
        window.clearTimeout(timer)
        reject(new Error('send failed'))
      }
    })
  }

  /** Fetch the status snapshot. Resolves null when the server has nothing
   *  useful (never rejects for a well-formed empty snapshot). Coordinates
   *  are already rounded to ~1km by the caller and never stored server-side. */
  requestStatus(lat: number | null, lon: number | null, unit: 'f' | 'c'): Promise<StatusSnapshot | null> {
    return new Promise((resolve, reject) => {
      if (!this.approved) {
        reject(new Error('not approved'))
        return
      }
      const requestId = crypto.randomUUID()
      const timer = window.setTimeout(() => {
        this.pending.delete(requestId)
        reject(new Error('timed out'))
      }, REQUEST_TIMEOUT_MS)
      this.pending.set(requestId, {
        resolve: (data) => {
          const snap = (data as { snapshot?: StatusSnapshot } | null)?.snapshot
          resolve(snap && typeof snap === 'object' ? snap : null)
        },
        reject,
        timer,
      })
      const broadcastData: Record<string, unknown> = { unit }
      if (typeof lat === 'number' && typeof lon === 'number') {
        broadcastData.lat = lat
        broadcastData.lon = lon
      }
      if (!this.sendApp({ broadcastPurpose: 'getStatusSnapshot', requestId, broadcastData })) {
        this.pending.delete(requestId)
        window.clearTimeout(timer)
        reject(new Error('send failed'))
      }
    })
  }

  private async handleMessage(raw: string): Promise<void> {
    let json: Record<string, unknown>
    try {
      json = JSON.parse(raw) as Record<string, unknown>
    } catch {
      return
    }
    const purpose = json.broadcastPurpose

    if (purpose === 'deviceChallenge') {
      await this.handleChallenge(json.broadcastData as Record<string, string>)
      return
    }
    if (purpose === 'deviceStatus') {
      this.handleDeviceStatus(json.broadcastData as Record<string, string>)
      return
    }
    if (purpose === 'deviceError') {
      const data = json.broadcastData as Record<string, string>
      this.setStatus('error', data?.message || data?.error || 'pairing error')
      return
    }

    let message = json
    if (purpose === 'encrypted') {
      if (!this.sessionKey) return
      try {
        const data = json.broadcastData as { nonce: string; ciphertext: string }
        message = (await decryptEnvelope(this.sessionKey, data.nonce, data.ciphertext)) as Record<string, unknown>
      } catch {
        return
      }
    }

    const requestId = typeof message.requestId === 'string' ? message.requestId : null
    if (requestId) {
      const pending = this.pending.get(requestId)
      if (pending) {
        this.pending.delete(requestId)
        window.clearTimeout(pending.timer)
        pending.resolve(message.broadcastData)
        return
      }
    }

    if (message.broadcastPurpose === 'pong') {
      if (this.approved && this.status.state !== 'approved') {
        this.setStatus('approved', 'linked')
      }
      return
    }
    if (message.broadcastPurpose === 'overlay') {
      const data = message.broadcastData
      let text = ''
      let conversationId: string | null = null
      let deviceId: string | null = null
      if (typeof data === 'string') {
        text = data
      } else if (data && typeof data === 'object') {
        const d = data as Record<string, unknown>
        text = String(d.text ?? d.message ?? '')
        conversationId = typeof d.conversationId === 'string' ? d.conversationId : null
        const rawDevice = d.deviceId ?? d.device_id
        deviceId = typeof rawDevice === 'string' && rawDevice ? rawDevice : null
      }
      // Only surface broadcasts and alerts targeted at this device.
      if (text && (!deviceId || deviceId === this.deviceId)) {
        this.onOverlay({ text, conversationId, deviceId, ts: Date.now() })
      }
    }
  }

  private async handleChallenge(data: Record<string, string>): Promise<void> {
    const identity = this.identity
    const ecdh = this.ecdh
    if (!identity || !ecdh) return
    const challenge = data.challenge || ''
    const serverIdentity = data.serverIdentityPublicKey || ''
    const serverEcdh = data.serverEcdhPublicKey || ''
    if (!challenge || !serverIdentity || !serverEcdh) {
      this.setStatus('error', 'bad challenge')
      return
    }
    const message = buildChallengeMessage({
      challenge,
      deviceId: this.deviceId,
      deviceIdentityPublicKey: identity.publicKeyB64,
      deviceEcdhPublicKey: ecdh.publicKeyB64,
      serverIdentityPublicKey: serverIdentity,
      serverEcdhPublicKey: serverEcdh,
    })
    if (!verifyServerSignature(serverIdentity, message, data.serverSignature || '')) {
      this.setStatus('error', 'server signature invalid')
      try {
        this.ws?.close(1000, 'bad server signature')
      } catch {
        // ignore
      }
      return
    }
    // Trust-on-first-use pinning, like the Android app.
    const pinned = loadJson<{ key: string }>(SERVER_PIN_KEY)
    if (!pinned) {
      saveJson(SERVER_PIN_KEY, { key: serverIdentity })
    } else if (pinned.key !== serverIdentity) {
      this.setStatus('error', 'server identity changed')
      try {
        this.ws?.close(1000, 'server identity mismatch')
      } catch {
        // ignore
      }
      return
    }
    try {
      this.sessionKey = await deriveSessionKey(ecdh.privateKeyB64, serverEcdh, challenge)
    } catch {
      this.setStatus('error', 'key exchange failed')
      return
    }
    const signature = signChallenge(identity.privateKeyB64, message)
    this.sendRaw({ broadcastPurpose: 'deviceAuth', broadcastData: { signature } })
    const status = data.status || 'pending'
    if (status === 'approved') {
      this.approved = true
      this.setStatus('approved', 'linked')
    } else {
      this.setStatus('pending', 'approve in dashboard')
    }
  }

  private handleDeviceStatus(data: Record<string, string>): void {
    const status = data.status || ''
    if (status === 'approved') {
      this.approved = true
      this.setStatus('approved', 'linked')
    } else if (status === 'pending') {
      this.approved = false
      this.setStatus('pending', 'approve in dashboard')
    } else if (status === 'denied') {
      this.approved = false
      this.setStatus('denied', 'denied in dashboard')
      try {
        this.ws?.close(1000, 'denied')
      } catch {
        // ignore
      }
    }
  }
}

/** Decode a b64 challenge to bytes (used only in tests/diag). */
export function challengeBytes(challengeB64: string): Uint8Array {
  return b64decode(challengeB64)
}
