// Geist (variable, wght 100-900) for the browser mirror DOM, served from
// public/fonts (vendored from the `geist` npm package — its exports map
// only exposes Next.js font-loader modules, not raw files). The glasses
// themselves render the firmware's LVGL font; this is mirror-only.

export async function loadFonts(): Promise<void> {
  try {
    const face = new FontFace('Geist', `url(${import.meta.env.BASE_URL}fonts/Geist-Variable.woff2)`, {
      weight: '100 900',
    })
    const loaded = await face.load()
    document.fonts.add(loaded)
  } catch {
    // Fall back to system-ui (canvas font strings already list it).
  }
}
