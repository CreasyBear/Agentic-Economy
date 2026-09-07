import { canonicalDigest } from '@/modules/common/canonical-digest'
import {
  currentToolQuotesMatch,
  currentToolDigest,
  currentToolDigestFromSnapshot,
} from '@/modules/capability-execution/current-tool-quote'
import {
  capabilityOfferingRegistrationHash,
  createPublicToolRef,
  publishedToolIdentityDigest,
  type PublishedTool,
} from '@/modules/capability-supply/public'
import { buildDevelopmentPublishedToolEvidence } from '../../../tools/dev/fixtures/capability-supply/development-published-tool-evidence'
import { describe, expect, it } from 'vitest'

function toolRef(tool: PublishedTool): string {
  return createPublicToolRef({
    operationId: tool.operationId,
    publicationRef: tool.identity.publicationRef,
    publicationRevision: tool.identity.publicationRevision,
    contractRef: tool.contract.ref,
  })
}

function withReadinessDrift(tool: PublishedTool): PublishedTool {
  return {
    ...tool,
    readiness: {
      ...tool.readiness,
      validUntil: tool.readiness.validUntil + 1_000,
    },
  }
}

function withPriceDrift(tool: PublishedTool): PublishedTool {
  if (tool.identity.price.kind !== 'fixed') throw new Error('fixed-price fixture required')
  const price = {
    kind: 'fixed' as const,
    amount: { ...tool.identity.price.amount, units: '2' },
  }
  const pricingConfig = {
    ...tool.pricingConfig,
    paidAmount: price.amount,
  }
  const offering = {
    ...tool.offering,
    presentation: { ...tool.offering.presentation, price },
  }
  const identity = {
    ...tool.identity,
    price,
    pricingConfig,
    offeringDigest: capabilityOfferingRegistrationHash(offering),
  }
  return {
    ...tool,
    offering,
    pricingConfig,
    identity,
    materialDigest: publishedToolIdentityDigest(identity),
  }
}

describe('current Tool Quote', () => {
  it('recovers the exact admitted currentDigest from durable toolJson', () => {
    const tool = buildDevelopmentPublishedToolEvidence().tool
    const ref = toolRef(tool)
    const digest = currentToolDigest({ toolRef: ref, tool })

    expect(digest).toMatch(/^sha256:[0-9a-f]{64}$/)
    expect(currentToolDigestFromSnapshot({
      toolRef: ref,
      toolJson: JSON.stringify(tool),
    })).toBe(digest)
    expect(currentToolQuotesMatch({
      toolRef: ref,
      pinned: tool,
      current: structuredClone(tool),
    })).toBe(true)
  })

  it.each([
    ['readiness', withReadinessDrift],
    ['price', withPriceDrift],
    ['effects', (tool: PublishedTool): PublishedTool => ({
      ...tool,
      contract: {
        ...tool.contract,
        effects: tool.contract.effects.map((effect, index) => index === 0
          ? { ...effect, authority: effect.authority === 'none' ? 'explicit' : 'none' }
          : effect),
      },
    })],
    ['provider authority', (tool: PublishedTool): PublishedTool => {
      if (tool.connectionAuthority === undefined) throw new Error('fixture authority missing')
      const connectionAuthority = {
        ...tool.connectionAuthority,
        authorityDigest: canonicalDigest({ drift: 'provider-authority' }),
      }
      const identity = {
        ...tool.identity,
        connectionAuthority,
      }
      return {
        ...tool,
        connectionAuthority,
        identity,
        materialDigest: publishedToolIdentityDigest(identity),
      }
    }],
  ])('refuses %s drift from the admitted Tool', (_field, mutate) => {
    const tool = buildDevelopmentPublishedToolEvidence().tool
    const ref = toolRef(tool)

    expect(currentToolQuotesMatch({
      toolRef: ref,
      pinned: tool,
      current: mutate(tool),
    })).toBe(false)
  })

  it('fails closed for corrupt durable snapshots', () => {
    const tool = buildDevelopmentPublishedToolEvidence().tool

    expect(currentToolDigestFromSnapshot({
      toolRef: toolRef(tool),
      toolJson: '{not-json',
    })).toBeUndefined()
  })
})
