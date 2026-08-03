import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx', 'convex/**/*.test.ts'],
    setupFiles: [
      './tests/setup/web-storage.ts',
      './tests/setup/no-search-gap-writes.ts',
      './tests/setup/resize-observer.ts',
      './tests/setup/http-rate-limit.ts',
    ],
    globals: false,
    watch: false,
  },
})
