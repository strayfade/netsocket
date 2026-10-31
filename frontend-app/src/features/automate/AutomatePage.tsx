import { useEffect } from 'react'
import { Undo2, Redo2, Maximize2, Terminal } from 'lucide-react'
import { loadScriptsSequential, loadStylesheet } from '@/lib/loadScript'
import { Button } from '@/components/ui/button'
import { ButtonGroup } from '@/components/ui/button-group'
import { Kbd } from '@/components/ui/kbd'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

declare global {
  interface Window {
    startNetsocketEditor?: () => void
    stopNetsocketEditor?: () => void
    NetsocketSubgraphs?: { init: (api: unknown) => void }
    __netsocketEditorApi?: {
      loadGraph?: () => void
      getCanvas?: () => {
        title_text_font?: string
        inner_text_font?: string
        setDirty?: (foreground?: boolean, background?: boolean) => void
      }
    }
    __netsocketForceCanvasResize?: () => void
  }
}

export function AutomatePage() {
  useEffect(() => {
    let cancelled = false
    const body = document.body
    const previousClass = body.className
    // `litegraph` is the hook litegraph.css uses to scope the canvas island (context menus,
    // graph dialogs, search box). The legacy `litegraph-editor` page class is deliberately NOT
    // added: litegraph-editor.css is appended after the Tailwind bundle, so its
    // `.litegraph-editor button:hover { background-color: #999 }` (specificity 0,2,1) outranks the
    // bundle's `hover:bg-accent` (0,2,0) and leaks a near-white hover onto every shadcn <button>
    // in the shell once the class sits on <body> - sidebar Backup/Settings, the graph toolbar.
    // Anchored links are unaffected, which is why the sidebar looked inconsistent rather than wrong.
    // Nothing else in this repo reads that class; it styled the standalone editor's own
    // header/tools/loadmeter DOM, which this SPA replaces with its React toolbar.
    body.classList.add('litegraph', 'shell-page', 'has-sidebar')
    body.style.overflow = 'hidden'

    void (async () => {
      loadStylesheet('/litegraph.css')
      loadStylesheet('/litegraph-editor.css')
      loadStylesheet('/css/editor.css')

      try {
        await loadScriptsSequential([
          '/inset.browser.js',
          '/litegraph.js',
          '/graphMigration.js',
          '/aiProviders.js',
          '/createNode.js',
          '/constructNodes.js',
          '/subgraphEditor.js',
          '/js/editorBootstrap.js',
        ])
      } catch (err) {
        console.error('Automate scripts failed to load', err)
        return
      }
      if (cancelled) return

      window.startNetsocketEditor?.()

      try {
        if (window.NetsocketSubgraphs && window.__netsocketEditorApi) {
          window.NetsocketSubgraphs.init(window.__netsocketEditorApi)
        } else {
          window.__netsocketEditorApi?.loadGraph?.()
        }
      } catch (err) {
        console.error('Automate init failed', err)
        window.__netsocketEditorApi?.loadGraph?.()
      }

      requestAnimationFrame(() => {
        window.__netsocketForceCanvasResize?.()
      })

      // LiteGraph paints node titles/subtext on the canvas with the 'Roboto' webfont
      // (see LGraphCanvas.title_text_font). If the first paint lands before that face
      // finishes downloading, the fallback glyphs stay baked into the canvas until the
      // next redraw, so load the fonts and force one redraw when they are ready.
      const canvas = window.__netsocketEditorApi?.getCanvas?.()
      if (canvas && typeof document.fonts?.load === 'function') {
        const fonts = [canvas.title_text_font, canvas.inner_text_font].filter(
          (font): font is string => typeof font === 'string' && font.length > 0,
        )
        void Promise.allSettled(fonts.map((font) => document.fonts.load(font))).then(() => {
          if (!cancelled) canvas.setDirty?.(true, true)
        })
      }
    })()

    return () => {
      cancelled = true
      window.stopNetsocketEditor?.()
      body.className = previousClass
      body.style.overflow = ''
    }
  }, [])

  return (
    <div className="editor-stage relative h-full min-h-[100svh] w-full min-w-0 overflow-hidden bg-black">
      <div
        className="editor-floating-toolbar pointer-events-auto absolute right-3 top-3 z-20 flex items-center gap-1 rounded-[10px] border border-white/10 bg-black p-1.5 shadow-lg backdrop-blur"
        role="toolbar"
        aria-label="Graph tools"
      >
        <ButtonGroup>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button type="button" id="editor-undo" variant="secondary" size="icon" disabled title="Undo (Ctrl+Z)">
                <Undo2 className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              Undo <Kbd className="ml-1">⌘Z</Kbd>
            </TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                id="editor-redo"
                variant="secondary"
                size="icon"
                disabled
                title="Redo (Ctrl+Y or Ctrl+Shift+Z)"
              >
                <Redo2 className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              Redo <Kbd className="ml-1">⌘⇧Z</Kbd>
            </TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button type="button" id="editor-fit-view" variant="secondary" size="icon" title="Fit all nodes to view">
                <Maximize2 className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Fit view</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                id="editor-toggle-log"
                variant="secondary"
                size="icon"
                title="Show log"
                aria-pressed="false"
                aria-controls="log"
              >
                <Terminal className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Toggle log</TooltipContent>
          </Tooltip>
        </ButtonGroup>
      </div>

      <div id="editor-keybinds-bar" className="editor-keybinds-bar" hidden aria-hidden="true">
        <div className="editor-keybinds-inner" id="editor-keybinds-inner" />
      </div>
      <div className="connection-banner" />
      <canvas id="nodegraph" />
      <textarea id="log" spellCheck={false} readOnly tabIndex={-1} aria-label="Server log" hidden />
    </div>
  )
}
