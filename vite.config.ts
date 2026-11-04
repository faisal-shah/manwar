/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    preact(),
    VitePWA({
      registerType: 'prompt',
      injectRegister: false,
      includeAssets: ['icon.svg'],
      manifest: {
        name: 'Manwar',
        short_name: 'Manwar',
        description: 'Family wall calendar, tasks, rewards, lists and meals',
        display: 'fullscreen',
        orientation: 'landscape',
        background_color: '#dce8f3',
        theme_color: '#dce8f3',
        start_url: '/',
        icons: [{ src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,woff2,svg}'],
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
