import { fileURLToPath } from 'node:url'

import { sentryVitePlugin } from '@sentry/vite-plugin'
import tailwindcss from '@tailwindcss/vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import viteReact from '@vitejs/plugin-react'
import { nitro } from 'nitro/vite'
import { defineConfig, type Plugin } from 'vite'

const sentryAuthToken = process.env.SENTRY_AUTH_TOKEN?.trim()
const sentryOrg = process.env.SENTRY_ORG?.trim()
const sentryProject = process.env.SENTRY_PROJECT?.trim()
const sentryRelease =
  process.env.SENTRY_RELEASE?.trim() ??
  process.env.VERCEL_GIT_COMMIT_SHA?.trim() ??
  process.env.GITHUB_SHA?.trim()
const sentryPluginEnabled = sentryAuthToken !== undefined && sentryOrg !== undefined && sentryProject !== undefined

function localDiscoveryPathCompatibility(): Plugin {
  return {
    name: 'ae-local-discovery-path-compatibility',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use((request, _response, next) => {
        const url = request.url
        if (url === '/SKILL.md' || url?.startsWith('/SKILL.md?') === true) {
          request.url = url.replace('/SKILL.md', '/SKILL.md/')
        }
        next()
      })
    },
  }
}

export default defineConfig(({ command }) => ({
  server: {
    port: 3000,
    allowedHosts: ['jc-mbp.tail4d4766.ts.net'],
    watch: {
      ignored: ['**/test-results/**', '**/playwright-report/**', '**/.output/**'],
    },
  },
  optimizeDeps: {
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
      'seroval',
    ],
  },
  resolve: {
    tsconfigPaths: true,
    /*
     * Astryx 0.1.5 ships a development build whose components import
     * `react/jsx-dev-runtime`. In a production build React resolves that to
     * `react-jsx-dev-runtime.production.js`, which exports no `jsxDEV`, so
     * every render threw and every route 500'd. Point the specifier at a shim
     * that forwards to the production factories.
     *
     * Build only: the dev server keeps React's real development runtime, so
     * component stacks and warnings are unaffected.
     */
    alias: command === 'build'
      ? { 'react/jsx-dev-runtime': fileURLToPath(new URL('./src/lib/compat/react-jsx-dev-runtime.production.ts', import.meta.url)) }
      : {},
  },
  ssr: {
    // Astryx dist uses extensionless relative imports (bundler-style ESM);
    // bundle it for SSR instead of letting Node resolve it natively.
    noExternal: [/^@astryxdesign\//],
  },
  build: {
    sourcemap: sentryPluginEnabled,
  },
  plugins: [
    localDiscoveryPathCompatibility(),
    tanstackStart(),
    nitro({
      // Scope 1 pins Vercel Node serverless, not edge: existing webhook routes
      // use raw Request bodies plus Node/WebCrypto signature verification.
      preset: 'vercel',
      vercel: {
        entryFormat: 'node',
        functions: {
          runtime: 'nodejs20.x',
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
}))
