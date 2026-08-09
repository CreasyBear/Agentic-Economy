import { describe, expect, it, vi } from 'vitest'
import { createTestOperationLineage } from '../../helpers/customer-request-lineage'
import {
  defineCapabilityContract,
  openCapabilityDecisionModel,
  projectCapabilityInputValueSchema,
} from '@/modules/capability-contract/public'
import {
  createConfiguredRequestInterpreter,
  classifyCapabilityDomain,
  classifyCustomerQueryDomain,
  domainAppropriatePool,
  isObservedListing,
  routeablePool,
} from '@/modules/customer-request/application/interpret-compile'
import { bindCustomerCapabilityDescriptor } from '@/modules/customer-request/semantic-interpreter'
import { capabilityContractV2 } from '@/../tests/fixtures/capability-contract-v2'

const COINGECKO = { name: 'CoinGecko simple price', description: 'Returns current market prices for one or more crypto ids against requested fiat currencies through the keyless CoinGecko simple/price endpoint.' }
const FRANKFURTER = { name: 'Frankfurter ECB single-pair rate', description: 'Returns one current European Central Bank reference rate through the public Frankfurter v2 API.' }
const BIZINTEL = { name: 'Bizintel forex rate (x402, observed)', description: 'Observed Agentic Market x402 forex-rate listing; AE does not execute or pay it.' }
const FORECAST = { name: 'Open-Meteo weather forecast', description: 'Returns a public weather forecast for a latitude/longitude through the keyless Open-Meteo API.' }
const GEOCODING = { name: 'Open-Meteo geocoding search', description: 'Searches place names and returns matching coordinates and metadata through the keyless Open-Meteo geocoding API.' }

describe('customer request domain classification', () => {
  it('classifies the request domain deterministically', () => {
    expect(classifyCustomerQueryDomain('bitcoin price in usd')).toBe('crypto')
    expect(classifyCustomerQueryDomain('ethereum price')).toBe('crypto')
    expect(classifyCustomerQueryDomain('doge to usd')).toBe('crypto')
    expect(classifyCustomerQueryDomain('convert EUR to USD')).toBe('fiat_fx')
    expect(classifyCustomerQueryDomain('usd to jpy')).toBe('fiat_fx')
    expect(classifyCustomerQueryDomain('what is the weather in Paris')).toBe('none')
    expect(classifyCustomerQueryDomain('geocode Paris')).toBe('none')
    expect(classifyCustomerQueryDomain('search the web for batteries')).toBe('none')
  })

  it('classifies the capability domain from its surfaced contract text', () => {
    expect(classifyCapabilityDomain(COINGECKO)).toBe('crypto')
    expect(classifyCapabilityDomain(FRANKFURTER)).toBe('fiat_fx')
    expect(classifyCapabilityDomain(BIZINTEL)).toBe('fiat_fx')
    expect(classifyCapabilityDomain(FORECAST)).toBe('none')
    expect(classifyCapabilityDomain(GEOCODING)).toBe('none')
  })

  it('marks observed x402 listings as not directly routeable', () => {
    expect(isObservedListing(BIZINTEL)).toBe(true)
    expect(isObservedListing(FRANKFURTER)).toBe(false)
    expect(isObservedListing(COINGECKO)).toBe(false)
  })

  it('honors a declared data-driven domain over inferred contract text', () => {
    const declaredFiat = { ...FRANKFURTER, domain: 'fiat_fx' as const }
    const declaredCrypto = { ...COINGECKO, domain: 'crypto' as const }
    expect(classifyCapabilityDomain(declaredFiat)).toBe('fiat_fx')
    expect(classifyCapabilityDomain(declaredCrypto)).toBe('crypto')
  })

  it('classifies the capability domain from its declared registry searchTerms (data-driven surface)', () => {
    // The registry-taught vocabulary (offering searchTerms declared on the curated catalog source)
    // is authoritative for the cross-cap guard, not free-text description regex alone.
    const crypto = capability('coingecko.simple-price', COINGECKO.name, 'A doc-only capability with an ambiguous description.', ['bitcoin price', 'crypto price'])
    const fiat = capability('frankfurter.single-rate', 'Some rate endpoint', 'A doc-only capability with an ambiguous description.', ['exchange rates', 'ecb rates', 'currency conversion'])
    const plain = capability('open-meteo.forecast', FORECAST.name, FORECAST.description, ['weather', 'forecast'])
    expect(classifyCapabilityDomain(crypto.descriptor)).toBe('crypto')
    expect(classifyCapabilityDomain(fiat.descriptor)).toBe('fiat_fx')
    expect(classifyCapabilityDomain(plain.descriptor)).toBe('none')
  })
})

describe('domain-appropriate pool curation', () => {
  const pool = connectorDescriptors([
    { name: COINGECKO.name, description: COINGECKO.description },
    { name: FRANKFURTER.name, description: FRANKFURTER.description },
    { name: BIZINTEL.name, description: BIZINTEL.description },
    { name: FORECAST.name, description: FORECAST.description },
    { name: GEOCODING.name, description: GEOCODING.description },
  ])

  it('drops the fiat-only ops for a crypto query but keeps crypto', () => {
    const curated = domainAppropriatePool(pool, 'bitcoin price in usd')
    const names = curated.map((descriptor) => descriptor.name)
    expect(names).toContain('CoinGecko simple price')
    expect(names).not.toContain('Frankfurter ECB single-pair rate')
    expect(names).not.toContain('Bizintel forex rate (x402, observed)')
    expect(names).toContain('Open-Meteo weather forecast')
  })

  it('drops crypto for a fiat-pair query but keeps the fiat ops', () => {
    const curated = domainAppropriatePool(pool, 'convert EUR to USD')
    const names = curated.map((descriptor) => descriptor.name)
    expect(names).not.toContain('CoinGecko simple price')
    expect(names).toContain('Frankfurter ECB single-pair rate')
  })

  it('keeps the whole pool when the request domain is none', () => {
    const curated = domainAppropriatePool(pool, 'what is the weather in Paris')
    expect(curated).toHaveLength(pool.length)
  })
})

describe('live composite recovery + cross-capability guard', () => {
  // searchTerms mirror the real registry offering (coinGecko's searchTerms include the asset
  // phrases), and are surfaced on the server descriptor so the deterministic recovery can match
  // the same vocabulary discovery uses.
  const crypto = capability('coingecko.simple-price', COINGECKO.name, COINGECKO.description, ['bitcoin price', 'ethereum price', 'crypto price'])
  const fiat = capability('frankfurter.single-rate', FRANKFURTER.name, FRANKFURTER.description)
  const geocode = capability('open-meteo.geocoding', GEOCODING.name, GEOCODING.description, ['geocode', 'geocoding', 'place search'])

  it('recovers a crypto candidate when the model returns zero selections', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      choices: [{ message: { role: 'assistant', content: JSON.stringify({
        kind: 'capability_candidates', reason: '', prompt: '',
        canonicalStatements: [], supersededStatements: [], selections: [],
      }) }, finish_reason: 'stop' }],
    }), { status: 200 })))

    try {
      const proposal = await createConfiguredRequestInterpreter({
        openRouterApiKey: 'sk-test', modelName: 'test/model', maximumDescriptorBytes: 64_000,
      }).propose({ customerJob: 'bitcoin price in usd', capabilities: [fiat.descriptor, crypto.descriptor], finalAttempt: true })

      expect(proposal).toMatchObject({
        kind: 'capability_candidates',
        selections: [{ selectionKey: crypto.model.selectionKey, facts: [] }],
      })
      expect(proposal).not.toMatchObject({ selections: [{ selectionKey: fiat.model.selectionKey }] })
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('refuses the fiat-only op a model over-selects for a crypto query and recovers crypto', async () => {
    // The model returns a confident Frankfurter selection for a crypto query. The guard must
    // never surface it: it is culled from the curated pool, and recovery lands on CoinGecko.
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      choices: [{ message: { role: 'assistant', content: JSON.stringify({
        kind: 'capability_candidates', reason: '', prompt: '',
        canonicalStatements: [], supersededStatements: [],
        selections: [{ operationRef: fiat.descriptor.operationRef, selectionKey: fiat.model.selectionKey, facts: [] }],
      }) }, finish_reason: 'stop' }],
    }), { status: 200 })))

    try {
      const proposal = await createConfiguredRequestInterpreter({
        openRouterApiKey: 'sk-test', modelName: 'test/model', maximumDescriptorBytes: 64_000,
      }).propose({ customerJob: 'ethereum price', capabilities: [fiat.descriptor, crypto.descriptor], finalAttempt: true })

      expect(proposal).toMatchObject({
        kind: 'capability_candidates',
        selections: [{ selectionKey: crypto.model.selectionKey }],
      })
      expect(proposal).not.toMatchObject({ selections: [{ selectionKey: fiat.model.selectionKey }] })
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('recovers the geocoding op for a geocode request when the model returns zero selections', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      choices: [{ message: { role: 'assistant', content: JSON.stringify({
        kind: 'capability_candidates', reason: '', prompt: '',
        canonicalStatements: [], supersededStatements: [], selections: [],
      }) }, finish_reason: 'stop' }],
    }), { status: 200 })))

    try {
      const proposal = await createConfiguredRequestInterpreter({
        openRouterApiKey: 'sk-test', modelName: 'test/model', maximumDescriptorBytes: 64_000,
      }).propose({ customerJob: 'geocode Paris', capabilities: [geocode.descriptor, fiat.descriptor], finalAttempt: true })

      expect(proposal).toMatchObject({
        kind: 'capability_candidates',
        selections: [{ selectionKey: geocode.model.selectionKey, facts: [] }],
      })
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('prefers a directly-routeable op over an observed x402 listing', async () => {
    const real = capability('frankfurter.single-rate', 'Frankfurter ECB single-pair rate', 'Returns one current European Central Bank reference rate through the public Frankfurter v2 API.')
    const observed = capability('bizintel.x402', 'Bizintel forex rate (x402, observed)', 'Observed Agentic Market x402 forex-rate listing; AE does not execute or pay it.')
    const curated = routeablePool([observed.descriptor, real.descriptor])
    expect(curated.map((d) => d.selectionKey)).toEqual([real.descriptor.selectionKey])
  })

  it('surfaces a typed needs_information ask when the model declines and nothing deterministically matches', async () => {
    // 'convert money' is ambiguous: discovery may surface a fiat op, but no leg can confidently
    // map it. stopWhen says 'no tool call' is non-terminal, so we surface an ask, not a wrong pick.
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      choices: [{ message: { role: 'assistant', content: JSON.stringify({
        kind: 'capability_candidates', reason: '', prompt: '',
        canonicalStatements: [], supersededStatements: [], selections: [],
      }) }, finish_reason: 'stop' }],
    }), { status: 200 })))

    try {
      const proposal = await createConfiguredRequestInterpreter({
        openRouterApiKey: 'sk-test', modelName: 'test/model', maximumDescriptorBytes: 64_000,
      }).propose({ customerJob: 'convert money', capabilities: [fiat.descriptor], finalAttempt: true })
      expect(proposal).toMatchObject({ kind: 'needs_intent_direction' })
      if (proposal.kind === 'needs_intent_direction') {
        expect(proposal.prompt.length).toBeGreaterThan(0)
      }
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('deterministically recovers the fiat op for a literal fiat pair when the model returns zero selections', async () => {
    // 'convert EUR to USD' names a literal ISO pair, so its domain is fiat_fx. When the model
    // (and the token matcher) skip it, the deterministic FX recovery must land on Frankfurter
    // rather than collapsing to an empty plan or needs_intent_direction.
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      choices: [{ message: { role: 'assistant', content: JSON.stringify({
        kind: 'capability_candidates', reason: '', prompt: '',
        canonicalStatements: [], supersededStatements: [], selections: [],
      }) }, finish_reason: 'stop' }],
    }), { status: 200 })))

    try {
      const proposal = await createConfiguredRequestInterpreter({
        openRouterApiKey: 'sk-test', modelName: 'test/model', maximumDescriptorBytes: 64_000,
      }).propose({ customerJob: 'convert EUR to USD', capabilities: [crypto.descriptor, fiat.descriptor], finalAttempt: true })

      expect(proposal).toMatchObject({
        kind: 'capability_candidates',
        selections: [{ selectionKey: fiat.model.selectionKey, facts: [] }],
      })
      expect(proposal).not.toMatchObject({ selections: [{ selectionKey: crypto.model.selectionKey }] })
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('does not treat the ambiguous "convert money" as a fiat pair needing FX recovery', async () => {
    // 'convert money' names no fiat code, so its domain is 'none'; the deterministic FX recovery
    // must not grab Frankfurter for it. The honest outcome is a typed needs_information ask.
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      choices: [{ message: { role: 'assistant', content: JSON.stringify({
        kind: 'capability_candidates', reason: '', prompt: '',
        canonicalStatements: [], supersededStatements: [], selections: [],
      }) }, finish_reason: 'stop' }],
    }), { status: 200 })))

    try {
      const proposal = await createConfiguredRequestInterpreter({
        openRouterApiKey: 'sk-test', modelName: 'test/model', maximumDescriptorBytes: 64_000,
      }).propose({ customerJob: 'convert money', capabilities: [crypto.descriptor, fiat.descriptor], finalAttempt: true })

      expect(proposal).toMatchObject({ kind: 'needs_intent_direction' })
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('keeps a valid fiat selection for a currency-pair request', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      choices: [{ message: { role: 'assistant', content: JSON.stringify({
        kind: 'capability_candidates', reason: '', prompt: '',
        canonicalStatements: [], supersededStatements: [],
        selections: [{ operationRef: fiat.descriptor.operationRef, selectionKey: fiat.model.selectionKey, facts: [] }],
      }) }, finish_reason: 'stop' }],
    }), { status: 200 })))

    try {
      const proposal = await createConfiguredRequestInterpreter({
        openRouterApiKey: 'sk-test', modelName: 'test/model', maximumDescriptorBytes: 64_000,
      }).propose({ customerJob: 'convert EUR to USD', capabilities: [fiat.descriptor, crypto.descriptor], finalAttempt: true })

      expect(proposal).toMatchObject({
        kind: 'capability_candidates',
        selections: [{ selectionKey: fiat.model.selectionKey }],
      })
    } finally {
      vi.unstubAllGlobals()
    }
  })
})

function capability(capabilityId: string, name: string, description: string, searchTerms?: readonly string[]) {
  const document = capabilityContractV2({ capabilityId, name, description, inputSchema: requestInputSchema() })
  const model = openCapabilityDecisionModel(defineCapabilityContract(document))
  return {
    model,
    descriptor: bindCustomerCapabilityDescriptor({
      operationRef: createTestOperationLineage(model.contractRef).operationRef,
      contractRef: model.contractRef,
      selectionKey: model.selectionKey,
      name,
      description,
      inputs: model.inputs,
      valueSchemas: model.inputs.map((input) => ({
        inputKey: input.key,
        valueSchema: projectCapabilityInputValueSchema(requestInputSchema(), input),
      })),
      evidence: model.evidence.map(({ label, purpose, schemaIdentity }) => ({ label, purpose, schemaIdentity })),
      ...(searchTerms === undefined ? {} : { searchTerms }),
    }),
  }
}

function connectorDescriptors(specs: readonly { name: string; description: string }[]) {
  return specs.map((spec, index) => capability(`cap.${index}`, spec.name, spec.description).descriptor)
}

function requestInputSchema() {
  return {
    $schema: 'https://json-schema.org/draft/2020-12/schema', type: 'object',
    properties: { request: { type: 'string', minLength: 1 } },
    required: ['request'], additionalProperties: false,
  }
}
