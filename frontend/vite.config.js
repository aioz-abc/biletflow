import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import process from 'node:process'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // The browser's Host is kept (no changeOrigin) so links the backend builds,
    // such as Campaign QR links, point at this server rather than the API container.
    proxy: {
      '/api': { target: process.env.BILETFLOW_API_TARGET || 'http://127.0.0.1:8000' },
      // Campaign QR links (/c/<token>) redirect through the backend; a regex so
      // that /checkout and other app routes starting with "c" stay in the SPA.
      '^/c/': { target: process.env.BILETFLOW_API_TARGET || 'http://127.0.0.1:8000' },
    },
  },
})
