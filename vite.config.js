import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const API = process.env.VITE_API_TARGET || 'http://localhost:5055'

export default defineConfig({
  plugins: [react()],
  server: {
    // `--host` exposes the dev server on the LAN so a phone can open it too.
    proxy: {
      '/api': {
        target: API,
        changeOrigin: true,
      },
      '/health': { target: API, changeOrigin: true },
    },
  },
})
