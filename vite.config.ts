import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'
import { VitePWA } from 'vite-plugin-pwa'

// GitHub Pages serves a project site from https://<user>.github.io/<repo>/.
// The deploy workflow sets VITE_BASE to "/<repo>/" automatically. If you build
// by hand for Pages, run:  VITE_BASE=/your-repo-name/ npm run build
const base = process.env.VITE_BASE ?? '/rook/'

// https://vite.dev/config/
export default defineConfig({
  base,
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.png', 'apple-touch-icon.png'],
      manifest: {
        name: 'Rook Scorekeeper',
        short_name: 'Rook',
        description: 'Live family scorekeeping for the card game Rook',
        theme_color: '#1b3a5c',
        background_color: '#0f1c2b',
        display: 'standalone',
        orientation: 'portrait',
        icons: [
          { src: 'pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico}'],
        // Firestore talks over its own channel; never let the service worker cache it.
        navigateFallbackDenylist: [/^\/__/],
      },
    }),
  ],
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
