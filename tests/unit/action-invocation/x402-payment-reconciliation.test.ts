import { validatePaymentRequired } from '@x402/core/schemas'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { describe, expect, it } from 'vitest'

import {
  createDevelopmentDurablePort,
  createDevelopmentDurableState,
  createDynamicPublishedActionInvocationAdapter,
  validateX402PaymentReconciliationEvidence,
  type DynamicPublishedInvocationResult,
  type X402PaymentReconciliationEvidenceMaterial,
} from '@/modules/action-invocation'
import type { ExactAmount } from '@/modules/money/public'
import { createDevelopmentFileX402PaymentAttemptPort } from '../../../tools/dev/fixtures/action-invocation/development-file-x402-payment-attempt-port'
import type { X402PaymentAttempt, X402PaymentAuthorizationEvent } from '@/modules/action-invocation/x402-payment-attempt'
import { createDevelopmentDynamicPublishedSource } from '@/modules/action-invocation'
import { buildDevelopmentPublishedOperationEvidence } from '../../../tools/dev/fixtures/capability-supply/development-published-operation-evidence'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { stableStringify, type StableHashValue } from '@/modules/common/stable-hash'
import {
  invokePreparedRouteTransport,
  prepareRegisteredRouteTransportInvocation,
  type RouteTransportFetch,
  type RouteTransportInvocation,
  type X402PaymentAuthorizationIdentity,
  type X402PaymentSignatureRequest,
  type X402RouteTransportRuntime,
} from '@/modules/capability-supply/route-transport-runtime'

const now = Date.parse('2026-07-20T01:00:00.000Z')
const routeAuthorityGeneration = 1
const routeAuthorityDigest = canonicalDigest({
  connectionRef: 'test:connection:x402',
  providerRef: 'test:provider:x402',
  authorityGeneration: routeAuthorityGeneration,
})
const attempt: X402PaymentAttempt = {
  paymentIdentifier: 'payment:one',
  invocationRef: 'invocation:one',
  attemptRef: 'attempt:one',
  effectGeneration: 2,
  operationKey: 'operation:one',
  challengeDigest: canonicalDigest({ challenge: 'one' }),
  scheme: 'exact',
  network: 'eip155:8453',
  asset: '0xasset',
  payTo: '0xrecipient',
  amount: amount('USD', '10000', 6),
  providerEndpoint: 'https://provider.example/paid',
  operationRevision: 'revision:one',
  authorizationDigest: canonicalDigest({ authorization: 'one' }),
  custodyRef: `sha256:${'a'.repeat(64)}`,
  state: 'reconciliation_required',
  preparedAt: now - 2_000,
  submissionStartedAt: now - 1_000,
  evidenceRefs: [],
}
const authorizationEvent: X402PaymentAuthorizationEvent = {
  invocationRef: attempt.invocationRef,
  attemptRef: attempt.attemptRef,
  effectGeneration: attempt.effectGeneration,
  operationKey: attempt.operationKey,
  queryRelease: 'released',
  authorization: 'created',
  recordedAt: attempt.preparedAt,
  challengeDigest: attempt.challengeDigest,
  authorizationDigest: attempt.authorizationDigest,
}

describe('x402 payment reconciliation evidence', () => {
  it('fails closed on missing source verification, tamper, stale time, and exact binding drift', () => {
    const evidence = issue('not_settled')
    expect(validateX402PaymentReconciliationEvidence({
      evidence,
      attempt,
      source: evidence.source,
      now,
      verifySourceEvidence: undefined,
    })).toBe('payment_evidence_source_unverified')
    expect(validateX402PaymentReconciliationEvidence({
      evidence: issue('settled'),
      attempt,
      source: evidence.source,
      now,
      verifySourceEvidence: () => true,
    })).toBe('payment_evidence_malformed')
    expect(validateX402PaymentReconciliationEvidence({
      evidence: { ...evidence, amount: amount('USD', '10001', 6) },
      attempt,
      source: evidence.source,
      now,
      verifySourceEvidence: () => true,
    })).toBe('payment_evidence_digest_mismatch')
    const redigested = issue('not_settled', { payTo: '0xattacker' })
    expect(validateX402PaymentReconciliationEvidence({
      evidence: redigested,
      attempt,
      source: evidence.source,
      now,
      verifySourceEvidence: () => true,
    })).toBe('payment_evidence_binding_mismatch')
    const stale = issue('not_settled', { observedAt: new Date(attempt.preparedAt - 1).toISOString() })
    expect(validateX402PaymentReconciliationEvidence({
      evidence: stale,
      attempt,
      source: evidence.source,
      now,
      verifySourceEvidence: () => true,
    })).toBe('payment_evidence_time_invalid')
  })

  it.each([
    ['not_settled', undefined],
    ['settled', amount('USD', '10000', 6)],
  ] as const)('persists an attributable %s resolution across cold restore', async (resolution, settledAmount) => {
    const file = join(tmpdir(), `ae-x402-reconciliation-${resolution}-${process.pid}-${Date.now()}.json`)
    const port = createDevelopmentFileX402PaymentAttemptPort(file)
    port.persist({ attempt, authorizationEvent })
    const adapter = createAdapter(port)
    const evidence = issue(resolution, settledAmount === undefined ? {} : { settledAmount })
    expect(await adapter.reconcilePayment({ evidence })).toMatchObject({
      kind: 'accepted',
      attempt: {
        state: resolution,
        ...(settledAmount === undefined ? {} : { settledAmount }),
        evidenceRefs: [evidence.evidenceRef, ...evidence.evidenceRefs],
      },
    })
    const restartedAdapter = createAdapter(createDevelopmentFileX402PaymentAttemptPort(file))
    expect(await restartedAdapter.reconcilePayment({ evidence })).toMatchObject({
      kind: 'accepted',
      attempt: { state: resolution },
    })
    expect(createDevelopmentFileX402PaymentAttemptPort(file).list()).toEqual([
      expect.objectContaining({
        paymentIdentifier: attempt.paymentIdentifier,
        state: resolution,
        ...(settledAmount === undefined ? {} : { settledAmount }),
      }),
    ])
  })
  it.each([
    ['amount', { amount: '10001' }, 'payment_exceeds_step_ceiling'],
    ['network', { network: 'eip155:84532' }, 'payment_requirement_unsupported'],
    ['asset', { asset: '0x0000000000000000000000000000000000000003' }, 'payment_requirement_unsupported'],
  ] as const)('refuses pinned terms with the wrong %s before payment submission', async (_label, override, failureCode) => {
    let sendCount = 0
    let prepareCount = 0
    const route = routeInvocation(override)
    const send: RouteTransportFetch = async () => {
      sendCount += 1
      return new Response(null, { status: 500 })
    }
    const runtime: X402RouteTransportRuntime = {
      send,
      resolveCredential: (connectionRef) => connectionRef === 'test:connection:x402' ? 'credential' : undefined,
      readProviderConnectionCredentialRef: (input) => {
        if (
          input.connectionRef !== 'test:connection:x402'
          || input.providerRef !== 'test:provider:x402'
          || input.adapterId !== 'x402-fetch:v2'
        ) {
          return { kind: 'unavailable' as const, reason: 'not_found' as const }
        }
        if (input.authorityGeneration !== routeAuthorityGeneration) {
          return { kind: 'unavailable' as const, reason: 'stale_generation' as const }
        }
        if (input.authorityDigest !== routeAuthorityDigest) {
          return { kind: 'unavailable' as const, reason: 'digest_mismatch' as const }
        }
        return { kind: 'resolved' as const, credentialRef: 'test:connection:x402' }
      },
      validateProviderConnectionAuthority: () => ({ kind: 'valid' as const }),
      prepareX402PaymentAuthorization: async () => {
        prepareCount += 1
        return {
          custodyRef: `sha256:${'b'.repeat(64)}`,
          authorizationDigest: `sha256:${'c'.repeat(64)}`,
        }
      },
      markX402PaymentPossiblySubmitted: () => undefined,
      readX402PaymentAuthorization: async () => 'signed',
      readX402PaymentAuthorizationByDigest: async () => 'signed',
    }
    const preparation = prepareRegisteredRouteTransportInvocation(
      route,
      runtime.x402PaymentSigningAvailable,
    )
    const observed = preparation.kind === 'refused'
      ? preparation.observation
      : await invokePreparedRouteTransport(preparation.prepared, runtime)
    expect(observed).toMatchObject({ disposition: 'refused', failureCode })
    expect(sendCount).toBe(0)
    expect(prepareCount).toBe(0)
  })
})

type ChallengeRequirement = Readonly<{
  scheme: 'exact'
  network: `${string}:${string}`
  amount: string
  asset: string
  payTo: string
  maxTimeoutSeconds: number
  extra: Readonly<Record<string, unknown>>
}>

function routeInvocation(paymentRequiredOverride: Partial<ChallengeRequirement> = {}): RouteTransportInvocation {
  const config = {
    method: 'POST' as const,
    requestTimeoutMs: 5_000,
    scheme: 'exact' as const,
    network: 'eip155:8453',
    currency: 'USD',
    routeAmountExponent: 2,
    assetAmountExponent: 6,
    asset: '0x0000000000000000000000000000000000000001',
    payTo: '0x0000000000000000000000000000000000000002',
    paymentRequiredJson: pinnedPaymentRequiredJson(paymentRequiredOverride),
  }
  return {
    binding: {
      adapterId: 'x402-fetch:v2',
      endpointUrl: 'https://provider.example/paid',
      authority: {
        kind: 'provider_connection',
        connectionRef: 'test:connection:x402',
        providerRef: 'test:provider:x402',
      },
      configJson: JSON.stringify(config),
      configDigest: canonicalDigest(config),
    },
    authority: {
      attemptRef: 'attempt:route',
      effectGeneration: 2,
      authorityGeneration: routeAuthorityGeneration,
      authorityDigest: routeAuthorityDigest,
      operationKeyDigest: 'sha256:operation',
      mandateDigest: 'sha256:mandate',
      grantDigest: 'sha256:grant',
      capabilityContractDigest: 'sha256:contract',
      maximumSpend: amount('USD', '1', 2),
      expiresAt: Date.now() + 60 * 60 * 1_000,
      callIdentity: { keyId: 'route-key', signature: 'route-signature' },
    },
    inputJson: JSON.stringify({ query: 'latest' }),
  }
}

function pinnedPaymentRequiredJson(overrides: Partial<ChallengeRequirement> = {}): string {
  const requirement: ChallengeRequirement = {
    scheme: 'exact',
    network: 'eip155:8453',
    amount: '10000',
    asset: '0x0000000000000000000000000000000000000001',
    payTo: '0x0000000000000000000000000000000000000002',
    maxTimeoutSeconds: 60,
    extra: {},
    ...overrides,
  }
  const paymentRequired = validatePaymentRequired({
    x402Version: 2,
    resource: { url: 'https://provider.example/paid' },
    accepts: [requirement],
  })
  if (paymentRequired.x402Version !== 2) throw new Error('expected_x402_v2_payment_required')
  return stableStringify(paymentRequired as StableHashValue)
}

function amount(currency: string, units: string, exponent: number): ExactAmount {
  return { currency, units, exponent }
}

function issue(
  resolution: 'not_settled' | 'settled',
  override: Partial<X402PaymentReconciliationEvidenceMaterial> = {},
) {
  const material: X402PaymentReconciliationEvidenceMaterial = {
    kind: 'x402_payment_reconciliation',
    version: 1,
    evidenceRef: `evidence:${resolution}`,
    evidenceRefs: [`provider-receipt:${resolution}`],
    source: `x402:${attempt.providerEndpoint}`,
    paymentIdentifier: attempt.paymentIdentifier,
    challengeDigest: attempt.challengeDigest,
    providerEndpoint: attempt.providerEndpoint,
    scheme: attempt.scheme,
    network: attempt.network,
    asset: attempt.asset,
    payTo: attempt.payTo,
    amount: attempt.amount,
    invocationRef: attempt.invocationRef,
    attemptRef: attempt.attemptRef,
    effectGeneration: attempt.effectGeneration,
    resolution,
    observedAt: new Date(now).toISOString(),
    ...override,
  }
  return { ...material, digest: canonicalDigest(material) }
}

function createAdapter(
  paymentAttemptPort: ReturnType<typeof createDevelopmentFileX402PaymentAttemptPort>,
) {
  const fixture = buildDevelopmentPublishedOperationEvidence()
  const durableState = createDevelopmentDurableState<DynamicPublishedInvocationResult>()
  return createDynamicPublishedActionInvocationAdapter({
    operation: fixture.operation,
    source: createDevelopmentDynamicPublishedSource([fixture.operation]),
    runtime: {
      send: async () => { throw new Error('not_used') },
      resolveCredential: (_connectionRef) => undefined,
    },
    now: () => now,
    nextInvocationRef: () => 'invocation:not-used',
    nextAuthorityRef: () => 'authority:not-used',
    nextAttemptRef: () => 'attempt:not-used',
    durablePort: createDevelopmentDurablePort(durableState),
    paymentAttemptPort,
    verifyPaymentReconciliationEvidence: () => true,
  })
}
