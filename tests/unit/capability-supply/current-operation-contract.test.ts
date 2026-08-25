import { describe, expect, it } from 'vitest'

import {
  createCurrentOperationCommitment,
  createCurrentOperationCommitmentFromMaterial,
  currentOperationReadResult,
  type CurrentOperationCommitment,
  type CurrentOperationCommitmentMaterial,
} from '@/modules/capability-supply/current-operation'
import {
  capabilityBindingRegistrationHash,
  capabilityOfferingRegistrationHash,
  createPublicOperationRef,
  type PublishedOperation,
} from '@/modules/capability-supply/public'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import type { StableHashValue } from '@/modules/common/stable-hash'
import { pricingConfigDigest } from '@/modules/money/public'
import { buildDevelopmentPublishedOperationEvidence } from '../../../tools/dev/fixtures/capability-supply/development-published-operation-evidence'

function fixture(): Readonly<{ operationRef: string; operation: PublishedOperation }> {
  const operation = buildDevelopmentPublishedOperationEvidence().operation
  return {
    operation,
    operationRef: createPublicOperationRef({
      operationId: operation.operationId,
      publicationRef: operation.identity.publicationRef,
      publicationRevision: operation.identity.publicationRevision,
      contractRef: operation.contract.ref,
    }),
  }
}

function changed(
  mutate: (operation: MutableOperation) => void,
): Readonly<{ operationRef: string; operation: PublishedOperation }> {
  const operation = structuredClone(fixture().operation) as MutableOperation
  mutate(operation)
  seal(operation)
  return {
    operation,
    operationRef: createPublicOperationRef({
      operationId: operation.operationId,
      publicationRef: operation.identity.publicationRef,
      publicationRevision: operation.identity.publicationRevision,
      contractRef: operation.contract.ref,
    }),
  }
}

type MutableOperation = PublishedOperation extends Readonly<infer Value> ? {
  -readonly [Key in keyof Value]: Mutable<Value[Key]>
} : never
type Mutable<Value> = Value extends readonly (infer Item)[]
  ? Mutable<Item>[]
  : Value extends object
    ? { -readonly [Key in keyof Value]: Mutable<Value[Key]> }
    : Value

function seal(operation: MutableOperation): void {
  const { ref: _oldRef, ...contractDocument } = operation.contract
  operation.contract.ref = {
    capabilityId: operation.contract.capabilityId,
    version: operation.contract.version,
    contractDigest: canonicalDigest(contractDocument as StableHashValue),
  }
  operation.offering.contractRef = { ...operation.contract.ref }
  operation.binding.contractRef = { ...operation.contract.ref }
  operation.identity.contractId = operation.contract.ref.capabilityId
  operation.identity.contractVersion = operation.contract.ref.version
  operation.identity.contractDigest = operation.contract.ref.contractDigest
  operation.identity.offeringDigest = capabilityOfferingRegistrationHash(operation.offering)
  operation.identity.bindingDigest = capabilityBindingRegistrationHash(operation.binding, operation.transport)
  operation.identity.price = structuredClone(operation.offering.presentation.price)
  operation.identity.materialTerms = structuredClone(operation.offering.presentation.materialTerms)
  operation.identity.pricingConfig = structuredClone(operation.pricingConfig)
  operation.priceDigest = pricingConfigDigest(operation.pricingConfig)
  operation.identity.priceDigest = operation.priceDigest
  operation.identity.transportConfigDigest = operation.transport.configDigest
  Object.assign(operation.identity, { runtimeEnvironment: operation.runtimeEnvironment })
  const operationRef = createPublicOperationRef({
    operationId: operation.operationId,
    publicationRef: operation.identity.publicationRef,
    publicationRevision: operation.identity.publicationRevision,
    contractRef: operation.contract.ref,
  })
  if (operation.binding.authority.kind === 'provider_connection') {
    if (operation.connectionAuthority === undefined || operation.identity.connectionAuthority === undefined) {
      throw new Error('test_provider_authority_missing')
    }
    operation.connectionAuthority.operationRef = operationRef
    operation.identity.connectionAuthority = structuredClone(operation.connectionAuthority)
  }
  operation.materialDigest = canonicalDigest(operation.identity as StableHashValue)
}

function commitment(input = fixture()): CurrentOperationCommitment {
  return createCurrentOperationCommitment(input)
}

function neutralMaterial(): CurrentOperationCommitmentMaterial {
  const { currentDigest: _currentDigest, ...material } = structuredClone(commitment())
  return material
}

describe('current Operation commitment contract', () => {
  it('is deterministic, immutable, and agrees with the exact PublicOperationRef material', () => {
    const first = commitment()
    const second = commitment()
    expect(first).toEqual(second)
    expect(first.currentDigest).toBe(second.currentDigest)
    expect(first.operationRef).toBe(fixture().operationRef)
    expect(Object.isFrozen(first)).toBe(true)
    expect(Object.isFrozen(first.readiness)).toBe(true)
  })

  it('uses the identical digest algorithm through the strict and neutral builders', () => {
    const strict = commitment()
    const { currentDigest: _currentDigest, ...material } = strict
    expect(createCurrentOperationCommitmentFromMaterial(material)).toEqual(strict)
  })

  it('is JSON serializable and excludes endpoint, config, credentials, scopes, and resources', () => {
    const serialized = JSON.stringify(commitment())
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
  ] as const)('builds the same neutral commitment shape for %s price', (_label, price) => {
    const material = neutralMaterial()
    const { priceAuthorityDigest: _priceAuthorityDigest, ...commercial } = material.commercial
    const result = createCurrentOperationCommitmentFromMaterial({
      ...material,
      commercial: {
        ...commercial,
        price,
        priceDigest: canonicalDigest(price),
      },
    })
    expect(result.commercial.price).toEqual(price)
    expect(result.commercial.priceDigest).toBe(canonicalDigest(price))
    expect(result.currentDigest).not.toBe(commitment().currentDigest)
  })

  it('commits an unavailable current row without inventing a readiness window', () => {
    const material = neutralMaterial()
    const result = createCurrentOperationCommitmentFromMaterial({
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

  it('classifies a commitment with typed unavailability as unavailable with that commitment', () => {
    const material = neutralMaterial()
    const unavailable = createCurrentOperationCommitmentFromMaterial({
      ...material,
      readiness: {
        qualificationDigest: material.readiness.qualificationDigest,
        evidenceDigest: material.readiness.evidenceDigest,
        unavailableReason: 'temporarily_unavailable',
      },
    })
    expect(currentOperationReadResult(unavailable)).toEqual({
      kind: 'unavailable',
      reason: 'temporarily_unavailable',
      commitment: unavailable,
    })
  })

  it('classifies a commitment with a complete current window only as current', () => {
    const current = commitment()
    expect(currentOperationReadResult(current)).toEqual({ kind: 'current', commitment: current })
  })

  it('fails closed when a row has neither a complete readiness window nor typed unavailability', () => {
    const material = neutralMaterial()
    expect(() => createCurrentOperationCommitmentFromMaterial({
      ...material,
      readiness: {
        qualificationDigest: material.readiness.qualificationDigest,
        evidenceDigest: material.readiness.evidenceDigest,
      },
    })).toThrow('current_operation_not_exact')
  })

  it.each([
    ['publication revision', (operation: MutableOperation) => { operation.identity.publicationRevision += 1 }],
    ['price', (operation: MutableOperation) => {
      if (operation.pricingConfig.paidAmount === undefined) throw new Error('test_price_missing')
      operation.pricingConfig.paidAmount.units = '2'
      if (operation.offering.presentation.price.kind !== 'fixed') throw new Error('test_fixed_price_missing')
      operation.offering.presentation.price.amount.units = '2'
    }],
    ['effects', (operation: MutableOperation) => {
      operation.contract.effects[0]!.reversibility = 'reversible'
    }],
    ['readiness window', (operation: MutableOperation) => { operation.readiness.validUntil += 1 }],
    ['qualification', (operation: MutableOperation) => {
      operation.readiness.qualificationDigest = canonicalDigest({ qualification: 'changed' })
    }],
    ['runtime environment', (operation: MutableOperation) => { operation.runtimeEnvironment = 'production' }],
    ['transport authority', (operation: MutableOperation) => {
      const config = JSON.parse(operation.transport.configJson) as Record<string, unknown>
      config.requestTimeoutMs = 5_001
      operation.transport.configJson = JSON.stringify(config)
      operation.transport.configDigest = canonicalDigest(config)
      operation.binding.adapter.config = config as MutableOperation['binding']['adapter']['config']
    }],
    ['provider authority', (operation: MutableOperation) => {
      if (operation.connectionAuthority === undefined) throw new Error('test_provider_authority_missing')
      operation.connectionAuthority.authorityGeneration += 1
      operation.connectionAuthority.authorityDigest = canonicalDigest({ authority: 'changed' })
    }],
  ] as const)('changes the pinned digest independently for %s', (_label, mutate) => {
    expect(commitment(changed(mutate)).currentDigest).not.toBe(commitment().currentDigest)
  })

  it('fails closed when the supplied Operation ref drifts', () => {
    expect(() => commitment({ ...fixture(), operationRef: `${fixture().operationRef}:drift` }))
      .toThrow('current_operation_not_exact')
  })

  it('fails closed when published material is mutated without a matching material digest', () => {
    const value = structuredClone(fixture().operation) as MutableOperation
    value.identity.publicationRevision += 1
    expect(() => commitment({ operation: value, operationRef: fixture().operationRef }))
      .toThrow('current_operation_not_exact')
  })

  it('fails closed when price facts drift between the publication and offering', () => {
    const value = structuredClone(fixture().operation) as MutableOperation
    if (value.offering.presentation.price.kind !== 'fixed') throw new Error('test_fixed_price_missing')
    value.offering.presentation.price.amount.units = '99'
    expect(() => commitment({ operation: value, operationRef: fixture().operationRef }))
      .toThrow('current_operation_not_exact')
  })

  it('fails closed when a coherently resealed operationId is not derived from the contract capability', () => {
    expect(() => commitment(changed((operation) => { operation.operationId = 'capability:drifted' })))
      .toThrow('current_operation_not_exact')
  })

  it('fails closed when a coherently resealed binding points at another offering', () => {
    expect(() => commitment(changed((operation) => { operation.binding.offeringId = 'offering:other' })))
      .toThrow('current_operation_not_exact')
  })

  it('keeps the PublishedOperation Call adapter strict to fixed pricing', () => {
    expect(() => commitment(changed((operation) => {
      operation.offering.presentation.price = { kind: 'on_request' }
    }))).toThrow('current_operation_not_exact')
  })
})
