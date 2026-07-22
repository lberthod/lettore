import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    vue(),
    // Mode hors-ligne : tous les textes et l'app sont mis en cache localement
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg'],
      manifest: {
        name: 'Leggendo',
        short_name: 'Leggendo',
        description:
          'Lecture de textes en italien avec traduction des mots et des phrases.',
        lang: 'fr',
        display: 'standalone',
        theme_color: '#faf6f0',
        background_color: '#faf6f0',
        icons: [
          {
            src: '/favicon.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'any',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg}'],
        navigateFallback: '/index.html',
      },
    }),
  ],
  server: {
    port: Number(process.env.PORT) || 5173,
  },
})
