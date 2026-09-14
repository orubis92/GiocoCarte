import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// Percorso base del sito. In locale (npm run dev / Avvia.cmd) è "/";
// su GitHub Pages l'app vive in https://<utente>.github.io/<repo>/ e il
// workflow .github/workflows/deploy.yml imposta BASE_PATH="/<repo>/".
const base = process.env.BASE_PATH || '/';

export default defineConfig({
  base,
  server: { host: true },
  preview: { host: true },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'Duello di carte',
        short_name: 'Duello',
        description: 'Gioco di carte ispirato a Yu-Gi-Oh! con avversario automatico',
        theme_color: '#1a1030',
        background_color: '#0f0a1e',
        display: 'standalone',
        lang: 'it',
        orientation: 'any',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml' },
        ],
      },
      workbox: {
        // Le immagini delle carte vengono messe in cache al primo utilizzo.
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/images\.ygoprodeck\.com\/.*/i,
            handler: 'CacheFirst',
            options: { cacheName: 'card-images', expiration: { maxEntries: 2000, maxAgeSeconds: 60 * 60 * 24 * 90 } },
          },
        ],
      },
    }),
  ],
});
