/// <reference types="vitest" />
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const sharedSrc = fileURLToPath(new URL('../../packages/shared/src/index.ts', import.meta.url));

/**
 * Three static HTML entry points (Phase 4, docs/11 §5), using Vite's native multi-page-app
 * support rather than adding a client-side router:
 *
 * - `index.html` (unchanged): the first-party marketing/status page + Phase 3 calculators.
 * - `embed.html`: the widget page meant to be iframed from a third-party agent site
 *   (apps/web/src/embed) -- reads a public widget key from its own URL, fetches the public
 *   config, and renders only the enabled calculators via the same `CalculatorsSection`.
 * - `agent.html`: the agent login + widget-management dashboard (apps/web/src/agent).
 *
 * Why multi-page over `react-router`: these are three genuinely separate *documents* with
 * different trust boundaries and purposes -- the embed page is designed to be loaded cross-
 * origin inside someone else's site and must never share any of the first-party app's
 * session/cookies or bundle; the agent dashboard is an authenticated, logged-in-only surface
 * that has nothing in common with the anonymous calculator page. A client-side router would
 * still bundle and ship all three experiences together and would not, on its own, give the
 * embed page an isolated document/origin boundary -- that isolation is exactly what the
 * agent's own `<iframe>` already provides for free. Introducing `react-router` (there is no
 * router anywhere in this app yet, per Phase 3's own note in CalculatorsSection.tsx) would
 * add a dependency and a layout/navigation concept this app does not otherwise need, just to
 * reproduce what three small static HTML files already give us. Vite serves all three
 * directly by path in dev (`/index.html`, `/embed.html`, `/agent.html`) with no extra config,
 * and `build.rollupOptions.input` below is the only change needed for `vite build` to emit
 * all three as separate pages.
 */
export default defineConfig({
  plugins: [react()],
  // Consume shared TypeScript source directly so the web build never depends on a prior shared build.
  resolve: { alias: { '@tech-realty-rentals/shared': sharedSrc } },
  server: {
    port: 5173,
    // Same-origin API calls in development; avoids CORS and cross-site cookie issues (see ADR-001).
    proxy: { '/api': { target: 'http://localhost:3001', changeOrigin: false } },
  },
  build: {
    rollupOptions: {
      input: {
        main: fileURLToPath(new URL('./index.html', import.meta.url)),
        embed: fileURLToPath(new URL('./embed.html', import.meta.url)),
        agent: fileURLToPath(new URL('./agent.html', import.meta.url)),
      },
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test-setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
  },
});
