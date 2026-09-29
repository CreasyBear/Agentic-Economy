import { describe, expect, it } from 'vitest'

import { canonicalDigest } from '@/modules/common/canonical-digest'
import {
  createX402SellerOnboarding,
  transitionX402SellerOnboarding,
  x402SellerIdentityDigest,
  type X402SellerIdentity,
  type X402SellerOnboarding,
  type X402SellerOnboardingCommand,
} from '@/modules/capability-supply/public'

const digest = (value: string) => canonicalDigest({ value })

const identity: X402SellerIdentity = {
  accountRef: 'account:seller',
  businessId: 'business:seller',
  offeringRef: 'offering:weather',
  offeringRevision: 3,
  offeringSourceHash: digest('offering-source'),
  resourceUrl: 'https://weather.example.com/x402/current',
  method: 'POST',
  network: 'eip155:8453',
  asset: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
  payTo: '0x209693Bc6afc0C5328bA36FaF03C514EF312287C',
  providerAmount: '1000',
  scheme: 'exact',
  maxTimeoutSeconds: 60,
  transferMethod: 'eip3009',
  paymentFlow: 'facilitated',
  sourceDigest: digest('source'),
  contractDigest: digest('contract'),
  pricingDigest: digest('pricing'),
}

function created(): X402SellerOnboarding {
  const result = createX402SellerOnboarding({
    kind: 'create',
    commandId: 'command:create',
    onboardingRef: 'x402-onboarding:weather:3',
    identity,
  }, 100)
  if (result.kind !== 'applied') throw new Error(`fixture failed: ${result.kind}`)
  return result.onboarding
}

function apply(
  onboarding: X402SellerOnboarding,
  command: X402SellerOnboardingCommand,
  now: number,
): X402SellerOnboarding {
  const result = transitionX402SellerOnboarding(onboarding, command, now)
  if (result.kind !== 'applied') {
    throw new Error(`transition failed: ${result.kind}:${result.kind === 'refused' ? result.reason : ''}`)
  }
  return result.onboarding
}

function expectedIdentity(onboarding: X402SellerOnboarding) {
  return { expectedIdentityDigest: onboarding.identityDigest }
}

function claim(onboarding: X402SellerOnboarding): X402SellerOnboarding {
  const pending = apply(onboarding, {
    kind: 'request_claim', commandId: 'command:claim:request', ...expectedIdentity(onboarding),
  }, 110)
  return apply(pending, {
    kind: 'record_claim', commandId: 'command:claim:verified', ...expectedIdentity(pending),
    outcome: 'verified', evidenceDigest: digest('claim-proof'),
  }, 120)
}

function admit(onboarding: X402SellerOnboarding): X402SellerOnboarding {
  return apply(onboarding, {
    kind: 'admit', commandId: 'command:admit', ...expectedIdentity(onboarding),
    evidenceDigest: digest('admission-proof'),
  }, 130)
}

describe('x402 seller onboarding lifecycle', () => {
  it('creates a draft sealed to the full seller, Operation, route, payment, and contract identity', () => {
    const onboarding = created()

    expect(onboarding).toMatchObject({
      onboardingRef: 'x402-onboarding:weather:3',
      state: 'draft',
      identity,
      identityDigest: x402SellerIdentityDigest(identity),
      createdAt: 100,
      updatedAt: 100,
    })

    expect(x402SellerIdentityDigest({ ...identity, transferMethod: 'permit2' }))
      .not.toBe(onboarding.identityDigest)
    expect(x402SellerIdentityDigest({ ...identity, paymentFlow: 'direct' }))
      .not.toBe(onboarding.identityDigest)
  })

  it.each([
    '0xnot-an-address',
    '0x0000000000000000000000000000000000000000',
  ])('refuses a seller identity with an unusable EVM payee: %s', (payTo) => {
    expect(() => x402SellerIdentityDigest({ ...identity, payTo }))
      .toThrow('x402_seller_identity_invalid')
  })

  it('replays the same creation and refuses reuse of its command id for another tuple', () => {
    const command = {
      kind: 'create' as const,
      commandId: 'command:create',
      onboardingRef: 'x402-onboarding:weather:3',
      identity,
    }
    const onboarding = created()

    expect(createX402SellerOnboarding(command, 999, onboarding))
      .toEqual({ kind: 'replayed', onboarding })
    expect(createX402SellerOnboarding({
      ...command,
      identity: { ...identity, providerAmount: '2000' },
    }, 999, onboarding)).toEqual({ kind: 'refused', reason: 'operation_key_conflict' })
  })

  it('publishes after a verified ownership claim and admission', () => {
    const published = admit(claim(created()))

    expect(published.state).toBe('published')
  })

  it('allows a failed ownership claim to be retried but never skipped', () => {
    const draft = created()
    const pending = apply(draft, {
      kind: 'request_claim', commandId: 'command:claim:first', ...expectedIdentity(draft),
    }, 110)
    const failed = apply(pending, {
      kind: 'record_claim', commandId: 'command:claim:failed', ...expectedIdentity(pending),
      outcome: 'failed', evidenceDigest: digest('failed-claim'),
    }, 120)
    expect(failed.state).toBe('claim_failed')

    const retried = apply(failed, {
      kind: 'request_claim', commandId: 'command:claim:retry', ...expectedIdentity(failed),
    }, 130)
    expect(retried.state).toBe('claim_pending')

    const skipped = transitionX402SellerOnboarding(draft, {
      kind: 'admit', commandId: 'command:skip-claim', ...expectedIdentity(draft),
      evidenceDigest: digest('admission-proof'),
    }, 140)
    expect(skipped).toEqual({ kind: 'refused', reason: 'invalid_transition' })
  })

  it('invalidates publication on any observed tuple drift without mutating the pinned identity', () => {
    const published = admit(claim(created()))
    const observedIdentity = { ...identity, providerAmount: '2000' }
    const stale = apply(published, {
      kind: 'observe_identity', commandId: 'command:observe:drift',
      ...expectedIdentity(published), observedIdentity,
    }, 160)

    expect(stale.state).toBe('stale')
    expect(stale.identity).toEqual(identity)
    expect(stale.identityDigest).toBe(x402SellerIdentityDigest(identity))
    expect(stale.observedDriftDigest).toBe(x402SellerIdentityDigest(observedIdentity))
  })

  it('treats an exact command replay as idempotent and refuses command-id conflicts', () => {
    const onboarding = created()
    const command = {
      kind: 'request_claim' as const, commandId: 'command:claim:request', ...expectedIdentity(onboarding),
    }
    const first = transitionX402SellerOnboarding(onboarding, command, 110)
    expect(first.kind).toBe('applied')
    if (first.kind !== 'applied') throw new Error('fixture failed')

    const replay = transitionX402SellerOnboarding(first.onboarding, command, 999)
    expect(replay).toEqual({ kind: 'replayed', onboarding: first.onboarding })

    const conflict = transitionX402SellerOnboarding(first.onboarding, {
      ...command, expectedIdentityDigest: digest('different-identity'),
    }, 120)
    expect(conflict).toEqual({ kind: 'refused', reason: 'operation_key_conflict' })
  })

  it('refuses commands against another pinned identity and preserves withdrawal as terminal', () => {
    const onboarding = created()
    expect(transitionX402SellerOnboarding(onboarding, {
      kind: 'request_claim', commandId: 'command:wrong-identity',
      expectedIdentityDigest: digest('another-operation'),
    }, 110)).toEqual({ kind: 'refused', reason: 'identity_mismatch' })

    const withdrawn = apply(onboarding, {
      kind: 'withdraw', commandId: 'command:withdraw', ...expectedIdentity(onboarding),
      evidenceDigest: digest('seller-withdrawal'),
    }, 120)
    expect(withdrawn.state).toBe('withdrawn')
    expect(transitionX402SellerOnboarding(withdrawn, {
      kind: 'request_claim', commandId: 'command:after-withdrawal', ...expectedIdentity(withdrawn),
    }, 130)).toEqual({ kind: 'refused', reason: 'invalid_transition' })
  })
})
