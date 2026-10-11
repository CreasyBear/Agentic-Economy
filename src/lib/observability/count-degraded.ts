import { createIsomorphicFn } from '@tanstack/react-start'

/** Counts a degraded fallback on the server (Sentry metric `ae.degraded`); no-op in the browser. */
export const countDegradedRoute = createIsomorphicFn()
  .client((_site: string) => undefined)
  .server((site: string) => {
    void import('@/lib/observability/sentry.server').then(({ countDegraded }) => countDegraded(site)).catch(() => undefined)
  })
