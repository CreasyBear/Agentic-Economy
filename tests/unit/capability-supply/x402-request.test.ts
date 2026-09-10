import { describe, expect, it } from 'vitest'
import { prepareX402Request } from '@/modules/capability-supply/server'
import { admitBazaarDiscoveryInfo } from '@/modules/capability-supply/internal/publication-importer-x402-bazaar'
import { admitOfficialBazaarFromPaymentRequired, admitFacilitatorDiscoveryItems } from '@/modules/capability-supply/server'


import syntheticPost from '@/modules/capability-supply/internal/x402-bazaar-fixtures/synthetic-post-payment-required.json'

describe('managed request serialization', () => {
  const endpoint = new URL('https://example.com/tool?fixed=yes')
  it('serializes the actual raw POST body without the AE envelope', () => {
    const result = prepareX402Request(endpoint, { method: 'POST', bodyPointer: '/body' }, '{"body":[1,null,"x"]}')
    expect(result.kind).toBe('prepared')
    expect(result.body).toBe('[1,null,"x"]')
    if (result.kind === 'prepared') expect(result.target.href).toBe(endpoint.href)
  })
  it('preserves endpoint queries and encodes primitive arrays using the shared HTTP serializer', () => {
    const result = prepareX402Request(endpoint, { method: 'GET', queryObjectPointer: '/query' }, '{"query":{"q":"a & b","tag":["one","two"],"n":2}}')
    expect(result.kind).toBe('prepared')
    if (result.kind !== 'prepared') return
    expect(result.target.searchParams.get('fixed')).toBe('yes')
    expect(result.target.searchParams.get('q')).toBe('a & b')
    expect(result.target.searchParams.getAll('tag')).toEqual(['one', 'two'])
  })
  it('replaces supplied mapped defaults while retaining unrelated URL parameters', () => {
    const result = prepareX402Request(new URL('https://example.com/tool?from=sample&fixed=keep&tag=sample'), {
      method: 'GET', query: [{ inputPointer: '/from', parameter: 'from' }, { inputPointer: '/tags', parameter: 'tag', style: 'form', explode: true }],
    }, '{"from":"actual","tags":["one","two"]}')
    expect(result.kind).toBe('prepared')
    if (result.kind !== 'prepared') return
    expect(result.target.searchParams.getAll('from')).toEqual(['actual'])
    expect(result.target.searchParams.get('fixed')).toBe('keep')
    expect(result.target.searchParams.getAll('tag')).toEqual(['one', 'two'])
  })
  it('refuses nested query objects and more than 64 keys', () => {
    for (const query of [{ nested: { value: 1 } }, Object.fromEntries(Array.from({ length: 65 }, (_, i) => [`a${i}`, i]))]) {
      expect(prepareX402Request(endpoint, { method: 'GET', queryObjectPointer: '/query' }, JSON.stringify({ query })).kind).toBe('refused')
    }
  })
  it('admits the pinned CDP SDK minimal declarations without fabricated examples', () => {
    for (const method of ['GET', 'POST']) {
      const result = admitOfficialBazaarFromPaymentRequired({ extensions: { bazaar: minimalCdpDeclaration(method) } })
      expect(result).toMatchObject({ kind: 'admitted', method })
      expect(result).not.toHaveProperty('inputExample')
      expect(result).toHaveProperty(method === 'POST' ? 'bodyPointer' : 'queryObjectPointer')
    }
  })
  it('publishes minimal declarations with preparation data release and root JSON evidence', async () => {
    const result = await admitFacilitatorDiscoveryItems([{ ...syntheticPost,
      accepts: syntheticPost.accepts.map(accept => ({ ...accept, network: 'eip155:8453', asset: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' })),
      extensions: { bazaar: minimalCdpDeclaration('POST') },
    }])
    expect(result.skipped).toEqual([])
    expect(result.admitted).toHaveLength(1)
    const source = JSON.parse(result.admitted[0]!.sourceImportJson)
    expect(source.contract.dataUse).toMatchObject([{ inputPointer: '/body', phase: 'preparation' }])
    expect(result.admitted[0]?.binding.adapter.config.bodyPointer).toBe('/body')
  })
  it('admits explicitly empty GET inputs', () => {
    expect(admitBazaarDiscoveryInfo({}, { input: { type: 'http', method: 'GET', queryParams: {} }, output: undefined })).toMatchObject({ kind: 'admitted', query: [] })
    expect(prepareX402Request(endpoint, { method: 'GET', query: [] }, '{}').kind).toBe('prepared')
  })
})

// Wire fixture from pinned @coinbase/cdp-sdk 1.55.0 server-extensions.js.
// Its server barrel loads optional Solana dependencies absent from this app.
function minimalCdpDeclaration(method: string) {
  const body = method === 'POST'
  return { info: { input: { type: 'http', method, ...(body ? { bodyType: 'json', body: {} } : {}) } },
    schema: { properties: { input: { type: 'object', properties: {
      type: { type: 'string', const: 'http' }, method: { type: 'string', enum: [method] },
      ...(body ? { bodyType: { type: 'string', enum: ['json'] }, body: { type: 'object' } } : {}),
    }, required: body ? ['type', 'method', 'bodyType', 'body'] : ['type', 'method'], additionalProperties: false } } }, routeTemplate: '/tool' }
}
