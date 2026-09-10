import { describe, expect, it } from 'vitest'

import { canonicalCallRef } from '@/modules/capability-execution/call-authority'

// Golden vectors captured from canonicalCallRef before it was split into
// callIdentityMaterial + callRefFromIdentityAndGeneration (S6 / Well 5,
// Wells 1+2 smell #7). The derivation must stay byte-identical for these
// fixed inputs across the refactor.
describe('canonicalCallRef golden vectors', () => {
  it('matches the pre-refactor output for fixture 1 (sandbox)', () => {
    expect(canonicalCallRef({
      principalId: 'principal:vector',
      credentialId: 'credential:vector',
      applicationRef: 'application:vector',
      grantGeneration: 7,
      environment: 'sandbox',
      toolRef: 'operation:v1:' + 'a'.repeat(64),
      idempotencyKey: 'idempotency:vector',
    })).toBe('operation-invocation:v1:8b56df46f4c06fed757504817e70a1c00b9ba5d5424cc3546a8f8fa879ad425b')
  })

  it('matches the pre-refactor output for fixture 2 (production, rotated credential+grant)', () => {
    expect(canonicalCallRef({
      principalId: 'principal:rotation',
      credentialId: 'credential:rotation-b',
      applicationRef: 'application:rotation',
      grantGeneration: 2,
      environment: 'production',
      toolRef: 'operation:v1:' + 'b'.repeat(64),
      idempotencyKey: 'purchase:rotation-one',
    })).toBe('operation-invocation:v1:fa3b188e982bf0cb2963f174537284a6c745727a1cb81c5e9d0c3827498a8289')
  })

  it('matches the pre-refactor output for fixture 3 (sandbox, distinct generation and tool)', () => {
    expect(canonicalCallRef({
      principalId: 'principal:three',
      credentialId: 'credential:three',
      applicationRef: 'application:three',
      grantGeneration: 42,
      environment: 'sandbox',
      toolRef: 'operation:quote',
      idempotencyKey: 'caller-idempotency:three',
    })).toBe('operation-invocation:v1:bb573dad48ebdd3f32d2e8ce48854c7732c4327aaad0a3ebc14e670ffa992256')
  })
})
