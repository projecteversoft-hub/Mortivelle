import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import prettier from 'eslint-config-prettier';
import globals from 'globals';

export default tseslint.config(
  { ignores: ['**/dist/**', '**/node_modules/**', '**/coverage/**', 'docs/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
  {
    files: ['apps/web/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    languageOptions: { globals: globals.browser },
    rules: reactHooks.configs.recommended.rules,
  },
  {
    // Phase 4: the embed auto-sizing script (apps/web/public/embed-resize.js) is a plain
    // vanilla-JS file served as-is to third-party pages, not part of the Vite/TS build --
    // still linted, just needs browser globals like the TS/TSX files above.
    files: ['apps/web/public/**/*.js'],
    languageOptions: { globals: globals.browser },
  },
  {
    files: ['apps/api/**/*.ts', 'packages/shared/**/*.ts', '*.config.{js,mjs,ts}'],
    languageOptions: { globals: globals.node },
  },
  {
    // Phase 7: Playwright config/specs and its one-time fixture-provisioning script run
    // under Node (the Playwright test runner), not the browser, even though they drive a
    // browser remotely -- override the broader `apps/web/**/*.{ts,tsx}` browser-globals
    // block above for just these files.
    files: ['apps/web/playwright.config.ts', 'apps/web/e2e/**/*.ts', 'apps/web/e2e/**/*.mjs'],
    languageOptions: { globals: globals.node },
  },
  {
    // NestJS dependency injection needs value imports for constructor parameter types.
    files: ['apps/api/**/*.ts'],
    rules: { '@typescript-eslint/consistent-type-imports': 'off' },
  },
  prettier,
);
