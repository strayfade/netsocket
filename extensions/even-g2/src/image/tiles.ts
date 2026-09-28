// Fullscreen delivery: one image container tops out at 288x144, so the
// 576x288 frame is a 2x2 tile grid (4 image containers = the hardware
// max). Only dirty tiles are pushed — a tab switch typically dirties
// all 4, a focus move dirties 2.
//
// Result codes to watch: imageSizeInvalid (tile over 288x144),
// imageToGray4Failed (conversion failed), sendFailed.

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

/**
 * Quantize the frame in place to the display's 16 greyscale levels.
 * `blackPoint` (0-100, % of full brightness) crushes everything at/below
 * it to black; the rest maps linearly across levels 1-15. Our own mapping
 * beats the firmware's grey conversion: antialiased text edges land on
 * intermediate greens instead of melting to white and bloating glyphs.
 */
export function quantizeFrame(canvas: HTMLCanvasElement, blackPoint: number): void {
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  const bp = (Math.max(0, Math.min(100, blackPoint)) / 100) * 255
  const span = 255 - bp
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height)
  const d = img.data
  for (let i = 0; i < d.length; i += 4) {
    const lum = (d[i] + d[i + 1] + d[i + 2]) / 3
    let v: number
    if (lum <= bp || span <= 0) {
      v = 0
    } else {
      v = (Math.round(((lum - bp) / span) * 15) / 15) * 255
    }
    d[i] = v
    d[i + 1] = v
    d[i + 2] = v
    d[i + 3] = 255
  }
  ctx.putImageData(img, 0, 0)
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
