const cache = new Map<string, Promise<void>>()

export function loadScript(src: string): Promise<void> {
  const hit = cache.get(src)
  if (hit) return hit

  const promise = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector(`script[data-ns-src="${src.replace(/"/g, '\\"')}"]`) as HTMLScriptElement | null
    if (existing?.dataset.loaded === '1') {
      resolve()
      return
    }

    const finish = () => {
      if (existing) existing.dataset.loaded = '1'
      resolve()
    }

    if (existing) {
      // Tag already present: either wait for load or treat as done if it already ran.
      existing.addEventListener('load', finish, { once: true })
      existing.addEventListener('error', () => reject(new Error(`Failed to load ${src}`)), { once: true })
      // If the load event already fired, readyState is complete on classic scripts.
      const ready = (existing as HTMLScriptElement & { readyState?: string }).readyState
      if (ready === 'complete' || ready === 'loaded') finish()
      else {
        // Last resort for browsers that omit readyState on dynamic scripts.
        window.setTimeout(finish, 0)
      }
      return
    }

    const script = document.createElement('script')
    script.src = src
    script.async = false
    script.dataset.nsSrc = src
    script.onload = () => {
      script.dataset.loaded = '1'
      resolve()
    }
    script.onerror = () => reject(new Error(`Failed to load ${src}`))
    document.body.appendChild(script)
  })

  cache.set(src, promise)
  return promise
}

export async function loadScriptsSequential(srcs: string[]) {
  for (const src of srcs) {
    await loadScript(src)
  }
}

export function loadStylesheet(href: string) {
  if (document.querySelector(`link[data-ns-href="${href.replace(/"/g, '\\"')}"]`)) return
  const link = document.createElement('link')
  link.rel = 'stylesheet'
  link.href = href
  link.dataset.nsHref = href
  document.head.appendChild(link)
}
