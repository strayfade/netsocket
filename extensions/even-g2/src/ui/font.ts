// Pixel font (sfPixel) for canvas + mirror DOM, served from public/fonts
// Loaded via FontFace so the 2d frame context and CSS share one source.

export async function loadFonts(): Promise<void> {
  try {
    const faces = [
      new FontFace('sfPixel', `url(${import.meta.env.BASE_URL}fonts/sfPixel.ttf)`, {
        weight: '400',
      }),
      // Material Icons (filled, 400) for the Status page glyphs. Bundled
      // locally — the glasses WebView can't reach Google Fonts at runtime
      // (empty network whitelist), so no CDN <link> would survive sideload.
      new FontFace('MaterialIcons', `url(${import.meta.env.BASE_URL}fonts/MaterialIcons-Regular.ttf)`, {
        weight: '400',
      }),
    ]
    await Promise.all(
      faces.map(async (face) => {
        const loaded = await face.load()
        document.fonts.add(loaded)
      }),
    )
    // Block the first frame on the pixel size so canvas measurement and
    // rasterization both use sfPixel (not a fallback) at 92/3 px. Also
    // block on one Material ligature so Status icons never paint as tofu.
    try {
      await Promise.all([
        document.fonts.load(`400 ${92 / 3}px sfPixel`),
        document.fonts.load('400 24px MaterialIcons', 'sunny'),
      ])
    } catch {
      // older WebViews may reject fractional sizes — the face is added
      // anyway, worst case the first frame falls back and the re-render
      // after loadFonts() picks it up.
    }
  } catch {
    // Fall back to system-ui (canvas font strings already list it).
  }
}
