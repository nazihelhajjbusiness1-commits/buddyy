import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
    // Sets the minimal env the config module requires before any import runs.
    setupFiles: ['test/setup.ts'],
  },
});
