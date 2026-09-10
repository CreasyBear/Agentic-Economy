import { describe, expect, it } from 'vitest'

import {
  createCurrentToolQuote,
  createCurrentToolQuoteFromMaterial,
  currentToolReadResult,
  type CurrentToolQuote,
  type CurrentToolQuoteMaterial,
} from '@/modules/capability-supply/current-tool'
import {
  capabilityBindingRegistrationHash,
  capabilityOfferingRegistrationHash,
  createPublicToolRef,
  publishedToolIdentityDigest,
  type PublishedTool,
} from '@/modules/capability-supply/public'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import type { StableHashValue } from '@/modules/common/stable-hash'
import { pricingConfigDigest } from '@/modules/money/public'
import { buildDevelopmentPublishedToolEvidence } from '../../../tools/dev/fixtures/capability-supply/development-published-tool-evidence'

function fixture(): Readonly<{ toolRef: string; tool: PublishedTool }> {
  const tool = buildDevelopmentPublishedToolEvidence().tool
  return {
    tool,
    toolRef: createPublicToolRef({
      operationId: tool.operationId,
      publicationRef: tool.identity.publicationRef,
      publicationRevision: tool.identity.publicationRevision,
      contractRef: tool.contract.ref,
    }),
  }
}

function changed(
  mutate: (tool: MutableTool) => void,
): Readonly<{ toolRef: string; tool: PublishedTool }> {
  const tool = structuredClone(fixture().tool) as MutableTool
  mutate(tool)
  seal(tool)
  return {
    tool,
    toolRef: createPublicToolRef({
      operationId: tool.operationId,
      publicationRef: tool.identity.publicationRef,
      publicationRevision: tool.identity.publicationRevision,
      contractRef: tool.contract.ref,
    }),
  }
}

type MutableTool = PublishedTool extends Readonly<infer Value> ? {
  -readonly [Key in keyof Value]: Mutable<Value[Key]>
} : never
type Mutable<Value> = Value extends readonly (infer Item)[]
  ? Mutable<Item>[]
  : Value extends object
    ? { -readonly [Key in keyof Value]: Mutable<Value[Key]> }
    : Value

function seal(tool: MutableTool): void {
  const { ref: _oldRef, ...contractDocument } = tool.contract
  tool.contract.ref = {
    capabilityId: tool.contract.capabilityId,
    version: tool.contract.version,
    contractDigest: canonicalDigest(contractDocument as StableHashValue),
  }
  tool.offering.contractRef = { ...tool.contract.ref }
  tool.binding.contractRef = { ...tool.contract.ref }
  tool.identity.contractId = tool.contract.ref.capabilityId
  tool.identity.contractVersion = tool.contract.ref.version
  tool.identity.contractDigest = tool.contract.ref.contractDigest
  tool.identity.offeringDigest = capabilityOfferingRegistrationHash(tool.offering)
  tool.identity.bindingDigest = capabilityBindingRegistrationHash(tool.binding, tool.transport)
  tool.identity.price = structuredClone(tool.offering.presentation.price)
  tool.identity.materialTerms = structuredClone(tool.offering.presentation.materialTerms)
  tool.identity.pricingConfig = structuredClone(tool.pricingConfig)
  tool.priceDigest = pricingConfigDigest(tool.pricingConfig)
  tool.identity.priceDigest = tool.priceDigest
  tool.identity.transportConfigDigest = tool.transport.configDigest
  Object.assign(tool.identity, { runtimeEnvironment: tool.runtimeEnvironment })
  const toolRef = createPublicToolRef({
    operationId: tool.operationId,
    publicationRef: tool.identity.publicationRef,
    publicationRevision: tool.identity.publicationRevision,
    contractRef: tool.contract.ref,
  })
  if (tool.binding.authority.kind === 'provider_connection') {
    if (tool.connectionAuthority === undefined || tool.identity.connectionAuthority === undefined) {
      throw new Error('test_provider_authority_missing')
    }
    tool.connectionAuthority.toolRef = toolRef
    tool.identity.connectionAuthority = structuredClone(tool.connectionAuthority)
  }
  tool.materialDigest = publishedToolIdentityDigest(tool.identity)
}

function quote(input = fixture()): CurrentToolQuote {
  return createCurrentToolQuote(input)
}

function neutralMaterial(): CurrentToolQuoteMaterial {
  const { currentDigest: _currentDigest, ...material } = structuredClone(quote())
  return material
}

describe('current Tool Quote contract', () => {
  it('is deterministic, immutable, and agrees with the exact PublicToolRef material', () => {
    const first = quote()
    const second = quote()
    expect(first).toEqual(second)
    expect(first.currentDigest).toBe(second.currentDigest)
    expect(first.toolRef).toBe(fixture().toolRef)
    expect(Object.isFrozen(first)).toBe(true)
    expect(Object.isFrozen(first.readiness)).toBe(true)
  })

  it('uses the identical digest algorithm through the strict and neutral builders', () => {
    const strict = quote()
    const { currentDigest: _currentDigest, ...material } = strict
    expect(createCurrentToolQuoteFromMaterial(material)).toEqual(strict)
  })

  it('is JSON serializable and excludes endpoint, config, credentials, scopes, and resources', () => {
    const serialized = JSON.stringify(quote())
    expect(() => JSON.parse(serialized)).not.toThrow()
    for (const secretBearingField of [
      'endpoint', 'endpointUrl', 'configJson', 'credential', 'grantedScopes', 'grantedResources',
    ]) expect(serialized).not.toContain(secretBearingField)
    expect(serialized).not.toContain('provider.example')
  })

  it.each([
    ['zero fixed', { kind: 'fixed', amount: { currency: 'USD', units: '0', exponent: 2 } }],
    ['fixed', { kind: 'fixed', amount: { currency: 'USD', units: '200', exponent: 2 } }],
    ['range', {
      kind: 'range',
      minimum: { currency: 'USD', units: '100', exponent: 2 },
      maximum: { currency: 'USD', units: '500', exponent: 2 },
    }],
    ['on request', { kind: 'on_request' }],
  ] as const)('builds the same neutral Tool Quote shape for %s price', (_label, price) => {
    const material = neutralMaterial()
    const { priceAuthorityDigest: _priceAuthorityDigest, ...commercial } = material.commercial
    const result = createCurrentToolQuoteFromMaterial({
      ...material,
      commercial: {
        ...commercial,
        price,
        priceDigest: canonicalDigest(price),
      },
    })
    expect(result.commercial.price).toEqual(price)
    expect(result.commercial.priceDigest).toBe(canonicalDigest(price))
    expect(result.currentDigest).not.toBe(quote().currentDigest)
  })

  it('commits an unavailable current row without inventing a readiness window', () => {
    const material = neutralMaterial()
    const result = createCurrentToolQuoteFromMaterial({
      ...material,
      readiness: {
        qualificationDigest: material.readiness.qualificationDigest,
        evidenceDigest: material.readiness.evidenceDigest,
        unavailableReason: 'setup_required',
      },
      providerAuthority: {
        kind: 'provider_connection',
        connectionRef: 'connection:pending',
        providerRef: 'provider:pending',
      },
    })
    expect(result.readiness).toEqual({
      qualificationDigest: material.readiness.qualificationDigest,
      evidenceDigest: material.readiness.evidenceDigest,
      unavailableReason: 'setup_required',
    })
  })

  it('classifies a Tool Quote with typed unavailability as unavailable with that Tool Quote', () => {
    const material = neutralMaterial()
    const unavailable = createCurrentToolQuoteFromMaterial({
      ...material,
      readiness: {
        qualificationDigest: material.readiness.qualificationDigest,
        evidenceDigest: material.readiness.evidenceDigest,
        unavailableReason: 'temporarily_unavailable',
      },
    })
    expect(currentToolReadResult(unavailable)).toEqual({
      kind: 'unavailable',
      reason: 'temporarily_unavailable',
      quote: unavailable,
    })
  })

  it('classifies a Tool Quote with a complete current window only as current', () => {
    const current = quote()
    expect(currentToolReadResult(current)).toEqual({ kind: 'current', quote: current })
  })

  it('fails closed when a row has neither a complete readiness window nor typed unavailability', () => {
    const material = neutralMaterial()
    expect(() => createCurrentToolQuoteFromMaterial({
      ...material,
      readiness: {
        qualificationDigest: material.readiness.qualificationDigest,
        evidenceDigest: material.readiness.evidenceDigest,
      },
    })).toThrow('current_tool_not_exact')
  })

  it.each([
    ['publication revision', (tool: MutableTool) => { tool.identity.publicationRevision += 1 }],
    ['price', (tool: MutableTool) => {
      if (tool.pricingConfig.kind !== 'fixed_aud') throw new Error('test_fixed_price_missing')
      tool.pricingConfig.amountUnits = '2000000'
      tool.offering.presentation.price = {
        kind: 'fixed',
        amount: { currency: 'AUD', units: '2000000', exponent: 6 },
      }
    }],
    ['effects', (tool: MutableTool) => {
      tool.contract.effects[0]!.reversibility = 'reversible'
    }],
    ['readiness window', (tool: MutableTool) => { tool.readiness.validUntil += 1 }],
    ['qualification', (tool: MutableTool) => {
      tool.readiness.qualificationDigest = canonicalDigest({ qualification: 'changed' })
    }],
    ['runtime environment', (tool: MutableTool) => { tool.runtimeEnvironment = 'production' }],
    ['transport authority', (tool: MutableTool) => {
      const config = JSON.parse(tool.transport.configJson) as Record<string, unknown>
      config.requestTimeoutMs = 5_001
      tool.transport.configJson = JSON.stringify(config)
      tool.transport.configDigest = canonicalDigest(config)
      tool.binding.adapter.config = config as MutableTool['binding']['adapter']['config']
    }],
    ['provider authority', (tool: MutableTool) => {
      if (tool.connectionAuthority === undefined) throw new Error('test_provider_authority_missing')
      tool.connectionAuthority.authorityGeneration += 1
      tool.connectionAuthority.authorityDigest = canonicalDigest({ authority: 'changed' })
    }],
  ] as const)('changes the pinned digest independently for %s', (_label, mutate) => {
    expect(quote(changed(mutate)).currentDigest).not.toBe(quote().currentDigest)
  })

  it('fails closed when the supplied Tool ref drifts', () => {
    expect(() => quote({ ...fixture(), toolRef: `${fixture().toolRef}:drift` }))
      .toThrow('current_tool_not_exact')
  })

  it('fails closed when published material is mutated without a matching material digest', () => {
    const value = structuredClone(fixture().tool) as MutableTool
    value.identity.publicationRevision += 1
    expect(() => quote({ tool: value, toolRef: fixture().toolRef }))
      .toThrow('current_tool_not_exact')
  })

  it('fails closed when price facts drift between the publication and offering', () => {
    const value = structuredClone(fixture().tool) as MutableTool
    const price = value.offering.presentation.price
    if (price === undefined || price.kind !== 'fixed') throw new Error('test_fixed_price_missing')
    price.amount.units = '99'
    expect(() => quote({ tool: value, toolRef: fixture().toolRef }))
      .toThrow('current_tool_not_exact')
  })

  it('fails closed when a coherently resealed operationId is not derived from the contract capability', () => {
    expect(() => quote(changed((tool) => { tool.operationId = 'capability:drifted' })))
      .toThrow('current_tool_not_exact')
  })

  it('fails closed when a coherently resealed binding points at another offering', () => {
    expect(() => quote(changed((tool) => { tool.binding.offeringId = 'offering:other' })))
      .toThrow('current_tool_not_exact')
  })

  it('keeps the PublishedTool Call adapter strict to fixed pricing', () => {
    expect(() => quote(changed((tool) => {
      tool.offering.presentation.price = { kind: 'on_request' }
    }))).toThrow('current_tool_not_exact')
  })
})
