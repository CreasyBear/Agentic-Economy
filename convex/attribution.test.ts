/// <reference types="vite/client" />
import { convexTest } from 'convex-test'
import { describe, expect, it } from 'vitest'

import { buildAttributionTouch } from '../src/lib/observability/posthog.client'
import { api } from './_generated/api'
import schema from './schema'

const modules = import.meta.glob('./**/*.ts')

describe('recordAttribution', () => {
  it('is a no-op without a signed-in owner', async () => {
    const backend = convexTest(schema, modules)
    await expect(backend.mutation(api.attribution.recordAttribution, { lastTouch: { source: 'x', at: 1 } })).resolves.toBeNull()
  })
})

describe('buildAttributionTouch', () => {
  it('maps initial props and keeps the landing path free of the query', () => {
    expect(buildAttributionTouch({
      $initial_utm_source: 'newsletter', $initial_gclid: 'g1', $initial_referrer: '$direct',
      $initial_current_url: 'https://x.test/for-agents?utm_source=newsletter&token=secret',
    }, '$initial_', 5)).toEqual({ source: 'newsletter', clickId: 'g1', landingPath: '/for-agents', at: 5 })
  })
  it('returns undefined with no campaign data', () => {
    expect(buildAttributionTouch({}, '$session_entry_', 5)).toBeUndefined()
  })
})
