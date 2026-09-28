// Fullscreen custom typography for the G2 via the image path.
//
// Text containers render one fixed firmware font (no size/bold API), so
// styled type goes through image containers: draw text to a <canvas> with
// normal CSS font control, encode PNG, push with
// bridge.updateImageRawData. The SDK decodes + converts to 4-bit
// greyscale internally.
//
// One image container tops out at 288x144, so a fullscreen 576x288 frame
// is a 2x2 tile grid (4 image containers = the hardware max). Only dirty
// tiles are pushed — a tap typically dirties 2 of 4.
//
// Result codes to watch: imageSizeInvalid (tile over 288x144),
// imageToGray4Failed (conversion failed), sendFailed.

export interface FrameState {
  count: number
  /** 0-4, mirrors the textColor brightness levels */
  brightness: number
}

// Full glasses canvas. 1x backing store on purpose: a fullscreen PNG
// already carries ~8x the bytes of a 200x100 frame, and 2x would
// quadruple BLE time per push for little gain at these glyph sizes.
export const FRAME_W = 576
export const FRAME_H = 288

export const TILE_W = 288
export const TILE_H = 144

export interface TileDef {
  id: number
  name: string
  x: number
  y: number
}

export const TILES: TileDef[] = [
  { id: 2, name: 'tile-tl', x: 0, y: 0 },
  { id: 3, name: 'tile-tr', x: 288, y: 0 },
  { id: 4, name: 'tile-bl', x: 0, y: 144 },
  { id: 5, name: 'tile-br', x: 288, y: 144 },
]

const FG_LEVELS = ['#2e2e2e', '#5c5c5c', '#8a8a8a', '#bdbdbd', '#ffffff']
const MID_GRAY = '#8a8a8a'
const DIM_GRAY = '#5c5c5c'

export function drawFrame(canvas: HTMLCanvasElement, state: FrameState): void {
  canvas.width = FRAME_W
  canvas.height = FRAME_H
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('2d canvas context unavailable')

  const fg = FG_LEVELS[Math.max(0, Math.min(4, state.brightness))]

  ctx.fillStyle = '#000000'
  ctx.fillRect(0, 0, FRAME_W, FRAME_H)
  ctx.textAlign = 'center'

  // Eyebrow — small, letterspaced
  ctx.fillStyle = DIM_GRAY
  ctx.font = '600 26px system-ui, sans-serif'
  ;(ctx as CanvasRenderingContext2D & { letterSpacing?: string }).letterSpacing = '8px'
  ctx.fillText('G2 EXAMPLE', FRAME_W / 2, 54)
  ;(ctx as CanvasRenderingContext2D & { letterSpacing?: string }).letterSpacing = '0px'

  // Hero — big bold counter
  ctx.fillStyle = fg
  ctx.font = '800 150px system-ui, sans-serif'
  ctx.fillText(String(state.count), FRAME_W / 2, 218)

  // Footer — small hint line
  ctx.fillStyle = MID_GRAY
  ctx.font = '500 22px system-ui, sans-serif'
  ctx.fillText(`TAP +1 · SWIPE BRT ${state.brightness} · 2xTAP EXIT`, FRAME_W / 2, 264)

  // 1px border — fillRect strips (not strokeRect) so the pixel grid stays
  // crisp. Fixed white: the frame stays visible even at BRT 0, when the
  // hero dims to near-invisible. Drawn last; drawn first it would still
  // win (nothing reaches the edge) but last is explicit.
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, FRAME_W, 1) // top
  ctx.fillRect(0, FRAME_H - 1, FRAME_W, 1) // bottom
  ctx.fillRect(0, 0, 1, FRAME_H) // left
  ctx.fillRect(FRAME_W - 1, 0, 1, FRAME_H) // right
}

/** Slice the fullscreen frame into the 4 quadrant tile canvases. */
export function sliceTiles(source: HTMLCanvasElement): HTMLCanvasElement[] {
  return TILES.map((t) => {
    const c = document.createElement('canvas')
    c.width = TILE_W
    c.height = TILE_H
    const ctx = c.getContext('2d')
    if (!ctx) throw new Error('2d canvas context unavailable')
    ctx.drawImage(source, t.x, t.y, TILE_W, TILE_H, 0, 0, TILE_W, TILE_H)
    return c
  })
}

export async function canvasToPngBytes(canvas: HTMLCanvasElement): Promise<Uint8Array> {
  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob((b) => resolve(b), 'image/png')
  })
  if (!blob) throw new Error('canvas.toBlob failed')
  return new Uint8Array(await blob.arrayBuffer())
}

export function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false
  }
  return true
}
