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

  it('starts with the public call loop and connects only at the authority boundary', () => {
    expect(body).toContain('npx @agentic-economy/cli connect --base-url "https://ae.example" --mcp')
    expect(body.indexOf('ae search "<job>"')).toBeLessThan(body.indexOf('npx @agentic-economy/cli connect'))
    expect(body).toContain('ae inspect "$AE_OPERATION_REF" --base-url "https://ae.example" --json')
    expect(body).toContain('ae call "$AE_OPERATION_REF" --input "$AE_INPUT_JSON"')
    expect(body).toContain('official MCP client')
    expect(body).toContain('Connect only when the call reports `agent_access_key_required`')
  })

  it('names the OAuth key boundary, body-only idempotency, and stable recovery identity', () => {
    expect(body).toContain('https://ae.example/agent-access/authorize?user_code=...')
    expect(body).toContain('https://ae.example/oauth/device_authorization')
    expect(body).toContain('never contains provider credentials or silently grants payment or consequential authority')
    expect(body).toContain('If the receipt explicitly requires reconciliation')
    expect(body).toContain('the CLI creates and retains it automatically')
    expect(body).toContain('Search, inspection, and eligible free keyless read calls are public')
    expect(body).toContain('Provider and publication records are supporting metadata')
  })

  it('builds a machine guide for non-HTML /for-agents requests', () => {
    const guide = buildForAgentsMarkdown(options)
    expect(guide).toContain('npx @agentic-economy/cli connect --base-url "https://ae.example" --mcp')
    expect(guide).toContain('POST body example')
    expect(guide).toContain('application/problem+json')
    expect(guide).toContain('ae inspect "$AE_OPERATION_REF" --base-url "https://ae.example" --json')
    expect(guide).toContain('ae call "$AE_OPERATION_REF" --input "$AE_INPUT_JSON"')
    expect(guide).not.toContain('advanced')
    expect(guide).toContain(`protocol \`${LATEST_PROTOCOL_VERSION}\``)
    expect(guide).toContain('Client connect performs initialization')
    expect(guide).toContain('may omit `Mcp-Session-Id`')
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
