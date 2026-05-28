import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'apple-touch-icon.png'],
      manifest: {
        name: 'Virtual Queue',
        short_name: 'VQueue',
        description: 'Virtual Queue Management System',
        theme_color: '#2563eb',
        background_color: '#ffffff',
        display: 'standalone',
        orientation: 'portrait',
        icons: [
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png'
          }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg}']
      }
    })
  ],
  server: {
    host: '0.0.0.0',  // Listen on all network interfaces (allows access via local IP)
    port: 3000,
    allowedHosts: ['.trycloudflare.com'],  // Allow cloudflared tunnel hosts
    proxy: {
      '/api': {
        target: process.env.API_PROXY_TARGET || 'http://localhost:8000',
        changeOrigin: true
      },
      '/auth': {
        target: process.env.API_PROXY_TARGET || 'http://localhost:8000',
        changeOrigin: true
      },
      '/ws': {
        target: process.env.API_PROXY_TARGET || 'http://localhost:8000',
        ws: true,
        changeOrigin: true
      }
    }
  }
})

