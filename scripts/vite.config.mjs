/**
 * Config Vite CANONICA (dev/build/preview). In `scripts/` per evitare `.timestamp-*` in root (EPERM).
 */
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { readFileSync, existsSync, renameSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, '..');
const pkg = JSON.parse(readFileSync(join(projectRoot, 'package.json'), 'utf-8'));

export default defineConfig(({ command }) => {
  const isDev = command === 'serve';
  const cacheVersionLabel =
    command === 'build' ? `${pkg.version}-light+${Date.now()}` : `${pkg.version}-light`;

  return {
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __CACHE_BUST__: JSON.stringify(`v${cacheVersionLabel}`),
    'window.__APP_CACHE_VERSION__': JSON.stringify(cacheVersionLabel),
  },
  plugins: [
    {
      name: 'app-version-dev',
      apply: 'serve',
      configureServer(server) {
        const swCleanupHtml = `<!DOCTYPE html><html><body><script>
(async function(){
  try {
    if(navigator.serviceWorker){
      var regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map(function(r){return r.unregister();}));
    }
    if(window.caches){
      var keys = await caches.keys();
      await Promise.all(keys.map(function(k){return caches.delete(k);}));
    }
  }catch(e){}
  window.location.href = '/?nocache=1';
})();
<\/script><p>Pulizia cache e Service Worker in corso...</p></body></html>`;
        const body = cacheVersionLabel;
        server.middlewares.use((req, res, next) => {
          const p = (req.url || '').split('?')[0];
          if (p === '/app-version.txt' || p === '/app-version.txt/') {
            res.statusCode = 200;
            res.setHeader('Content-Type', 'text/plain; charset=utf-8');
            res.setHeader('Cache-Control', 'no-store, max-age=0');
            res.end(body);
            return;
          }
          if (p === '/svuota-cache') {
            res.statusCode = 200;
            res.setHeader('Content-Type', 'text/html; charset=utf-8');
            res.setHeader('Cache-Control', 'no-store, max-age=0');
            res.end(swCleanupHtml);
            return;
          }
          next();
        });
      },
    },
    react(),
    {
      name: 'inject-version-meta',
      transformIndexHtml(html) {
        return html
          .replace(
            '<meta name="app-version" content="__APP_VERSION__" />',
            `<meta name="app-version" content="${pkg.version}" />`
          )
          .replaceAll('__INJECTED_CACHE_VERSION__', cacheVersionLabel);
      },
    },
    {
      name: 'emit-app-version',
      apply: 'build',
      generateBundle() {
        this.emitFile({
          type: 'asset',
          fileName: 'app-version.txt',
          source: cacheVersionLabel,
        });
      },
    },
    {
      name: 'vite-plugin-rename-index',
      apply: 'build',
      closeBundle() {
        const distIndex = join(projectRoot, 'dist', 'index.html');
        const distApp = join(projectRoot, 'dist', 'app.html');
        if (existsSync(distIndex)) {
          renameSync(distIndex, distApp);
        }
      },
    },
    VitePWA({
      devOptions: {
        enabled: !isDev,
        type: 'classic',
      },
      registerType: 'autoUpdate',
      includeAssets: [
        'favicon.ico',
        'apple-touch-icon.png',
        'og-image.png',
        'icon-192.png',
        'icon-512.png',
        'icon-1024.png',
        'flow-app-icon.png',
        'icons/icon-16.png',
        'icons/icon-32.png',
        'icons/icon-48.png',
        'icons/icon-72.png',
        'icons/icon-96.png',
        'icons/icon-128.png',
        'icons/icon-144.png',
        'icons/icon-152.png',
        'icons/icon-167.png',
        'icons/icon-180.png',
        'icons/icon-192.png',
        'icons/icon-384.png',
        'icons/icon-512.png',
        'icons/icon-1024.png',
      ],
      manifest: {
        name: 'Work in Motion',
        short_name: 'Work in Motion',
        description: 'FLOW — Work in Motion. Gestione turni e presenze.',
        start_url: '/profilo',
        lang: 'it',
        display: 'standalone',
        background_color: '#0a0a0c',
        theme_color: '#0a0a0c',
        orientation: 'portrait',
        scope: '/',
        icons: [
          { src: '/icons/icon-48.png', sizes: '48x48', type: 'image/png' },
          { src: '/icons/icon-72.png', sizes: '72x72', type: 'image/png' },
          { src: '/icons/icon-96.png', sizes: '96x96', type: 'image/png' },
          { src: '/icons/icon-128.png', sizes: '128x128', type: 'image/png' },
          { src: '/icons/icon-144.png', sizes: '144x144', type: 'image/png' },
          { src: '/icons/icon-152.png', sizes: '152x152', type: 'image/png' },
          { src: '/icons/icon-167.png', sizes: '167x167', type: 'image/png' },
          { src: '/icons/icon-180.png', sizes: '180x180', type: 'image/png' },
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
          { src: '/icons/icon-384.png', sizes: '384x384', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          { src: '/icons/icon-1024.png', sizes: '1024x1024', type: 'image/png' },
        ],
        shortcuts: [
          { name: 'Timbratura', short_name: 'Timbratura', url: '/timbratura', description: 'Terminale timbrature' },
          { name: 'Area profili', short_name: 'Profili', url: '/profilo', description: 'Login staff e manager' },
        ],
      },
      workbox: {
        skipWaiting: true,
        clientsClaim: true,
        cleanupOutdatedCaches: true,
        importScripts: ['pwa-background-sync.js', 'pwa-push-notifications.js'],
        globPatterns: ['**/*.{ico,png,svg,webmanifest}', 'app.html'],
        navigateFallback: 'app.html',
        navigateFallbackDenylist: [
          /^\/rest\//,
          /^\/auth\//,
          /^\/storage\//,
          /^\/realtime\//,
          /^\/assets\//,
          /^\/i\//,
        ],
        runtimeCaching: [
          {
            urlPattern: /\/api\/punch/,
            handler: 'NetworkOnly',
            options: {
              backgroundSync: { name: 'punch-queue', options: { maxRetentionTime: 24 * 60 } },
            },
          },
          {
            urlPattern: /\/app-version\.txt(?:\?.*)?$/i,
            handler: 'NetworkOnly',
            method: 'GET',
          },
          {
            urlPattern: /\.(js|css)$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'app-chunks',
              expiration: { maxEntries: 60, maxAgeSeconds: 30 * 24 * 60 * 60 },
            },
          },
          {
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
    chunkSizeWarningLimit: 700,
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-react': ['react', 'react-dom', 'react-router-dom'],
          'vendor-framer': ['framer-motion'],
          'vendor-supabase': ['@supabase/supabase-js'],
          'vendor-pdf': ['jspdf'],
          'vendor-date': ['date-fns'],
          'vendor-icons': ['lucide-react'],
          'vendor-tesseract': ['tesseract.js'],
          'vendor-ai': ['@google/generative-ai'],
        },
      },
    },
  },
  optimizeDeps: {
    exclude: ['lucide-react'],
    /** Evita che esbuild scansioni file non necessari che causano errori */
    entries: ['src/**/*.{ts,tsx}', 'index.html'],
  },
  server: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: false,
  },
  };
});
