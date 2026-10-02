import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
    alias: {
      // Ensure in-repo tool modules resolve the @/ -> src alias too (the CLI
      // runs under tsx which applies tsconfig paths; vitest needs the same map
      // when a unit test pulls tools/ae/lib/*).
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    // Tests run in an explicitly isolated money world; production cases opt in.
    env: { AE_DEPLOYMENT_ENVIRONMENT: 'development' },
    include: [
      'tests/**/*.test.ts',
      'tests/**/*.test.tsx',
      'convex/**/*.test.ts',
      'src/**/*.test.ts',
      'src/**/*.test.tsx',
    ],
    globalSetup: ['tests/setup/build-cli.global.ts'],
    setupFiles: [
      './tests/setup/web-storage.ts',
      './tests/setup/jsdom-platform.ts',
      './tests/setup/http-rate-limit.ts',
    ],
    globals: false,
    watch: false,
  },
})
