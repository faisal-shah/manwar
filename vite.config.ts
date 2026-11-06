/// <reference types="vitest/config" />
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { defineConfig, searchForWorkspaceRoot } from 'vite';
import preact from '@preact/preset-vite';
import { VitePWA } from 'vite-plugin-pwa';
import { APP_TITLE, NAME_AR } from './src/ui/brand';

/**
 * The prayer media's cache, named by its content (public/prayer): media cached for good by name
 * (CacheFirst) is fetched again when any of it changes, and the wall drops the old cache
 * (warmMedia in prayer/store.ts).
 */
const PRAYER_MEDIA_CACHE = (() => {
  const files = (dir: string): string[] =>
    readdirSync(dir)
      .sort()
      .flatMap((f) => (statSync(join(dir, f)).isDirectory() ? files(join(dir, f)) : [join(dir, f)]));
  const h = createHash('sha256');
  for (const f of files('public/prayer')) h.update(f).update(readFileSync(f));
  return `prayer-media-${h.digest('hex').slice(0, 12)}`;
})();

export default defineConfig({
  define: { 'import.meta.env.VITE_PRAYER_MEDIA_CACHE': JSON.stringify(PRAYER_MEDIA_CACHE) },
  // Git worktrees symlink node_modules from the main checkout; let the dev
  // server read through the link (fonts), or it answers 403.
  server: { fs: { allow: [searchForWorkspaceRoot(process.cwd()), realpathSync('node_modules')] } },
  plugins: [
    preact(),
    // The tab title comes from the one brand definition.
    { name: 'app-title', transformIndexHtml: (html: string) => html.replace('%APP_TITLE%', APP_TITLE) },
    VitePWA({
      registerType: 'prompt',
      injectRegister: false,
      includeAssets: ['favicon-64.png', 'icon-192.png'],
      manifest: {
        name: APP_TITLE,
        short_name: NAME_AR,
        description: 'Family wall calendar, tasks, rewards, lists and meals',
        // The wall runs in Fully Kiosk (which ignores the manifest); an installed phone is a portrait app.
        display: 'standalone',
        background_color: '#dce8f3',
        theme_color: '#dce8f3',
        start_url: '/',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,woff2,svg,png}'],
        // The prayer clock's photos, recordings and calligraphy (public/prayer, about 30 MB) are not
        // precached: a phone never shows them. The wall caches each one as it is used and fetches the
        // rest in the background (warmMedia in prayer/store.ts), so the athan plays through a Wi-Fi drop.
        // Cached by name, in a cache named by the media's content (PRAYER_MEDIA_CACHE).
        globIgnores: ['prayer/**'],
        runtimeCaching: [
          {
            urlPattern: /\/prayer\/[^/]+\/index\.json$/,
            handler: 'NetworkFirst',
            options: { cacheName: 'prayer-index', networkTimeoutSeconds: 4 },
          },
          {
            urlPattern: /\/prayer\//,
            handler: 'CacheFirst',
            options: { cacheName: PRAYER_MEDIA_CACHE, cacheableResponse: { statuses: [200] } },
          },
        ],
        navigateFallback: 'index.html',
        // Firebase's reserved /__/ paths go to the network, except the installed app's Google sign-in
        // coming back to Firebase's registered handler address (state=manwar-...): the app itself
        // answers it (data/googleRedirect.ts).
        navigateFallbackDenylist: [/^\/__\/(?!auth\/handler\?.*\bstate=manwar-)/],
        cleanupOutdatedCaches: true,
      },
    }),
  ],
  test: {
    include: ['tests/unit/**/*.test.ts'],
    environment: 'node',
  },
});
