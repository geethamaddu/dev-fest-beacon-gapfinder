import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: './',
  server: {
    port: 5173,
    // usePolling: the default file watcher missed edits on this Windows machine (D: drive),
    // so the dev server kept serving old code. Polling checks files on an interval instead.
    watch: { usePolling: true, interval: 300 },
    // Chatbot requests go to the chat server (npm run server).
    proxy: { '/api': 'http://127.0.0.1:8787' },
  },
})
