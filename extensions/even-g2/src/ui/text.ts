// Canvas text helpers for the 4-bit greyscale frame.

/** Word-wrap to lines fitting maxWidth. Call with the final font set. */
export function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(/\s+/).filter(Boolean)
  if (words.length === 0) return ['']
  const lines: string[] = []
  let line = ''
  for (const word of words) {
    // Hard-split words wider than the line (long tokens/URLs).
    let rest = word
    while (ctx.measureText(rest).width > maxWidth && rest.length > 1) {
      let cut = rest.length - 1
      while (cut > 1 && ctx.measureText(rest.slice(0, cut)).width > maxWidth) cut--
      if (line) {
        lines.push(line)
        line = ''
      }
      lines.push(rest.slice(0, cut))
      rest = rest.slice(cut)
    }
    const candidate = line ? `${line} ${rest}` : rest
    if (ctx.measureText(candidate).width <= maxWidth) {
      line = candidate
    } else {
      if (line) lines.push(line)
      line = rest
    }
  }
  if (line) lines.push(line)
  return lines.length > 0 ? lines : ['']
}

/** Single-line ellipsis truncation. Call with the final font set. */
export function ellipsis(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text
  // "..." not "…" (U+2026): the pixel font covers ASCII + NBSP only, so a
  // real ellipsis would fall back to another font and throw the pen off the
  // pixel grid for the glyph and everything after it.
  let out = text
  while (out.length > 1 && ctx.measureText(`${out}...`).width > maxWidth) {
    out = out.slice(0, -1)
  }
  return `${out}...`
}

export function formatTime(ts: number): string {
  const d = new Date(ts)
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  return `${hh}:${mm}`
}

/** 12-hour clock without AM/PM, e.g. "3:41". */
export function formatClock(ts: number): string {
  const d = new Date(ts)
  const h = d.getHours() % 12 || 12
  const mm = String(d.getMinutes()).padStart(2, '0')
  const period = d.getHours() >= 12 ? 'PM' : 'AM'
  return `${h}:${mm} ${period}`
}

let measureCtx: CanvasRenderingContext2D | null = null

function getMeasureCtx(): CanvasRenderingContext2D {
  if (!measureCtx) {
    const c = document.createElement('canvas')
    const ctx = c.getContext('2d')
    if (!ctx) throw new Error('2d canvas context unavailable')
    measureCtx = ctx
  }
  return measureCtx
}

/** Wrap + chunk into pages without needing the live frame context. */
export function paginate(text: string, font: string, maxWidth: number, perPage: number): string[][] {
  const ctx = getMeasureCtx()
  ctx.font = font
  const lines = wrapText(ctx, text, maxWidth)
  const pages: string[][] = []
  for (let i = 0; i < lines.length; i += perPage) {
    pages.push(lines.slice(i, i + perPage))
  }
  return pages.length > 0 ? pages : [['']]
}

const GEIST = 'sfPixel'

// sfPixel is drawn on a 3-units-per-pixel grid (unitsPerEm 92, all outline
// coords + advances are multiples of 3, hhea ascent 54 / descent -15).
// The current face uses 2px letter tracking (glyph advances are the 1px
// face + 3 units). Space was additionally widened 2x in-file (hmtx 6 -> 12
// units = 4px). All advances remain multiples of 3, so the grid holds — any
// future advance edit must keep advances divisible by 3.
// A CSS size of 92/3 px (= 30.666…px = exactly 23pt @ 96 DPI) maps 3 design
// units onto 1 canvas pixel, so every glyph point lands on an integer pixel:
// the hhea line box is then EXACTLY 23 canvas px tall (18px ascent + 5px
// descent), ink (caps-to-descender) 21px. A literal `23px` font-size would
// give a 17.25px line box and fractional pixels — blurry, not pixel-perfect.
// Forcing ink to 23px (33.587px font-size) would likewise be a non-integer
// scale (2.739 units/px) and blur. So every text style uses this one size.
export const FONT_PX = 92 / 3
/** hhea line box height at FONT_PX: exactly 23 canvas pixels. */
export const LINE_PX = 23
/** Ascent (baseline → line-box top) at FONT_PX: 54/3 = 18px. */
export const ASCENT_PX = 18
/** Descent (baseline → line-box bottom) at FONT_PX: 15/3 = 5px. */
export const DESCENT_PX = 5
/** Body rhythm: one 23px line box + 3px gap, keeps baselines on integers. */
export const LINE_STEP = 26

const PIXEL_FONT = `400 ${FONT_PX}px ${GEIST}`

export const BODY_FONT = PIXEL_FONT
export const SMALL_FONT = PIXEL_FONT
export const STRONG_FONT = PIXEL_FONT
export const DETAIL_FONT = PIXEL_FONT
export const TAB_FONT_ACTIVE = PIXEL_FONT
export const TAB_FONT_IDLE = PIXEL_FONT
export const ASKING_FONT = PIXEL_FONT

/** Round a canvas coordinate to the nearest device pixel. */
export function snap(v: number): number {
  return Math.round(v)
}

/** Fill text with the baseline snapped to whole pixels. */
export function pixelText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number): void {
  ctx.fillText(text, Math.round(x), Math.round(y))
}

/**
 * Centered text with the pen snapped to whole pixels. Rounding the anchor
 * is NOT enough with textAlign=center: the pen starts at anchor - width/2
 * and the measured width is fractional at 92/3px, so the whole string lands
 * half-off-grid. Measure with the final font set, snap the pen, draw left.
 */
export function pixelTextCenter(
  ctx: CanvasRenderingContext2D,
  text: string,
  cx: number,
  y: number,
): void {
  const w = ctx.measureText(text).width
  const prev = ctx.textAlign
  ctx.textAlign = 'left'
  ctx.fillText(text, Math.round(cx - w / 2), Math.round(y))
  ctx.textAlign = prev
}

/** Right-aligned text with the pen snapped to whole pixels (same reason). */
export function pixelTextRight(
  ctx: CanvasRenderingContext2D,
  text: string,
  rx: number,
  y: number,
): void {
  const w = ctx.measureText(text).width
  const prev = ctx.textAlign
  ctx.textAlign = 'left'
  ctx.fillText(text, Math.round(rx - w), Math.round(y))
  ctx.textAlign = prev
}