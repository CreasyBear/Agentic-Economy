import { sentryVitePlugin } from '@sentry/vite-plugin'
import tailwindcss from '@tailwindcss/vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import viteReact from '@vitejs/plugin-react'
import { nitro } from 'nitro/vite'
import { defineConfig } from 'vite'

const sentryAuthToken = process.env.SENTRY_AUTH_TOKEN?.trim()
const sentryOrg = process.env.SENTRY_ORG?.trim()
const sentryProject = process.env.SENTRY_PROJECT?.trim()
const sentryRelease =
  process.env.SENTRY_RELEASE?.trim() ??
  process.env.VERCEL_GIT_COMMIT_SHA?.trim() ??
  process.env.GITHUB_SHA?.trim()
const sentryPluginEnabled = sentryAuthToken !== undefined && sentryOrg !== undefined && sentryProject !== undefined

export default defineConfig({
  server: {
    port: 3000,
  },
  resolve: {
    tsconfigPaths: true,
  },
  build: {
    sourcemap: sentryPluginEnabled,
  },
  plugins: [
    tanstackStart(),
    nitro(),
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
