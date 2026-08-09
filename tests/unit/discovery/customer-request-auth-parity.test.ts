import { describe, expect, it } from 'vitest'

import {
  CUSTOMER_REQUEST_AGENT_AUTHENTICATION_SUMMARY,
  CUSTOMER_REQUEST_AGENT_BEARER_METHOD,
  CUSTOMER_REQUEST_AGENT_ENTRYPOINT,
  CUSTOMER_REQUEST_AGENT_REQUIRED_SCOPES,
  CUSTOMER_REQUEST_AUTHORITY_MODE_VALUES,
  customerRequestScopeForMode,
} from '@/modules/customer-request/agent-contract'
import { buildCustomerRequestContractSchema } from '@/modules/customer-request/public-contract-schema'
import { bearerChallenge, oauthProtectedResourceMetadata } from '@/lib/http/oauth-challenge'
import {
  buildOfferingLlmsTxt,
  buildPublicAgentSkillMarkdown,
  buildSiteBriefMarkdown,
  buildSiteDiscoveryManifest,
} from '@/modules/discovery/public'

const canonicalBaseUrl = 'https://ae.example'
const modeScopes = CUSTOMER_REQUEST_AUTHORITY_MODE_VALUES.map(customerRequestScopeForMode)
const requiredScopes = [CUSTOMER_REQUEST_AGENT_ENTRYPOINT.requiredScope, ...modeScopes]
const authSummary = CUSTOMER_REQUEST_AGENT_AUTHENTICATION_SUMMARY

const schema = buildCustomerRequestContractSchema()
const manifest = buildSiteDiscoveryManifest({ canonicalBaseUrl, now: 1_700_000_000_000 })
const llms = buildOfferingLlmsTxt([], { canonicalBaseUrl }).body
const skill = buildPublicAgentSkillMarkdown({ canonicalBaseUrl })
const siteBrief = buildSiteBriefMarkdown({ canonicalBaseUrl })
const metadata = oauthProtectedResourceMetadata(canonicalBaseUrl)

function customerRequestSubmitEndpoint() {
  const endpoint = manifest.endpoints.find((candidate) => candidate.kind === 'customer_request_submit')
  if (endpoint === undefined) throw new Error('customer_request_submit_endpoint_missing')
  return endpoint
}

describe('Customer Request public authentication parity', () => {
  it('keeps the canonical Clerk API-key bearer story and base-plus-one-mode scopes aligned', () => {
    expect(CUSTOMER_REQUEST_AGENT_ENTRYPOINT.authentication).toBe('clerk_api_key')
    expect(CUSTOMER_REQUEST_AGENT_ENTRYPOINT.requiredScope).toBe('customer_requests:create')
    expect(authSummary).toBe('Authorization: Bearer <Clerk API key>')
    expect(requiredScopes).toEqual([...CUSTOMER_REQUEST_AGENT_REQUIRED_SCOPES])

    expect(schema.entrypoint.authentication).toBe(CUSTOMER_REQUEST_AGENT_ENTRYPOINT.authentication)
    expect(schema.entrypoint.requiredScope).toBe(CUSTOMER_REQUEST_AGENT_ENTRYPOINT.requiredScope)
    expect(manifest.customerRequest.authentication).toBe(CUSTOMER_REQUEST_AGENT_ENTRYPOINT.authentication)
    expect(customerRequestSubmitEndpoint().authentication).toBe(CUSTOMER_REQUEST_AGENT_ENTRYPOINT.authentication)

    for (const scope of requiredScopes) {
      expect(llms).toContain(scope)
      expect(skill).toContain(scope)
    }
    expect(llms).toContain(`auth=${authSummary}`)
    expect(skill).toContain(authSummary)
    expect(siteBrief).toContain(`${authSummary} with \`${CUSTOMER_REQUEST_AGENT_ENTRYPOINT.requiredScope}\``)

    expect(metadata).toMatchObject({
      bearer_methods_supported: [CUSTOMER_REQUEST_AGENT_BEARER_METHOD],
      scopes_supported: requiredScopes,
    })
    expect(bearerChallenge(canonicalBaseUrl)).toBe(
      `Bearer resource_metadata="${canonicalBaseUrl}/.well-known/oauth-protected-resource", scope="${CUSTOMER_REQUEST_AGENT_ENTRYPOINT.requiredScope}"`,
    )
    for (const mode of CUSTOMER_REQUEST_AUTHORITY_MODE_VALUES) {
      expect(bearerChallenge(canonicalBaseUrl, customerRequestScopeForMode(mode))).toContain(
        `scope="${customerRequestScopeForMode(mode)}"`,
      )
    }

    for (const surface of [llms, skill, siteBrief]) {
      expect(surface).not.toContain('ae_api_key')
      expect(surface).not.toContain('Bearer AE API key')
    }
  })
})
