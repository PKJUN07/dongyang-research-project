import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: '127.0.0.1',
    proxy: {
      '/api/ai': process.env.RESEARCH_AI_TARGET ?? process.env.RESEARCH_API_TARGET ?? 'http://127.0.0.1:8080',
      '/api': process.env.RESEARCH_API_TARGET ?? 'http://127.0.0.1:8080',
    },
  },
})
