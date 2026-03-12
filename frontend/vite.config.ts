import path from 'path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  plugins: [react()],
  server: {
    port: 3000,
    proxy: {
      '/api': { target: process.env.VITE_API_BASE ?? 'http://localhost:8000', changeOrigin: true },
      '/ws':  { target: (process.env.VITE_API_BASE ?? 'http://localhost:8000').replace(/^http/, 'ws'), ws: true },
    },
  },
})
