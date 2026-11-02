import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const rootDir = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(rootDir, './src'),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/v1': { target: 'http://127.0.0.1:4675', changeOrigin: true },
      '/login': { target: 'http://127.0.0.1:4675', changeOrigin: true },
      '/logout': { target: 'http://127.0.0.1:4675', changeOrigin: true },
      '/downloads': { target: 'http://127.0.0.1:4675', changeOrigin: true },
      '/constructNodes.js': { target: 'http://127.0.0.1:4675', changeOrigin: true },
      '/css': { target: 'http://127.0.0.1:4675', changeOrigin: true },
      '/js': { target: 'http://127.0.0.1:4675', changeOrigin: true },
      '/vendor': { target: 'http://127.0.0.1:4675', changeOrigin: true },
      '/fonts': { target: 'http://127.0.0.1:4675', changeOrigin: true },
      '/favicon.png': { target: 'http://127.0.0.1:4675', changeOrigin: true },
      // LiteGraph paints this as the canvas background (see LGraphCanvas.DEFAULT_BACKGROUND_IMAGE).
      '/graph-background.png': { target: 'http://127.0.0.1:4675', changeOrigin: true },
      '/litegraph.js': { target: 'http://127.0.0.1:4675', changeOrigin: true },
      '/litegraph.css': { target: 'http://127.0.0.1:4675', changeOrigin: true },
      '/litegraph-editor.css': { target: 'http://127.0.0.1:4675', changeOrigin: true },
      '/createNode.js': { target: 'http://127.0.0.1:4675', changeOrigin: true },
      '/createnode.js': { target: 'http://127.0.0.1:4675', changeOrigin: true },
      '/aiProviders.js': { target: 'http://127.0.0.1:4675', changeOrigin: true },
      '/graphMigration.js': { target: 'http://127.0.0.1:4675', changeOrigin: true },
      '/subgraphEditor.js': { target: 'http://127.0.0.1:4675', changeOrigin: true },
      '/inset.browser.js': { target: 'http://127.0.0.1:4675', changeOrigin: true },
    },
  },
  build: {
    outDir: path.resolve(rootDir, '../frontend/dist'),
    emptyOutDir: true,
    sourcemap: true,
    // Android 9 kiosk WebViews are pinned at Chromium 74 (no updates via Play).
    // Chrome 80 is where ?. and ?? landed, so keep the syntax ceiling at ES2019
    // or the Panel page white-screens on those devices. Note public/ vendor and
    // island scripts bypass Vite entirely - lower them separately (see the
    // regeneration header in public/vendor/gridstack-all.js).
    target: 'es2019',
  },
})
