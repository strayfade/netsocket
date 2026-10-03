// Geist (variable, wght 100-900) for canvas + mirror DOM, served from
// public/fonts (vendored from the `geist` npm package — its exports map
// only exposes Next.js font-loader modules, not raw files). Loaded via
// FontFace so the 2d frame context and CSS share one source.

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
