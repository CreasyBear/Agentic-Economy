import { describe, expect, it } from 'vitest'

import {
  createDefaultDiscoverySourceState,
  regenerateDiscoveryManifest,
} from '@/modules/discovery/public'
import type { DiscoverySourceState } from '@/modules/discovery/public'
import {
  generateDeveloperDiscoveryExamples,
  generateDeveloperDiscoveryFixtureBundle,
  generateDeveloperDiscoverySchema,
} from '@/modules/discovery/developer-discovery'
import { handleDeveloperDiscoverySchemaRequest } from '@/routes/api.discovery.schema'

const forbiddenSeoDiscoveryPattern =
  /standard merchant-origin UCP is live|\.well-known\/ucp.*(?:available|live|ready)|MCP tools?.*(?:available|live|ready|enabled)|OpenAPI action descriptor.*(?:available|live|ready)|payment handler.*(?:available|live|ready)|callable endpoint.*(?:available|live|ready)|agent-callable|callable":true|paymentRequired":true|sourceHash|rawContact(?!Excluded)|private:evidence|inquiryBody|ownerReply|claimantContact|ownerNotes|notificationPayload|providerPayload|adminEvidence/iu

describe('developer discovery SEO and AEO safety', () => {
  it('marks generated artifacts as non-authority and free of private/future descriptors', () => {
    const state = availableDiscoveryState()
    const options = { canonicalBaseUrl: 'https://ae.example', now: 8_000 }
    const artifacts = [
      generateDeveloperDiscoverySchema(state, options),
      generateDeveloperDiscoveryExamples(state, options),
      generateDeveloperDiscoveryFixtureBundle(state, options),
    ]
    const serialized = artifacts.map((artifact) => JSON.stringify(artifact)).join('\n')

    expect(artifacts.every((artifact) => artifact.nonAuthority)).toBe(true)
    expect(serialized).toContain('"mutation":false')
    expect(serialized).toContain('"payment":false')
    expect(serialized).toContain('"protectedAction":false')
    expect(serialized).toContain('"providerOperation":false')
    expect(serialized).toContain('"requestMarket":false')
    expect(serialized).not.toMatch(forbiddenSeoDiscoveryPattern)
  })

  it('serves schema JSON with cache and sniffing headers for crawler-safe readback', async () => {
    const response = await handleDeveloperDiscoverySchemaRequest(
      new Request('https://ae.example/api/discovery/schema'),
      availableDiscoveryState(),
      { now: 8_000 }
    )
    const body = await response.text()

    expect(response.headers.get('Cache-Control')).toBe('public, max-age=60, stale-while-revalidate=300')
    expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff')
    expect(response.headers.get('X-AE-Required-Funnel-Event')).toBe('schema_downloaded')
    expect(body).not.toMatch(forbiddenSeoDiscoveryPattern)
  })
})

function availableDiscoveryState(): DiscoverySourceState {
  const state = createDefaultDiscoverySourceState()
  const business = state.businesses.at(0)

  if (business === undefined) {
    throw new Error('Expected default discovery source state to include a business.')
  }

  const generated = regenerateDiscoveryManifest(state, { businessId: business.businessId }, { now: 3_000 })
  if (generated.kind !== 'ok') {
    throw new Error(`Expected discovery manifest generation to succeed: ${generated.reason}`)
  }

  return state
}
