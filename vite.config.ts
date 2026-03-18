import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'node:path'

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        attendee: resolve(__dirname, 'attendee.html'),
      },
    },
  },
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:4077',
        changeOrigin: true,
      },
      '/attendee/claim': {
        target: 'http://localhost:4077',
        changeOrigin: true,
      },
    },
  },
})
