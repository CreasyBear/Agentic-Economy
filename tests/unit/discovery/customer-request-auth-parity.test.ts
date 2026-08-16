import { describe, expect, it } from 'vitest'

import { MARKET_OPERATIONS_INVOKE_SCOPE } from '@/modules/agent-access/contract'

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
  buildSiteDiscoveryManifest,
} from '@/modules/discovery/public'

const canonicalBaseUrl = 'https://ae.example'
const modeScopes = CUSTOMER_REQUEST_AUTHORITY_MODE_VALUES.map(customerRequestScopeForMode)
const requiredScopes = [CUSTOMER_REQUEST_AGENT_ENTRYPOINT.requiredScope, ...modeScopes]
const oauthScopes = [MARKET_OPERATIONS_INVOKE_SCOPE, ...requiredScopes]
const authSummary = CUSTOMER_REQUEST_AGENT_AUTHENTICATION_SUMMARY

const schema = buildCustomerRequestContractSchema()
const manifest = buildSiteDiscoveryManifest({ canonicalBaseUrl, now: 1_700_000_000_000 })
const llms = buildOfferingLlmsTxt([], { canonicalBaseUrl }).body
const skill = buildPublicAgentSkillMarkdown({ canonicalBaseUrl })
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
    expect(manifest.operationGateway.scope).toBe(MARKET_OPERATIONS_INVOKE_SCOPE)

    expect(skill).toContain(MARKET_OPERATIONS_INVOKE_SCOPE)
    expect(llms).toContain(MARKET_OPERATIONS_INVOKE_SCOPE)
    expect(skill).toContain('Authorization: Bearer $AE_API_KEY')
    expect(skill).toContain('npm run -s ae -- inspect-plan "$AE_OPERATION_REF_1" "$AE_OPERATION_REF_2" --json')

    expect(metadata).toMatchObject({
      bearer_methods_supported: [CUSTOMER_REQUEST_AGENT_BEARER_METHOD],
      scopes_supported: oauthScopes,
    })
    expect(bearerChallenge(canonicalBaseUrl)).toBe(
      `Bearer resource_metadata="${canonicalBaseUrl}/.well-known/oauth-protected-resource", scope="${MARKET_OPERATIONS_INVOKE_SCOPE}"`,
    )
    for (const mode of CUSTOMER_REQUEST_AUTHORITY_MODE_VALUES) {
      expect(bearerChallenge(canonicalBaseUrl, customerRequestScopeForMode(mode))).toContain(
        `scope="${customerRequestScopeForMode(mode)}"`,
      )
    }

    for (const surface of [llms, skill]) {
      expect(surface).not.toContain('ae_api_key')
      expect(surface).not.toContain('Bearer AE API key')
    }
  })
})
