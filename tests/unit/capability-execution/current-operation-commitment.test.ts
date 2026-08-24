import { canonicalDigest } from '@/modules/common/canonical-digest'
import type { StableHashValue } from '@/modules/common/stable-hash'
import {
  currentOperationCommitmentsMatch,
  currentOperationDigest,
  currentOperationDigestFromSnapshot,
} from '@/modules/capability-execution/current-operation-commitment'
import {
  capabilityOfferingRegistrationHash,
  createPublicOperationRef,
  type PublishedOperation,
} from '@/modules/capability-supply/public'
import { buildDevelopmentPublishedOperationEvidence } from '../../../tools/dev/fixtures/capability-supply/development-published-operation-evidence'
import { describe, expect, it } from 'vitest'

function operationRef(operation: PublishedOperation): string {
  return createPublicOperationRef({
    operationId: operation.operationId,
    publicationRef: operation.identity.publicationRef,
    publicationRevision: operation.identity.publicationRevision,
    contractRef: operation.contract.ref,
  })
}

function withReadinessDrift(operation: PublishedOperation): PublishedOperation {
  return {
    ...operation,
    readiness: {
      ...operation.readiness,
      validUntil: operation.readiness.validUntil + 1_000,
    },
  }
}

function withPriceDrift(operation: PublishedOperation): PublishedOperation {
  if (operation.identity.price.kind !== 'fixed') throw new Error('fixed-price fixture required')
  const price = {
    kind: 'fixed' as const,
    amount: { ...operation.identity.price.amount, units: '2' },
  }
  const pricingConfig = {
    ...operation.pricingConfig,
    paidAmount: price.amount,
  }
  const offering = {
    ...operation.offering,
    presentation: { ...operation.offering.presentation, price },
  }
  const identity = {
    ...operation.identity,
    price,
    pricingConfig,
    offeringDigest: capabilityOfferingRegistrationHash(offering),
  }
  return {
    ...operation,
    offering,
    pricingConfig,
    identity,
    materialDigest: canonicalDigest(identity as StableHashValue),
  }
}

describe('current Operation commitment', () => {
  it('recovers the exact admitted currentDigest from durable operationJson', () => {
    const operation = buildDevelopmentPublishedOperationEvidence().operation
    const ref = operationRef(operation)
    const digest = currentOperationDigest({ operationRef: ref, operation })

    expect(digest).toMatch(/^sha256:[0-9a-f]{64}$/)
    expect(currentOperationDigestFromSnapshot({
      operationRef: ref,
      operationJson: JSON.stringify(operation),
    })).toBe(digest)
    expect(currentOperationCommitmentsMatch({
      operationRef: ref,
      pinned: operation,
      current: structuredClone(operation),
    })).toBe(true)
  })

  it.each([
    ['readiness', withReadinessDrift],
    ['price', withPriceDrift],
    ['effects', (operation: PublishedOperation): PublishedOperation => ({
      ...operation,
      contract: {
        ...operation.contract,
        effects: operation.contract.effects.map((effect, index) => index === 0
          ? { ...effect, authority: effect.authority === 'none' ? 'explicit' : 'none' }
          : effect),
      },
    })],
    ['provider authority', (operation: PublishedOperation): PublishedOperation => {
      if (operation.connectionAuthority === undefined) throw new Error('fixture authority missing')
      const connectionAuthority = {
        ...operation.connectionAuthority,
        authorityDigest: canonicalDigest({ drift: 'provider-authority' }),
      }
      const identity = {
        ...operation.identity,
        connectionAuthority,
      }
      return {
        ...operation,
        connectionAuthority,
        identity,
        materialDigest: canonicalDigest(identity as StableHashValue),
      }
    }],
  ])('refuses %s drift from the admitted commitment', (_field, mutate) => {
    const operation = buildDevelopmentPublishedOperationEvidence().operation
    const ref = operationRef(operation)

    expect(currentOperationCommitmentsMatch({
      operationRef: ref,
      pinned: operation,
      current: mutate(operation),
    })).toBe(false)
  })

  it('fails closed for corrupt durable snapshots', () => {
    const operation = buildDevelopmentPublishedOperationEvidence().operation

    expect(currentOperationDigestFromSnapshot({
      operationRef: operationRef(operation),
      operationJson: '{not-json',
    })).toBeUndefined()
  })
})
