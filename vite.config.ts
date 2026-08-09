import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

import type { Plugin as EsbuildPlugin } from 'esbuild'
import { defineConfig } from 'vite'

import { sentryVitePlugin } from '@sentry/vite-plugin'
import tailwindcss from '@tailwindcss/vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import viteReact from '@vitejs/plugin-react'
import { nitro } from 'nitro/vite'

const sentryAuthToken = process.env.SENTRY_AUTH_TOKEN?.trim()
const sentryOrg = process.env.SENTRY_ORG?.trim()
const sentryProject = process.env.SENTRY_PROJECT?.trim()
const sentryRelease =
  process.env.SENTRY_RELEASE?.trim() ??
  process.env.VERCEL_GIT_COMMIT_SHA?.trim() ??
  process.env.GITHUB_SHA?.trim()
const sentryPluginEnabled = sentryAuthToken !== undefined && sentryOrg !== undefined && sentryProject !== undefined
const graphologyCjsPath = fileURLToPath(new URL('./node_modules/graphology/dist/graphology.cjs.js', import.meta.url))
const graphologyOptimizeDepsCjs: EsbuildPlugin = {
  name: 'graphology-optimize-deps-cjs',
  setup(build) {
    // Graphology's ESM class has an `import(...)` method that Vite 8 rewrites
    // as a dynamic import. Optimize its equivalent CJS build for browsers.
    build.onLoad({ filter: /graphology\/dist\/graphology\.(?:mjs|esm\.js)$/u }, async () => ({
      contents: await readFile(graphologyCjsPath, 'utf8'),
      loader: 'js',
    }))
  },
}

export default defineConfig({
  server: {
    port: 3000,
    allowedHosts: ['jc-mbp.tail4d4766.ts.net'],
    watch: {
      ignored: ['**/test-results/**', '**/playwright-report/**', '**/.output/**'],
    },
  },
  optimizeDeps: {
    esbuildOptions: {
      plugins: [graphologyOptimizeDepsCjs],
    },
    include: [
      '@clerk/backend',
      '@clerk/backend/internal',
      '@clerk/shared/apiUrlFromPublishableKey',
      '@clerk/shared/keyless',
      '@clerk/shared/keys',
      '@clerk/shared/netlifyCacheHandler',
      '@clerk/shared/proxy',
      '@clerk/shared/utils',
      '@clerk/react',
      '@clerk/react/internal',
      '@clerk/shared/error',
      '@clerk/shared/getEnvVariable',
      '@clerk/shared/getToken',
      '@clerk/shared/underscore',
      '@stylexjs/stylex',
      '@tanstack/router-core',
      '@tanstack/router-core/isServer',
      '@tanstack/router-core/ssr/client',
      'graphology',
      'seroval',
    ],
  },
  resolve: {
    tsconfigPaths: true,
  },
  build: {
    sourcemap: sentryPluginEnabled,
  },
  plugins: [
    tanstackStart(),
    nitro({
      // Scope 1 pins Vercel Node serverless, not edge: existing webhook routes
      // use raw Request bodies plus Node/WebCrypto signature verification.
      // Register the markdown route with Nitro so Vite does not classify the
      // `.md` suffix as a static asset for non-browser Accept headers.
      routes: {
        '/SKILL.md': {
          handler: './src/routes/SKILL[.]md.ts',
          method: 'GET',
        },
      },
      preset: 'vercel',
      vercel: {
        entryFormat: 'node',
        functions: {
          runtime: 'nodejs22.x',
        },
      },
    }),
    viteReact(),
    tailwindcss(),
    ...(sentryPluginEnabled
      ? [
          sentryVitePlugin({
            org: sentryOrg,
            project: sentryProject,
            authToken: sentryAuthToken,
            ...(sentryRelease === undefined ? {} : { release: { name: sentryRelease } }),
            telemetry: false,
          }),
        ]
      : []),
  ],
})
