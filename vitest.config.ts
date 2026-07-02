import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
  test: {
    setupFiles: ['./vitest.setup.ts'],
    // node_modules/dist are excluded by default; spawned-session worktrees
    // under .claude/ carry a full repo copy and would double every test.
    exclude: ['**/node_modules/**', '**/.next/**', '.claude/**'],
  },
});
