import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

/*
 * GitHub Pages serves a project site from a subdirectory:
 *   https://<user>.github.io/Haushaltsrechner/
 * so the production build needs that prefix baked in. Override it with
 * BASE_PATH if the repository is ever renamed or moved to a root domain.
 */
const base = process.env.BASE_PATH ?? '/Haushaltsrechner/';

export default defineConfig(({ command }) => ({
  // The dev server always serves from the root.
  base: command === 'build' ? base : '/',
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      includeAssets: ['icons/apple-touch-icon-180.png', 'fonts/*.woff2'],
      manifest: {
        name: 'Haushaltsrechner',
        // iOS truncates a long label under the home-screen icon.
        short_name: 'Haushalt',
        description: 'Monthly budget on a 25th-to-24th cycle.',
        // Resolved against the base, not the domain root — the installed
        // app must open the subdirectory, not the top of the site.
        start_url: base,
        scope: base,
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#000000',
        theme_color: '#000000',
        icons: [
          { src: `${base}icons/icon-192.png`, sizes: '192x192', type: 'image/png' },
          { src: `${base}icons/icon-512.png`, sizes: '512x512', type: 'image/png' },
          {
            src: `${base}icons/icon-maskable-512.png`,
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        // The app shell and fonts only. Data always needs the network —
        // no offline writes, no sync conflicts to resolve.
        globPatterns: ['**/*.{js,css,html,woff2,png,svg}'],
        navigateFallback: '/index.html',
        cleanupOutdatedCaches: true,
      },
    }),
  ],
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
}));
