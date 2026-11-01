export type VarsWsClient = {
  close: () => void
}

/** Live variable updates: payload is `{ name, value }` per broadcast. */
export function connectVarsSocket(
  onVarChanged: (name: string, value: string) => void,
): VarsWsClient {
  let closed = false
  let ws: WebSocket | null = null
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null
  let pingTimer: ReturnType<typeof setInterval> | null = null

  const wsUrl = () => `${location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}/`

  const clearTimers = () => {
    if (reconnectTimer) {
      clearTimeout(reconnectTimer)
      reconnectTimer = null
    }
    if (pingTimer) {
      clearInterval(pingTimer)
      pingTimer = null
    }
  }

  const scheduleReconnect = () => {
    if (closed) return
    clearTimers()
    reconnectTimer = setTimeout(connect, 2000)
  }

  const connect = () => {
    if (closed) return
    try {
      ws = new WebSocket(wsUrl())
    } catch {
      scheduleReconnect()
      return
    }

    ws.addEventListener('open', () => {
      pingTimer = setInterval(() => {
        if (ws && ws.readyState === WebSocket.OPEN) {
          try {
            ws.send(JSON.stringify({ broadcastPurpose: 'ping', broadcastData: Date.now() }))
          } catch {
            /* ignore */
          }
        }
      }, 3000)
    })

    ws.addEventListener('message', (event) => {
      try {
        const parsed = JSON.parse(String(event.data)) as {
          broadcastPurpose?: string
          broadcastData?: { name?: string; value?: string }
        }
        if (
          parsed.broadcastPurpose === 'varsChanged' &&
          parsed.broadcastData &&
          typeof parsed.broadcastData.name === 'string'
        ) {
          onVarChanged(parsed.broadcastData.name, String(parsed.broadcastData.value ?? ''))
        }
      } catch {
        /* ignore */
      }
    })

    ws.addEventListener('close', () => {
      clearTimers()
      scheduleReconnect()
    })

    ws.addEventListener('error', () => {
      try {
        ws?.close()
      } catch {
        /* ignore */
      }
    })
  }

  connect()

  return {
    close: () => {
      closed = true
      clearTimers()
      try {
        ws?.close()
      } catch {
        /* ignore */
      }
      ws = null
    },
  }
}
