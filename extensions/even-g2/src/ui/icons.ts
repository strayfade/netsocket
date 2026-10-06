// Pixel-drawn status icons. Same technique as the header link mark in
// chrome.ts: '#' cells become integer-scaled fillRects (never drawImage) so
// every pixel stays on-grid through the quantize step. Default scale is 3
// (a 5px glyph renders 15px, a 7px glyph 21px).

/** Paint '#' cells of the art at integer pixels. */
export function paintIcon(
  ctx: CanvasRenderingContext2D,
  rows: string[],
  x: number,
  y: number,
  scale = 3,
): void {
  const sx = Math.round(x)
  const sy = Math.round(y)
  for (let r = 0; r < rows.length; r++) {
    const row = rows[r]
    for (let c = 0; c < row.length; c++) {
      if (row[c] === '#') ctx.fillRect(sx + c * scale, sy + r * scale, scale, scale)
    }
  }
}

export const CLOCK: string[] = [
  '.#####.',
  '#..#..#',
  '#..#..#',
  '#..###.',
  '#.....#',
  '#.....#',
  '.#####.',
]

export const SUN: string[] = [
  '...#...',
  '#..#..#',
  '...#...',
  '..###..',
  '.#####.',
  '..###..',
  '#.....#',
]

export const CLOUD: string[] = [
  '...####..',
  '.########',
  '#########',
  '#########',
]

export const RAIN: string[] = [
  '...####..',
  '.########',
  '#########',
  '#########',
  '..#.#.#..',
  '..#.#.#..',
]

export const SNOW: string[] = [
  '...####..',
  '.########',
  '#########',
  '#########',
  '...#.#...',
  '..#.#.#..',
]

export const STORM: string[] = [
  '...####..',
  '.########',
  '#########',
  '####.....',
  '...##....',
  '...#.....',
]

export const CALENDAR: string[] = [
  '.#...#.',
  '#######',
  '#.....#',
  '#.....#',
  '#.###.#',
  '#.....#',
  '#######',
]

export const BELL: string[] = [
  '.###.',
  '#####',
  '#####',
  '.###.',
  '.###.',
  '.###.',
  '..#..',
]

export const BULB: string[] = [
  '.###.',
  '#####',
  '#####',
  '#####',
  '.###.',
  '.#.#.',
  '..#..',
]

export const SPARK: string[] = [
  '..#..',
  '.###.',
  '#####',
  '.###.',
  '..#..',
]

export const CHIP: string[] = [
  '..###..',
  '..###..',
  '#######',
  '##...##',
  '#######',
  '..###..',
  '..###..',
]

/** Same 5x5 netsocket mark as the header (for the LINK strip card). */
export const LINK: string[] = ['#####', '...##', '..#.#', '#...#', '##..#']

/** Pick a weather glyph from an Open-Meteo weather code. */
export function weatherIcon(code: number): string[] {
  if (code === 0 || code === 1) return SUN
  if (code >= 51 && code <= 67) return RAIN
  if (code >= 80 && code <= 82) return RAIN
  if (code >= 71 && code <= 77) return SNOW
  if (code === 85 || code === 86) return SNOW
  if (code >= 95 && code <= 99) return STORM
  return CLOUD
}

// --- Material Icons (Status page) --------------------------------------
// Filled variant, 400 weight, bundled in public/fonts/MaterialIcons-Regular.ttf
// and loaded in ui/font.ts. Glyphs are selected by ligature name — every name
// referenced here was verified against the font's GSUB table, so canvas
// fillText renders the icon (not tofu) wherever the face is loaded.

/** Material ligature for an Open-Meteo weather code (mirrors weatherIcon). */
export function statusWeatherLigature(code: number): string {
  if (code === 0 || code === 1) return 'sunny'
  if (code >= 51 && code <= 67) return 'water_drop'
  if (code >= 80 && code <= 82) return 'water_drop'
  if (code >= 71 && code <= 77) return 'ac_unit'
  if (code === 85 || code === 86) return 'ac_unit'
  if (code >= 95 && code <= 99) return 'bolt'
  return 'cloud'
}

/**
 * Paint one Material Icons glyph by ligature name. Vertical placement uses
 * textBaseline 'middle' around centerY so it never depends on the glyph's
 * own metrics; font/align/baseline are restored afterwards (callers share
 * this context with the pixel font). fillStyle is left alone.
 */
export function paintMaterialIcon(
  ctx: CanvasRenderingContext2D,
  name: string,
  x: number,
  centerY: number,
  size = 24,
): void {
  const prevFont = ctx.font
  const prevAlign = ctx.textAlign
  const prevBaseline = ctx.textBaseline
  ctx.font = `400 ${size}px MaterialIcons, sans-serif`
  ctx.textAlign = 'left'
  ctx.textBaseline = 'middle'
  ctx.fillText(name, Math.round(x), Math.round(centerY))
  ctx.font = prevFont
  ctx.textAlign = prevAlign
  ctx.textBaseline = prevBaseline
}
