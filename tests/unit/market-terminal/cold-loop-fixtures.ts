import { CALL_ROUTE_CONTRACT } from '@/modules/capability-execution/call-entry'
import { projectToolDescription, projectToolListChoices, toolChoiceSearchOutputSchema } from '@/modules/registry/tool-choice-contracts'
import { toolDetailOutputSchema, toolSearchOutputSchema } from '@/modules/capability-supply/public'

import { commitmentRef } from './cold-loop-harness'

export type ToolDescriptorFixture = Readonly<{ toolRef: string; [key: string]: unknown }>

export const SEARCH_ITEM_NAVIGATION = [
  { relation: 'describe', pathTemplate: '/api/v1/market-tools/describe', method: 'POST', actionId: 'registry.tools.describe', authentication: 'none' },
  { relation: 'compare', pathTemplate: '/api/v1/market-tools/compare', method: 'POST', actionId: 'registry.tools.compare', authentication: 'none' },
  { relation: 'call', pathTemplate: '/api/v1/tools/quote', method: 'POST', actionId: 'tool.quote', authentication: 'required' },
  { relation: 'review_route', pathTemplate: '/agent-access', method: 'GET', actionId: 'agentAccess.review', authentication: 'required' },
] as const

const DEFAULT_COMMITMENT_REF = commitmentRef('e')

export function operationDescriptor(toolRef: string, summary = 'Current reference lookup') {
  return {
    toolRef,
    callVia: CALL_ROUTE_CONTRACT.call.path,
    paymentLane: 'brokered',
      runtimeEnvironment: 'production',
    toolId: 'reference.lookup',
    contract: {
      capabilityId: 'reference.lookup',
      version: 1,
      inputJsonSchema: { type: 'object' },
      outputJsonSchema: { type: 'object' },
      customerAnnotations: [],
    },
    business: { businessId: 'business:reference', slug: 'reference', name: 'Reference Services' },
    listing: { listingRef: 'listing:reference', revision: 1, label: 'Reference lookup', summary },
    summary,
    commercial: {
      price: { kind: 'fixed', amount: { currency: 'USD', units: '0', exponent: 2 } },
      materialTerms: [],
      relationship: { kind: 'none', summary: 'No commercial relationship.' },
    },
    dataUse: [],
    effects: [],
    evidence: [],
    cancellation: { kind: 'unsupported' },
    recovery: { idempotency: 'required', recovery: 'retry_safe' },
    authentication: { kind: 'ae_api_key' },
    transport: { method: 'GET', pathTemplate: '/lookup', responseStatus: 200, responseContentType: 'application/json', requestTimeoutMs: 5_000 },
    provenance: { publisher: 'provider_owned', sourceKind: 'openapi_http' },
    availability: {
      posture: 'routeable',
      observedAt: Date.now(),
      validUntil: Date.now() + 60_000,
    },
    navigation: [],
    listingTier: 'reviewed' as const,
  }
}

export function operationSearchResult(query: string, operations: readonly ToolDescriptorFixture[]) {
  return toolChoiceSearchOutputSchema.parse({
    kind: operations.length === 0 ? 'noMatch' : 'match',
    ...(operations.length === 0 ? { reason: 'No suitable Tools found in the assessed sources.' } : {}),
    schemaVersion: 'registry-tools:v3',
    query,
    partialResults: false,
    assessed: { source: 'all', scope: 'complete', examined: operations.length, coverage: 'complete' },
    results: operations.map((operation) => ({
      id: operation.toolRef,
      source: 'current',
      access: 'ae_callable',
      toolRef: operation.toolRef,
      title: 'Reference lookup',
      summary: 'Current reference lookup',
      provider: 'Reference Services',
      actionClass: 'retrieve',
      objectClass: 'data',
      readiness: 'ready',
      price: { kind: 'indicative', label: 'A$0.01' },
      detailRef: operation.toolRef,
      next: [{ action: 'registry.tools.describe', authority: 'public', args: { toolRef: operation.toolRef } }],
    })),
    pagination: { limit: 8, hasMore: false },
    next: [],
  })
}

export function operationDetailResult(operation: ToolDescriptorFixture) {
  return projectToolDescription(toolDetailOutputSchema.parse({
    kind: 'found' as const,
    schemaVersion: 'registry-tools:v3' as const,
    tool: operation,
  }))
}

export function operationListResult(operations: readonly ToolDescriptorFixture[]) {
  return projectToolListChoices(toolSearchOutputSchema.parse({
    kind: 'ok' as const,
    schemaVersion: 'registry-tools:v3' as const,
    query: '',
    items: operations,
    matchedCount: operations.length,
    ranking: operations.map((operation, index) => ({
      toolRef: operation.toolRef,
      rank: index + 1,
      score: operations.length - index,
    })),
    pagination: { limit: 50, hasMore: false },
    navigation: [],
  }))
}

export function connectedAccount() {
  return {
    kind: 'authenticated' as const,
    principalRef: 'principal:buyer',
    accountRef: 'account:buyer',
    credentialId: 'credential:buyer',
    applicationRef: 'agentic-economy',
    environment: 'sandbox' as const,
    scopes: ['market_tools:call', 'customer_requests:spending_policy'],
    authorityMode: 'spending_policy' as const,
  }
}

export function operationInspection(
  toolRef: string,
  input: Record<string, unknown>,
  quoteCommitmentRef = DEFAULT_COMMITMENT_REF,
) {
  return {
    kind: 'committed',
    quoteRef: quoteCommitmentRef,
    toolRef,
    toolVersion: 1,
    expiresAt: 1_900_000_000_000,

    price: { currency: 'AUD', units: '1000000', exponent: 6 },
    account: {
      accountRef: 'account:cold-loop',
      available: { currency: 'AUD', units: '10000000', exponent: 6 },
    },
    budget: {
      principalRef: 'principal:cold-loop',
      maximumPerCall: { currency: 'AUD', units: '5000000', exponent: 6 },
    },
    policyRefs: ['commercial-policy:sandbox'],
    evidenceDigest: 'sha256:inspection',
    continuation: {
      action: 'tool.call',
      args: { quoteRef: quoteCommitmentRef, idempotencyKey: 'replace-at-call' },
    },
  }
}
