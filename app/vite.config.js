import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: './',
  // usePolling: the default file watcher missed edits on this Windows machine (D: drive),
  // so the dev server kept serving old code. Polling checks files on an interval instead.
  server: { port: 5173, watch: { usePolling: true, interval: 300 } },
})
