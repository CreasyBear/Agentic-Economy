import { describe, expect, it } from 'vitest'

import {
  buildLlmsTxt,
  buildRobotsTxt,
  buildSitemapXml,
  createDefaultDiscoverySourceState,
} from '@/modules/discovery/public'

const forbiddenDiscoveryOutputPattern =
  /OpenAPI|apiKey|payment handler|payment_handlers|provider webhook|protected action|callable=true|paymentRequired=true|\.well-known\/ucp/i

describe('discovery output overclaim guardrail', () => {
  it('advertises the Request surface without retired routing or unsupported action claims', () => {
    const state = createDefaultDiscoverySourceState()
    const outputs = [
      buildLlmsTxt(state, { canonicalBaseUrl: 'https://ae.example' }).body,
      buildSitemapXml(state, { canonicalBaseUrl: 'https://ae.example', now: 0 }).body,
      buildRobotsTxt({ canonicalBaseUrl: 'https://ae.example' }).body,
    ].join('\n')

    expect(outputs).not.toMatch(forbiddenDiscoveryOutputPattern)
    expect(outputs).not.toMatch(/\.well-known\/ae-routing|\/v1\/route|\/mcp/)
    expect(outputs).toContain('/api/v1/requests')
    expect(outputs).toContain('Bearer AE API key with customer_requests:create')
    expect(outputs).toMatch(/listing endpoints publish business facts; they do not select or execute routes/i)
  })
})
