/// <reference types="vitest" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@legal': path.resolve(__dirname, '../shared/legal'),
    },
  },
  server: {
    proxy: {
      '/api': 'http://localhost:8080',
      '/uploads': 'http://localhost:8080',
    },
    port: 5173,
  },
  build: {
    outDir: 'dist'
  },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.{js,jsx}'],
    exclude: ['e2e/**', 'node_modules/**'],
  },
})
