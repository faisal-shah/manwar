/// <reference types="vitest/config" />
import { realpathSync } from 'node:fs';
import { defineConfig, searchForWorkspaceRoot } from 'vite';
import preact from '@preact/preset-vite';
import { VitePWA } from 'vite-plugin-pwa';
import { APP_TITLE, NAME_AR } from './src/ui/brand';

export default defineConfig({
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
        display: 'fullscreen',
        orientation: 'landscape',
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
        navigateFallback: 'index.html',
        navigateFallbackDenylist: [/^\/__\//],
        cleanupOutdatedCaches: true,
      },
    }),
  ],
  test: {
    include: ['tests/unit/**/*.test.ts'],
    environment: 'node',
  },
});
