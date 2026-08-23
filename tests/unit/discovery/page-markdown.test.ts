import { describe, expect, it } from 'vitest'
import { LATEST_PROTOCOL_VERSION } from '@modelcontextprotocol/sdk/types.js'

import {
  buildBusinessMarkdown,
  buildCatalogMarkdown,
  buildForAgentsMarkdown,
  buildMissingBusinessMarkdown,
  buildSiteBriefMarkdown,
  buildUnknownPageMarkdown,
} from '@/modules/discovery/public'
import type { PublicBusinessCatalogApiV2Dto } from '@/modules/registry/public'

const options = { canonicalBaseUrl: 'https://ae.example/' }

function business(overrides: Partial<PublicBusinessCatalogApiV2Dto> = {}): PublicBusinessCatalogApiV2Dto {
  return {
    schemaVersion: 'public-business-catalog-api:v2',
    businessId: 'b1',
    slug: 'adelaide-emergency-plumbing',
    name: 'Adelaide Emergency Plumbing',
    category: 'Emergency plumbing',
    businessContext: { kind: 'local_human', suburb: 'Adelaide', stateTerritory: 'SA' },
    publicUrl: '/adelaide-emergency-plumbing',
    trustTier: 'claimed',
    photos: [],
    observedAt: 0,
    disposition: 'current',
    offerings: [{
      offeringRef: 'o1',
      revision: 1,
      name: 'Emergency callout',
      category: 'Emergency plumbing',
      summary: 'Burst pipes and blocked drains.',
      availabilitySummary: 'Same day',
      accessPaths: [],
      support: { integrated: false, aeSupportedAction: false },
    }],
    accessSummary: { humanRequest: true, externalOperation: false, aeSupportedAction: false },
    ...overrides,
  }
}

const pricedOffering: PublicBusinessCatalogApiV2Dto['offerings'][number] = {
  offeringRef: 'o2',
  revision: 1,
  name: 'Blocked drain clear',
  category: 'Emergency plumbing',
  summary: 'Jetting and camera inspection.',
  pricingSummary: 'From $180 — quoted before work starts',
  price: { kind: 'from', amount: { currency: 'AUD', units: '18000', exponent: 2 }, unit: 'visit', taxTreatment: 'inclusive' },
  accessPaths: [],
  support: { integrated: false, aeSupportedAction: false },
}

describe('site brief markdown', () => {
  const body = buildSiteBriefMarkdown(options)

  it('starts with the no-install raw handshake and then uses the repo-local CLI', () => {
    expect(body).toContain('curl -fsSL https://ae.example/.well-known/ucp')
    expect(body.indexOf('/api/v1/market-operations/search')).toBeLessThan(body.indexOf('npm run -s ae -- connect --json'))
    expect(body).toContain('npm run -s ae -- inspect "$AE_OPERATION_REF" --json')
    expect(body).toContain('npm run -s ae -- inspect-plan "$AE_OPERATION_REF_1" "$AE_OPERATION_REF_2" --json')
    expect(body).toContain('AE_CLI_BASE_URL=https://ae.example')
  })

  it('names the OAuth key boundary, body-only idempotency, and stable recovery identity', () => {
    expect(body).toContain('https://ae.example/agent-access/authorize?user_code=...')
    expect(body).toContain('https://ae.example/oauth/device_authorization')
    expect(body).toContain('never contains provider credentials or silently grants payment or consequential authority')
    expect(body).toContain('npm run -s ae -- recover "$AE_INVOCATION_REF" "$AE_EVIDENCE_JSON" --idempotency-key "$AE_IDEMPOTENCY_KEY" --json')
    expect(body).toContain('The request JSON body field `idempotencyKey` is required for invoke, cancel, and reconcile; choose it once for the intended invocation and retain it.')
    expect(body).toContain('Authenticated: invoke, status, cancel, reconcile.')
    expect(body).toContain('qualified direct-keyless MCP execution does not')
    expect(body).toContain('Business reads are business-only')
  })

  it('builds a machine guide for non-HTML /for-agents requests', () => {
    const guide = buildForAgentsMarkdown(options)
    expect(guide).toContain('curl -fsSL https://ae.example/.well-known/ucp')
    expect(guide).toContain('POST body example')
    expect(guide).toContain('application/problem+json')
    expect(guide).toContain('npm run -s ae -- inspect-plan "$AE_OPERATION_REF_1" "$AE_OPERATION_REF_2" --json')
    expect(guide).toContain('export AE_CLI_BASE_URL="https://ae.example"')
    expect(guide).toContain('npm run -s ae -- advanced cancel')
    expect(guide).not.toContain('npm run -s ae -- advanced reconcile')
    expect(guide).toContain(`protocol \`${LATEST_PROTOCOL_VERSION}\``)
    expect(guide).toContain('`initialize` then `notifications/initialized`')
  })

  it('trims the trailing slash off the canonical base', () => {
    expect(body).not.toContain('https://ae.example//')
  })
})

describe('catalog markdown', () => {
  it('lists at most the page limit and points at the API for the rest', () => {
    const items = Array.from({ length: 40 }, (_, index) => business({ slug: `business-${index}`, name: `Business ${index}` }))
    const body = buildCatalogMarkdown(items, { ...options, total: 200 })
    expect(body.split('\n').filter((line) => line.startsWith('| Business |'))).toHaveLength(1)
    expect(body.match(/^\| Business \d+ \|/gmu)).toHaveLength(25)
    expect(body).toContain('Showing 25 of 200')
  })

  it('says so plainly when nothing matched', () => {
    const body = buildCatalogMarkdown([], { ...options, query: 'plumber' })
    expect(body).toContain('matching "plumber"')
    expect(body).toContain('No published business matched this read.')
  })

  it('keeps a business name with a pipe from breaking the table', () => {
    const body = buildCatalogMarkdown([business({ name: 'Pipes | Drains' })], options)
    const row = body.split('\n').find((line) => line.includes('Pipes'))
    expect(row?.split('|')).toHaveLength(8)
  })

  it('gives every row a comparable price, or an em dash when none is published', () => {
    const body = buildCatalogMarkdown([
      business({ slug: 'priced', name: 'Meridian Drains', offerings: [pricedOffering] }),
      business({ slug: 'unpriced', name: 'Silent Pipeworks' }),
    ], options)
    const lines = body.split('\n')

    expect(lines.find((line) => line.startsWith('| Business |'))).toContain('| Price |')
    expect(lines.find((line) => line.includes('Meridian Drains'))).toContain('| From AUD 180.00 per visit incl. tax |')
    // An offering without a published price stays without one; the row says so.
    expect(lines.find((line) => line.includes('Silent Pipeworks'))).toContain('| — |')
  })
})

describe('business markdown', () => {
  it('publishes the offering facts and the listing boundary', () => {
    const body = buildBusinessMarkdown(business(), options)
    expect(body).toContain('# Adelaide Emergency Plumbing')
    expect(body).toContain('### Emergency callout')
    expect(body).toContain('- Availability: Same day')
    expect(body).toContain('- AE can act on this offering: no')
    expect(body).toContain('GET https://ae.example/api/businesses/adelaide-emergency-plumbing')
  })

  it('publishes the comparable price above the note the business wrote', () => {
    const body = buildBusinessMarkdown(business({ offerings: [pricedOffering] }), options)

    expect(body).toContain('- Price: From AUD 180.00 per visit incl. tax')
    expect(body).toContain('- Published price note: From $180 — quoted before work starts')
    expect(body.indexOf('- Price:')).toBeLessThan(body.indexOf('- Published price note:'))
  })

  it('emits no price line for an offering that published none', () => {
    expect(buildBusinessMarkdown(business(), options)).not.toContain('- Price:')
  })
})

describe('refusal documents', () => {
  it('refuses to imply an unpublished business exists', () => {
    const body = buildMissingBusinessMarkdown('ghost-plumbing', options)
    expect(body).toContain('No public listing exists for `ghost-plumbing`')
    expect(body).toContain('Do not invent provider details.')
  })

  it('points an unprojectable page at the surfaces that do answer machines', () => {
    const body = buildUnknownPageMarkdown('/about', options)
    expect(body).toContain('`/about` is served as HTML only')
    expect(body).toContain('https://ae.example/llms.txt')
    expect(body).toContain('https://ae.example/api/answer/turn')
  })
})
