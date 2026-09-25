import { vi } from 'vitest'

import type {
  PublicToolDescriptor,
  PublicToolRef,
  ToolSearchResult,
} from '@/modules/capability-supply/public'

const OPERATIONAL_AVAILABILITY = {
  posture: 'routeable' as const,
  observedAt: 1_700_000_000_000,
  validUntil: 4_000_000_000_000,
  lastHealthyAt: 1_700_000_000_000,
}

export function mockSearchTool(
  toolRef: string,
  capabilityId: string,
  label: string,
  summary: string,
): PublicToolDescriptor {
  return {
    toolRef: toolRef as PublicToolRef,
    toolId: toolRef,
    callVia: '/api/v1/tools/call',
    paymentLane: 'brokered',
    contract: {
      capabilityId,
      version: 1,
      inputJsonSchema: { type: 'object' },
      outputJsonSchema: { type: 'object' },
      customerAnnotations: [],
    },
    business: { businessId: 'biz:1', slug: 'provider', name: 'Provider Corp' },
    listing: { listingRef: 'list:1', revision: 1, label, summary },
    summary,
    commercial: {
      price: { kind: 'fixed', amount: { currency: 'AUD', units: '1000', exponent: 6 } },
      materialTerms: [],
      relationship: { kind: 'none', summary: 'None' },
    },
    dataUse: [],
    effects: [],
    evidence: [],
    cancellation: { kind: 'unsupported' },
    recovery: { idempotency: 'not_applicable', recovery: 'retry_safe' },
    authentication: { kind: 'platform_credential', scheme: 'api_key', in: 'header', name: 'X-API-Key' },
    transport: { method: 'POST', requestTimeoutMs: 5000 },
    provenance: { publisher: 'provider_owned', sourceKind: 'x402' },
    availability: OPERATIONAL_AVAILABILITY,
    navigation: [],
    listingTier: 'reviewed',
  }
}

export const TOOL_CRYPTO_TX = mockSearchTool(
  'operation:v1:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  'crypto.tx.lookup',
  'Ethereum Tx Receipt Lookup',
  'Query ERC-20 token transfers and verify Ethereum transaction receipts and execution status on Base and Ethereum mainnet.',
)

export const TOOL_TIMEZONE = mockSearchTool(
  'operation:v1:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
  'timezone.convert',
  'Timezone Converter',
  'Convert dates and times between worldwide IANA timezones including London and Sydney with daylight savings calculations.',
)

export const TOOL_CURRENCY = mockSearchTool(
  'operation:v1:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc',
  'currency.fx.rates',
  'FX Currency Rates',
  'Live foreign exchange market currency rates and conversions for AUD, USD, EUR, and GBP.',
)

export const ERC20_QUERY = 'look up erc20 transfers'
export const TIMEZONE_QUERY = 'convert london time to sydney'

/** Database-style order: timezone first, then crypto, then FX. */
export function misorderedSearchResult(query: string): Extract<ToolSearchResult, { kind: 'ok' }> {
  return {
    kind: 'ok',
    schemaVersion: 'registry-tools:v3',
    query,
    items: [TOOL_TIMEZONE, TOOL_CRYPTO_TX, TOOL_CURRENCY],
    ranking: [],
    pagination: { limit: 10, hasMore: false },
    navigation: [],
  }
}

export function jevSystemOneResponse(answers: Record<string, unknown>): Response {
  return new Response(
    JSON.stringify({
      model: '~typesafe/jev-latest',
      answers,
      usage: { input_tokens: 180, output_tokens: 0 },
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  )
}

export function jevAnswersForTool(bestToolRef: string, scores: readonly [number, number, number]) {
  return {
    match_0: { type: 'noul', noul: scores[0] },
    match_1: { type: 'noul', noul: scores[1] },
    match_2: { type: 'noul', noul: scores[2] },
    best_match: {
      type: 'choice',
      choice: bestToolRef,
      confidence: 0.98,
      probabilities: { [bestToolRef]: 0.98 },
    },
  }
}

export function mockJevFetch(answers: Record<string, unknown>): typeof fetch {
  return vi.fn().mockResolvedValue(jevSystemOneResponse(answers)) as unknown as typeof fetch
}

export function mockFailedJevFetch(status: number): typeof fetch {
  return vi.fn().mockImplementation(async (url: string | URL) => {
    const href = url.toString()
    if (href.includes('/decisions') || href.includes('/v1/systemone') || href.includes('/api/v1/chat/completions')) {
      return new Response(status === 504 ? 'Gateway Timeout' : 'Internal Server Error', { status })
    }
    throw new Error(`Unexpected url: ${href}`)
  }) as unknown as typeof fetch
}
