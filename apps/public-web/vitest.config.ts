import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@ethio-tour/api-client': fileURLToPath(
        new URL('../../packages/api-client/src/index.ts', import.meta.url),
      ),
    },
  },
});
