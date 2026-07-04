import { describe, expect, it } from 'vitest'

import { stableStringify } from '@/modules/common/stable-hash'
import {
  ClearanceSigningKeyIdEnvName,
  ClearanceSigningSecretEnvName,
  signClearanceRecord,
  verifyClearanceSignature,
  type ClearanceSignedRecord,
  type ClearanceSigningPayload,
  type ClearanceSigningResult,
} from '@/modules/clearance/internal/signing'
import { resolveClearanceSigningKeyFromEnv } from '@/modules/clearance/internal/key-resolver'
import {
  buildClearanceGreenlightSigningPayload,
  buildClearanceReceiptSigningPayload,
} from '@/modules/clearance/internal/signed-payload'

const SECRET = 'clearance-local-hmac-secret'
const KEY_IDENTITY_REF = 'clearance-key:local:2026-07'
const SIGNED_AT = '2026-07-04T12:00:00.000Z'

const greenlightInput = {
  principalId: 'principal:wba:agent-one',
  actionClass: 'business_action',
  actionRef: 'business-action:provision-paid-intake-endpoint',
  mandateId: 'mandate:buyer:001',
  requestRef: 'request:paid-intake:001',
  idempotencyKey: 'idem:greenlight:001',
  issuedAt: 1_804_150_000,
  expiresAt: 1_804_153_600,
  payloadHash: 'hash:request-payload-001',
} as const

const receiptInput = {
  principalId: greenlightInput.principalId,
  actionClass: greenlightInput.actionClass,
  actionRef: greenlightInput.actionRef,
  mandateId: greenlightInput.mandateId,
  requestRef: greenlightInput.requestRef,
  greenlightRef: 'greenlight:001',
  receiptRef: 'receipt:001',
  idempotencyKey: 'idem:receipt:001',
  outcome: 'accepted',
  issuedAt: 1_804_150_120,
  payloadHash: 'hash:receipt-payload-001',
  previousReceiptHash: 'hash:previous-receipt',
} as const

describe('clearance signed payload contract', () => {
  it('builds canonical greenlight and receipt payloads that bind authority-critical refs', () => {
    const greenlight = buildClearanceGreenlightSigningPayload(greenlightInput)
    const receipt = buildClearanceReceiptSigningPayload(receiptInput)

    expect(greenlight).toEqual({
      version: 'clearance-greenlight:v1',
      recordKind: 'greenlight',
      principalId: 'principal:wba:agent-one',
      actionClass: 'business_action',
      actionRef: 'business-action:provision-paid-intake-endpoint',
      mandateId: 'mandate:buyer:001',
      requestRef: 'request:paid-intake:001',
      idempotencyKey: 'idem:greenlight:001',
      issuedAt: 1_804_150_000,
      expiresAt: 1_804_153_600,
      payloadHash: 'hash:request-payload-001',
    })

    expect(receipt).toEqual({
      version: 'clearance-receipt:v1',
      recordKind: 'receipt',
      principalId: 'principal:wba:agent-one',
      actionClass: 'business_action',
      actionRef: 'business-action:provision-paid-intake-endpoint',
      mandateId: 'mandate:buyer:001',
      requestRef: 'request:paid-intake:001',
      greenlightRef: 'greenlight:001',
      receiptRef: 'receipt:001',
      idempotencyKey: 'idem:receipt:001',
      outcome: 'accepted',
      issuedAt: 1_804_150_120,
      payloadHash: 'hash:receipt-payload-001',
      previousReceiptHash: 'hash:previous-receipt',
    })

    expect(stableStringify(greenlight)).not.toBe(stableStringify(receipt))
  })

  it.each([
    {
      name: 'missing secret',
      env: { [ClearanceSigningKeyIdEnvName]: KEY_IDENTITY_REF },
      expected: {
        kind: 'proof_gap',
        reason: 'missing_clearance_signing_secret',
        keyIdentityRef: KEY_IDENTITY_REF,
      },
    },
    {
      name: 'blank secret',
      env: {
        [ClearanceSigningKeyIdEnvName]: KEY_IDENTITY_REF,
        [ClearanceSigningSecretEnvName]: '   ',
      },
      expected: {
        kind: 'proof_gap',
        reason: 'missing_clearance_signing_secret',
        keyIdentityRef: KEY_IDENTITY_REF,
      },
    },
    {
      name: 'missing key identity',
      env: { [ClearanceSigningSecretEnvName]: SECRET },
      expected: {
        kind: 'proof_gap',
        reason: 'missing_clearance_key_identity',
        keyIdentityRef: '',
      },
    },
    {
      name: 'blank key identity',
      env: {
        [ClearanceSigningKeyIdEnvName]: '   ',
        [ClearanceSigningSecretEnvName]: SECRET,
      },
      expected: {
        kind: 'proof_gap',
        reason: 'missing_clearance_key_identity',
        keyIdentityRef: '',
      },
    },
  ])('refuses local_hmac signing key resolution for $name', ({ env, expected }) => {
    expect(resolveClearanceSigningKeyFromEnv(env)).toEqual(expected)
  })

  it('signs stable canonical bytes regardless of object insertion order', () => {
    const payload = buildClearanceGreenlightSigningPayload(greenlightInput)
    const samePayloadDifferentInsertionOrder = {
      payloadHash: 'hash:request-payload-001',
      expiresAt: 1_804_153_600,
      issuedAt: 1_804_150_000,
      idempotencyKey: 'idem:greenlight:001',
      requestRef: 'request:paid-intake:001',
      mandateId: 'mandate:buyer:001',
      actionRef: 'business-action:provision-paid-intake-endpoint',
      actionClass: 'business_action',
      principalId: 'principal:wba:agent-one',
      recordKind: 'greenlight',
      version: 'clearance-greenlight:v1',
    } as const satisfies ClearanceSigningPayload

    const signed = expectSigned(sign('greenlight', payload))
    const signedAgain = expectSigned(sign('greenlight', samePayloadDifferentInsertionOrder))

    expect(signed.signature).toBe(signedAgain.signature)
  })

  it('distinguishes greenlight and receipt signatures even when core refs overlap', () => {
    const greenlight = buildClearanceGreenlightSigningPayload(greenlightInput)
    const receipt = buildClearanceReceiptSigningPayload({
      ...receiptInput,
      idempotencyKey: greenlightInput.idempotencyKey,
      payloadHash: greenlightInput.payloadHash,
    })

    expect(expectSigned(sign('greenlight', greenlight)).signature).not.toBe(
      expectSigned(sign('receipt', receipt)).signature,
    )
  })

  it.each([
    {
      name: 'payload',
      input: {
        kind: 'greenlight' as const,
        payload: {
          ...buildClearanceGreenlightSigningPayload(greenlightInput),
          requestRef: 'request:tampered',
        },
        keyIdentityRef: KEY_IDENTITY_REF,
        signedAt: SIGNED_AT,
        signature: undefined,
      },
    },
    {
      name: 'signature',
      input: {
        kind: 'greenlight' as const,
        payload: buildClearanceGreenlightSigningPayload(greenlightInput),
        keyIdentityRef: KEY_IDENTITY_REF,
        signedAt: SIGNED_AT,
        signature: 'tampered-signature',
      },
    },
    {
      name: 'key identity',
      input: {
        kind: 'greenlight' as const,
        payload: buildClearanceGreenlightSigningPayload(greenlightInput),
        keyIdentityRef: 'clearance-key:rotated',
        signedAt: SIGNED_AT,
        signature: undefined,
      },
    },
    {
      name: 'signedAt',
      input: {
        kind: 'greenlight' as const,
        payload: buildClearanceGreenlightSigningPayload(greenlightInput),
        keyIdentityRef: KEY_IDENTITY_REF,
        signedAt: '2026-07-04T12:00:01.000Z',
        signature: undefined,
      },
    },
  ])('rejects a tampered $name instead of accepting a replayed clearance', ({ input }) => {
    const originalPayload = buildClearanceGreenlightSigningPayload(greenlightInput)
    const signed = expectSigned(sign('greenlight', originalPayload))

    expect(
      verifyClearanceSignature({
        kind: input.kind,
        payload: input.payload,
        secret: SECRET,
        keyIdentityRef: input.keyIdentityRef,
        signedAt: input.signedAt,
        signature: input.signature ?? signed.signature,
      }),
    ).toEqual({
      kind: 'rejected',
      reason: 'invalid_clearance_signature',
    })
  })
})

function sign(kind: 'greenlight' | 'receipt', payload: ClearanceSigningPayload): ClearanceSigningResult {
  return signClearanceRecord({
    kind,
    payload,
    secret: SECRET,
    keyIdentityRef: KEY_IDENTITY_REF,
    signedAt: SIGNED_AT,
  })
}

function expectSigned(result: ClearanceSigningResult): ClearanceSignedRecord {
  if (result.kind !== 'signed') {
    throw new Error(`expected signed clearance, received ${JSON.stringify(result)}`)
  }

  return result
}
