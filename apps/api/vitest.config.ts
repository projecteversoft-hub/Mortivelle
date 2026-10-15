import { defineConfig } from 'vitest/config';
import swc from 'unplugin-swc';

// SWC emits decorator metadata, which NestJS dependency injection requires.
export default defineConfig({
  test: { include: ['src/**/*.test.ts', 'test/**/*.test.ts'], environment: 'node' },
  plugins: [swc.vite({ module: { type: 'es6' } })],
});
