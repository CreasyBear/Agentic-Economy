import { describe, expect, it } from 'vitest'

import {
  buildLlmsTxt,
  buildRobotsTxt,
  buildSitemapXml,
  createDefaultDiscoverySourceState,
} from '@/modules/discovery/public'

const forbiddenDiscoveryOutputPattern =
  /MCP|OpenAPI|API key|apiKey|payment handler|payment_handlers|provider webhook|protected action|callable=true|paymentRequired=true|agent-callable|\.well-known\/ucp/i

describe('discovery output overclaim guardrail', () => {
  it('does not advertise unsupported protocol, action, or payment surfaces', () => {
    const state = createDefaultDiscoverySourceState()
    const outputs = [
      buildLlmsTxt(state, { canonicalBaseUrl: 'https://ae.example' }).body,
      buildSitemapXml(state, { canonicalBaseUrl: 'https://ae.example', now: 0 }).body,
      buildRobotsTxt({ canonicalBaseUrl: 'https://ae.example' }).body,
    ].join('\n')

    expect(outputs).not.toMatch(forbiddenDiscoveryOutputPattern)
    expect(outputs).toContain('callable=false')
    expect(outputs).toContain('paymentRequired=false')
  })
})
