import { describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const claimCanonicalInvocation = vi.fn()
  const persistCanonicalReleaseFence = vi.fn()
  const persistCanonicalTerminalOutcome = vi.fn()
  const prepareRegisteredRouteTransportInvocation = vi.fn()
  const invokePreparedRouteTransport = vi.fn()
  const signRouteTransportCall = vi.fn()
  const createEvmX402PaymentSignature = vi.fn()
  const credentialFromEnvironment = vi.fn()
  const x402PaymentCredentialRefFromEnvironment = vi.fn()
  const createGuardedLookup = vi.fn()
  const isPublicHttpTarget = vi.fn()
  const guardedFetch = vi.fn()
  class FakeAgent {
    close = vi.fn(async () => undefined)
  }
  return {
    claimCanonicalInvocation,
    persistCanonicalReleaseFence,
    persistCanonicalTerminalOutcome,
    prepareRegisteredRouteTransportInvocation,
    invokePreparedRouteTransport,
    signRouteTransportCall,
    createEvmX402PaymentSignature,
    credentialFromEnvironment,
    x402PaymentCredentialRefFromEnvironment,
    createGuardedLookup,
    isPublicHttpTarget,
    guardedFetch,
    FakeAgent,
  }
})

vi.mock('@/modules/action-invocation', () => ({
  claimCanonicalInvocation: mocks.claimCanonicalInvocation,
  persistCanonicalReleaseFence: mocks.persistCanonicalReleaseFence,
  persistCanonicalTerminalOutcome: mocks.persistCanonicalTerminalOutcome,
}))
vi.mock('@/modules/capability-supply/route-transport-runtime', () => ({
  prepareRegisteredRouteTransportInvocation: mocks.prepareRegisteredRouteTransportInvocation,
  invokePreparedRouteTransport: mocks.invokePreparedRouteTransport,
}))
vi.mock('@/modules/capability-supply/server', () => ({
  signRouteTransportCall: mocks.signRouteTransportCall,
  createEvmX402PaymentSignature: mocks.createEvmX402PaymentSignature,
  credentialFromEnvironment: mocks.credentialFromEnvironment,
  x402PaymentCredentialRefFromEnvironment: mocks.x402PaymentCredentialRefFromEnvironment,
}))
vi.mock('@/modules/network-guard/public', () => ({
  createGuardedLookup: mocks.createGuardedLookup,
  defaultDnsResolver: { lookup: vi.fn() },
  isPublicHttpTarget: mocks.isPublicHttpTarget,
}))
vi.mock('undici', () => ({ Agent: mocks.FakeAgent, fetch: mocks.guardedFetch }))

import {
  operationInvocationAttemptIdentityDigest,
  operationInvocationAttemptIdentityMaterial,
} from '../../../convex/capabilityOperationInvocationWorker'
import { canonicalDigest } from '@/modules/common/canonical-digest'

const identity = {
  invocationRef: 'operation-invocation:v1:one',
  principalId: 'principal:one',
  credentialId: 'credential:one',
  applicationRef: 'application:one',
  environment: 'production' as const,
  operationRef: 'operation:quote',
  idempotencyKey: 'caller-idempotency:one',
  inputDigest: 'sha256:' + 'a'.repeat(64),
  attemptRef: 'operation-attempt:one:1',
  effectGeneration: 1,
}

describe('operation invocation attempt identity', () => {
  it('hashes the durable invocation, caller identity, operation material, and attempt generation exactly', () => {
    const material = operationInvocationAttemptIdentityMaterial(identity)

    expect(material).toEqual({
      format: 'operation-invocation-attempt:v1',
      invocationRef: identity.invocationRef,
      principalId: identity.principalId,
      credentialId: identity.credentialId,
      applicationRef: identity.applicationRef,
      environment: identity.environment,
      operationRef: identity.operationRef,
      idempotencyKey: identity.idempotencyKey,
      inputDigest: identity.inputDigest,
      attemptRef: identity.attemptRef,
      effectGeneration: identity.effectGeneration,
    })
    expect(operationInvocationAttemptIdentityDigest(identity)).toBe(canonicalDigest(material))
  })

  it('separates distinct idempotency keys and principals for identical operation input', () => {
    const distinctKey = operationInvocationAttemptIdentityDigest({
      ...identity,
      idempotencyKey: 'caller-idempotency:two',
      invocationRef: 'operation-invocation:v1:two',
    })
    const distinctPrincipal = operationInvocationAttemptIdentityDigest({
      ...identity,
      principalId: 'principal:two',
    })

    expect(distinctKey).not.toBe(operationInvocationAttemptIdentityDigest(identity))
    expect(distinctPrincipal).not.toBe(operationInvocationAttemptIdentityDigest(identity))
    expect(distinctKey).not.toContain(identity.idempotencyKey)
  })

  it('keeps the identity stable for an exact durable replay and changes it for a new effect generation', () => {
    const replay = operationInvocationAttemptIdentityDigest({ ...identity })
    const sameReplay = operationInvocationAttemptIdentityDigest({ ...identity })
    const nextEffect = operationInvocationAttemptIdentityDigest({ ...identity, effectGeneration: 2 })

    expect(sameReplay).toBe(replay)
    expect(nextEffect).not.toBe(replay)
  })
})
