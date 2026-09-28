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
  let out = text
  while (out.length > 1 && ctx.measureText(`${out}…`).width > maxWidth) {
    out = out.slice(0, -1)
  }
  return `${out}…`
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

const GEIST = 'Geist, system-ui, sans-serif'

export const BODY_FONT = `500 17px ${GEIST}`
export const SMALL_FONT = `500 14px ${GEIST}`
export const STRONG_FONT = `500 17px ${GEIST}`
export const DETAIL_FONT = `500 18px ${GEIST}`
export const TAB_FONT_ACTIVE = `500 15px ${GEIST}`
export const TAB_FONT_IDLE = `500 15px ${GEIST}`
export const ASKING_FONT = `500 20px ${GEIST}`


