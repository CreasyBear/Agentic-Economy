/**
 * The only dynamic import of the browser Sentry SDK. `import.meta.env.SSR` is a
 * build-time constant, so the SSR build drops the branch and the server bundle
 * never contains the browser SDK.
 */
export function loadSentryClient(): Promise<typeof import('@/lib/observability/sentry.client')> {
  if (import.meta.env.SSR) return Promise.reject(new Error('sentry_client_unavailable_on_server'))
  return import('@/lib/observability/sentry.client')
}
