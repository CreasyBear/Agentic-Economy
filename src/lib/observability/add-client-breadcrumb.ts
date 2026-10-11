import { loadSentryClient } from '@/lib/observability/load-sentry-client'
import { createClientOnlyFn } from '@tanstack/react-start'

/** Expected, non-error context for the next real event; never creates a Sentry issue. */
export const addClientBreadcrumb = createClientOnlyFn((message: string, data?: Record<string, string>) => {
  void loadSentryClient().then(({ Sentry }) => {
    Sentry.addBreadcrumb({ category: 'expected', level: 'info', message, ...(data === undefined ? {} : { data }) })
  }).catch(() => undefined)
})
