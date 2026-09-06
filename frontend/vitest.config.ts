import { defineConfig } from 'vitest/config';

// Unit tests only; Playwright specs under e2e/ have their own runner.
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
  },
});
