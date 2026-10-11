// @vitest-environment node
import { describe, expect, it } from 'vitest'

import { loadSentryClient } from '@/lib/observability/load-sentry-client'

describe('loadSentryClient', () => {
  it('refuses on the server so the SSR build never bundles the browser SDK', async () => {
    expect(import.meta.env.SSR).toBe(true)
    await expect(loadSentryClient()).rejects.toThrow('sentry_client_unavailable_on_server')
  })
})
