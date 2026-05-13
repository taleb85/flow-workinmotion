/**
 * Config Vite canonica (dev/build/preview). In `scripts/` per evitare file `.timestamp-*`
 * nella root che in alcuni ambienti danno EPERM. `package.json` punta qui con `--config`.
 */
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, '..');
const pkg = JSON.parse(readFileSync(join(projectRoot, 'package.json'), 'utf-8'));

// https://vitejs.dev/config/
export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'icon-192.png', 'icon-512.png', 'icon.svg', 'logo-ob.svg', 'pwa-splash.svg'],
      manifest: {
        name: 'Osteria Basilico',
        short_name: 'Osteria Basilico',
        description: 'Sistema di gestione turni per Osteria Basilico',
        start_url: '/',
        lang: 'it',
        // standalone = nessuna barra del browser (kiosk tablet + telefono staff)
        display: 'standalone',
        // Splash: bianco (allineato a index.html); barra sistema = theme verde basilico
        background_color: '#FFFFFF',
        theme_color: '#2D5A27',
        // any = supporta portrait (telefono) e landscape (tablet kiosk)
        orientation: 'any',
        scope: '/',
        icons: [
          { src: '/logo-ob.svg', sizes: '512x512', type: 'image/svg+xml', purpose: 'any' },
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          { src: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png', purpose: 'any' },
        ],
        // Scorciatoie launcher: URL separati timbratura vs profili
        shortcuts: [
          {
            name: 'Timbratura',
            short_name: 'Timbratura',
            url: '/timbratura',
            description: 'Terminale timbrature (solo entrata/uscita)',
          },
          {
            name: 'Area profili',
            short_name: 'Profili',
            url: '/profilo',
            description: 'Login staff e manager',
          },
        ],
      },
      workbox: {
        /** Background Sync: evento `sync` → postMessage alle finestre (`src/utils/backgroundSync.ts`). */
        importScripts: ['pwa-background-sync.js'],
        // Precache: icone/manifest + index.html (obbligatorio se navigateFallback punta a index.html,
        // altrimenti Workbox lancia non-precached-url). NO js/css: evita cache stale sui chunk.
        globPatterns: ['**/*.{ico,png,svg,webmanifest}', 'index.html'],
        globIgnores: ['**/*.js', '**/*.css'],

        // SPA fallback: tutte le rotte tornano a index.html
        navigateFallback: 'index.html',
        navigateFallbackDenylist: [
          /^\/rest\//,
          /^\/auth\//,
          /^\/storage\//,
          /^\/realtime\//,
          /^\/assets\//,
        ],

        /**
         * Non usare NetworkFirst su `mode: navigate`: offline la richiesta documento per `/profilo` (ecc.)
         * non ha voce in cache dedicata → fallimento prima del navigateFallback → ERR_INTERNET_DISCONNECTED.
         * Il fallback SPA (index.html precachato) gestisce tutte le rotte; aggiornamenti shell = nuovo SW.
         */
        runtimeCaching: [
          {
            // Google Fonts → CacheFirst: raramente cambiano
            urlPattern: /^https:\/\/fonts\.(?:gstatic|googleapis)\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts',
              expiration: { maxEntries: 4, maxAgeSeconds: 365 * 24 * 60 * 60 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-react': ['react', 'react-dom'],
          'vendor-framer': ['framer-motion'],
          'vendor-supabase': ['@supabase/supabase-js'],
        },
      },
    },
  },
  optimizeDeps: {
    exclude: ['lucide-react'],
  },
  server: {
    // `true` = ascolta su tutte le interfacce: anteprima Cursor / Simple Browser e tunnel porte funzionano meglio che con solo 127.0.0.1
    host: true,
    port: 5173,
    strictPort: false,
  },
});
