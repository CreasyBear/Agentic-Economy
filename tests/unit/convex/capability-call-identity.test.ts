import { describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const claimCanonicalExecution = vi.fn()
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
    claimCanonicalExecution,
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

vi.mock('@/modules/action-execution', () => ({
  claimCanonicalExecution: mocks.claimCanonicalExecution,
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
  callAttemptIdentityDigest,
  callAttemptIdentityMaterial,
} from '../../../convex/capabilityCallWorker'
import { admitCall, canonicalCallRef } from '@/modules/capability-execution/call-authority'
import { canonicalDigest } from '@/modules/common/canonical-digest'

const identity = {
  callRef: 'operation-invocation:v1:one',
  principalId: 'principal:one',
  credentialId: 'credential:one',
  applicationRef: 'application:one',
  environment: 'production' as const,
  toolRef: 'operation:quote',
  idempotencyKey: 'caller-idempotency:one',
  inputDigest: 'sha256:' + 'a'.repeat(64),
  attemptRef: 'operation-attempt:one:1',
  effectGeneration: 1,
}

describe('Call attempt identity', () => {
  it('hashes the durable invocation, caller identity, operation material, and attempt generation exactly', () => {
    const material = callAttemptIdentityMaterial(identity)

    expect(material).toEqual({
      format: 'operation-invocation-attempt:v1',
      invocationRef: identity.callRef,
      principalId: identity.principalId,
      credentialId: identity.credentialId,
      applicationRef: identity.applicationRef,
      environment: identity.environment,
      operationRef: identity.toolRef,
      idempotencyKey: identity.idempotencyKey,
      inputDigest: identity.inputDigest,
      attemptRef: identity.attemptRef,
      effectGeneration: identity.effectGeneration,
    })
    expect(callAttemptIdentityDigest(identity)).toBe(canonicalDigest(material))
  })

  it('separates distinct idempotency keys and principals for identical operation input', () => {
    const distinctKey = callAttemptIdentityDigest({
      ...identity,
      idempotencyKey: 'caller-idempotency:two',
      callRef: 'operation-invocation:v1:two',
    })
    const distinctPrincipal = callAttemptIdentityDigest({
      ...identity,
      principalId: 'principal:two',
    })

    expect(distinctKey).not.toBe(callAttemptIdentityDigest(identity))
    expect(distinctPrincipal).not.toBe(callAttemptIdentityDigest(identity))
    expect(distinctKey).not.toContain(identity.idempotencyKey)
  })

  it('keeps the identity stable for an exact durable replay and changes it for a new effect generation', () => {
    const replay = callAttemptIdentityDigest({ ...identity })
    const sameReplay = callAttemptIdentityDigest({ ...identity })
    const nextEffect = callAttemptIdentityDigest({ ...identity, effectGeneration: 2 })

    expect(sameReplay).toBe(replay)
    expect(nextEffect).not.toBe(replay)
  })

  it('preserves the original canonical material for the protected Call reference', () => {
    const originalMaterial = {
      principalId: 'principal:vector',
      credentialId: 'credential:vector',
      applicationRef: 'application:vector',
      grantGeneration: 7,
      environment: 'sandbox',
      operationRef: 'operation:v1:' + 'a'.repeat(64),
      idempotencyKey: 'idempotency:vector',
    }
    const originalDigest = 'sha256:8b56df46f4c06fed757504817e70a1c00b9ba5d5424cc3546a8f8fa879ad425b'

    expect(canonicalDigest(originalMaterial)).toBe(originalDigest)
    expect(canonicalCallRef({
      principalId: originalMaterial.principalId,
      credentialId: originalMaterial.credentialId,
      applicationRef: originalMaterial.applicationRef,
      grantGeneration: originalMaterial.grantGeneration,
      environment: 'sandbox',
      toolRef: originalMaterial.operationRef,
      idempotencyKey: originalMaterial.idempotencyKey,
    })).toBe(`operation-invocation:v1:${originalDigest.slice(7)}`)
  })

  it('preserves the original request digest while retaining nested opaque Tool input', async () => {
    const toolRef = 'operation:v1:' + 'a'.repeat(64)
    const nestedInput = {
      note: 'opaque nested input',
      payload: {
        toolRef: 'opaque:nested-tool',
        operationRef: 'opaque:nested-operation',
        values: ['first', { toolRef: 'opaque:deeper-tool' }, null],
      },
    }
    const originalMaterial = { operationRef: toolRef, input: nestedInput }
    const originalDigest = 'sha256:22f160d06ad67fdea3f34452e7cd1e72e680a2a16d280acbba6f80de42a12952'
    const principal = {
      principalId: 'principal:vector',
      ownerId: 'owner:vector',
      credentialId: 'credential:vector',
      applicationRef: 'application:vector',
      environment: 'sandbox' as const,
      scopes: ['market_operations:invoke'],
      authorityMode: 'approval_required' as const,
    }
    const grant = {
      grantRef: 'grant:vector',
      principalId: principal.principalId,
      ownerId: principal.ownerId,
      applicationRef: principal.applicationRef,
      credentialId: principal.credentialId,
      environment: principal.environment,
      generation: 7,
      policyDigest: 'sha256:' + 'b'.repeat(64),
      expiresAt: 2_000_000_000_000,
      lifecycle: 'active' as const,
      toolAccess: 'all_admitted' as const,
      toolRefs: [],
    }
    const result = await admitCall({
      request: {
        principal,
        correlationId: 'correlation:vector',
        input: {
          quoteRef: 'operation-commitment:v1:' + 'b'.repeat(64),
          toolRef,
          input: nestedInput,
          idempotencyKey: 'idempotency:vector',
        },
      },
      policy: {
        readGrant: async () => ({ kind: 'granted' as const, grant }),
        evaluateAuthority: async () => ({
          kind: 'needs_authority' as const,
          authorityRequest: {
            kind: 'approval_required' as const,
            toolRef,
            consequence: 'read_only' as const,
            retryClass: 'replayable' as const,
            dataFields: [],
          },
        }),
      },
      currentTool: undefined,
      now: () => 1_700_000_000_000,
    })

    expect(result.kind).toBe('admitted')
    if (result.kind !== 'admitted') return
    expect(canonicalDigest(originalMaterial)).toBe(originalDigest)
    expect(result.requestDigest).toBe(originalDigest)
    expect(result.command.input).toEqual(nestedInput)
  })
})
