import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  resolve: { alias: { '@shared': fileURLToPath(new URL('../shared/index.ts', import.meta.url)) } },
  test: { environment: 'jsdom', include: ['src/**/*.test.ts'] },
});
