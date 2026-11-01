import { defineConfig } from 'vitest/config';
import path from 'node:path';

/**
 * Unit-test config for the deterministic engine layers
 * (compatibility, scoring, performance). Browser-only code is not covered.
 */
export default defineConfig({
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    reporters: ['default'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary'],
      include: ['src/lib/compatibility/**/*.ts', 'src/lib/scoring/**/*.ts', 'src/lib/performance/**/*.ts'],
      exclude: ['**/*.test.ts', '**/__tests__/**', '**/types.ts'],
      thresholds: {
        lines: 80,
        functions: 80,
        statements: 80,
        branches: 75,
      },
    },
  },
});
