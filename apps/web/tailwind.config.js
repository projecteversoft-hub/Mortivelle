/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './embed.html', './agent.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: { DEFAULT: '#14201c', soft: '#3d4a45', faint: '#66736d' },
        paper: { DEFAULT: '#f7f8f5', raised: '#ffffff', line: '#d9ded8' },
        // Defined via CSS custom properties, with the first-party app's own color as the
        // fallback, so every existing `bg-brand`/`text-brand` usage (Phase 3's calculators,
        // unmodified) automatically re-themes to a widget's configured `primaryColor` when
        // rendered inside the embed page, which sets `--eversoft-brand`/`-strong` on a
        // wrapper element (apps/web/src/embed) -- without that override present anywhere
        // (the first-party apps/web/src/App.tsx), these resolve to the original fixed colors.
        brand: {
          DEFAULT: 'var(--eversoft-brand, #0f5c4a)',
          strong: 'var(--eversoft-brand-strong, #0a4538)',
        },
        ok: '#14673f',
        warn: '#8a5300',
        bad: '#9b1c1c',
      },
      fontFamily: {
        sans: ['ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
    },
  },
  plugins: [],
};
