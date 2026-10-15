/// <reference types="vitest" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'
import { validateMainAppOrigin } from './src/utils/originValidation.js'

function mainOriginGuard() {
  return {
    name: 'main-origin-guard',
    configResolved(config) {
      if (config.command !== 'build') return
      const origin = config.env.VITE_MAIN_APP_ORIGIN || ''
      const problems = validateMainAppOrigin(origin)
      if (problems.length > 0) {
        throw new Error(
          'Build aborted: VITE_MAIN_APP_ORIGIN is not safe for production.\n  ' +
            problems.join('\n  ')
        )
      }
    },
  }
}

export default defineConfig({
  plugins: [react(), mainOriginGuard()],
  resolve: {
    alias: {
      '@legal': path.resolve(__dirname, '../shared/legal'),
    },
  },
  server: {
    port: 5180,
    proxy: {
      '/api': {
        target: process.env.VITE_API_PROXY_TARGET || 'http://localhost:8080',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: '../dist-auth',
    emptyOutDir: true,
  },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.{js,jsx}'],
  },
})
