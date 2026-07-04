import { describe, expect, it } from 'vitest'

import {
  signClearanceRecord,
  verifyClearanceSignature,
  type ClearanceSigningPayload,
  type ClearanceSigningResult,
} from '@/modules/clearance/internal/signing'

const SECRET = 'clearance-secret-value-that-must-not-leak'
const KEY_IDENTITY_REF = 'wba:key:ae-example:2026-07'
const SIGNED_AT = '2026-07-04T12:00:00.000Z'

type ClearanceRecordKind = 'greenlight' | 'receipt'

const GREENLIGHT_PAYLOAD = {
  clearanceRef: 'clearance_demo_001',
  principalRef: 'agent:example',
  actionRef: 'catalog.read',
  evidenceRef: 'operator-reviewed',
} as const satisfies ClearanceSigningPayload

const GREENLIGHT_PAYLOAD_REORDERED = {
  evidenceRef: 'operator-reviewed',
  actionRef: 'catalog.read',
  principalRef: 'agent:example',
  clearanceRef: 'clearance_demo_001',
} as const satisfies ClearanceSigningPayload

const RECEIPT_PAYLOAD = {
  receiptRef: 'receipt_demo_001',
  actionRef: 'catalog.read',
  outcome: 'accepted',
  evidenceRef: 'operator-reviewed',
} as const satisfies ClearanceSigningPayload

const RECEIPT_PAYLOAD_REORDERED = {
  evidenceRef: 'operator-reviewed',
  outcome: 'accepted',
  actionRef: 'catalog.read',
  receiptRef: 'receipt_demo_001',
} as const satisfies ClearanceSigningPayload

describe('clearance signing contract', () => {
  it.each([
    {
      name: 'greenlight',
      recordKind: 'greenlight',
      payload: GREENLIGHT_PAYLOAD,
      equivalentPayload: GREENLIGHT_PAYLOAD_REORDERED,
    },
    {
      name: 'receipt',
      recordKind: 'receipt',
      payload: RECEIPT_PAYLOAD,
      equivalentPayload: RECEIPT_PAYLOAD_REORDERED,
    },
  ] satisfies Array<{
    name: string
    recordKind: ClearanceRecordKind
    payload: ClearanceSigningPayload
    equivalentPayload: ClearanceSigningPayload
  }>)('signs a $name record with deterministic local_hmac posture', ({ recordKind, payload, equivalentPayload }) => {
    const signed = expectSigned(
      signClearanceRecord({
        kind: recordKind,
        payload,
        secret: SECRET,
        keyIdentityRef: KEY_IDENTITY_REF,
        signedAt: SIGNED_AT,
      }),
    )

    const signedAgainWithCanonicalEquivalentPayload = expectSigned(
      signClearanceRecord({
        kind: recordKind,
        payload: equivalentPayload,
        secret: SECRET,
        keyIdentityRef: KEY_IDENTITY_REF,
        signedAt: SIGNED_AT,
      }),
    )

    expect(signed).toMatchObject({
      kind: 'signed',
      signaturePosture: 'local_hmac',
      keyIdentityRef: KEY_IDENTITY_REF,
      signedAt: SIGNED_AT,
    })
    expect(signedAgainWithCanonicalEquivalentPayload.signature).toBe(signed.signature)
  })

  it.each([
    {
      name: 'missing secret',
      input: {
        kind: 'greenlight',
        payload: GREENLIGHT_PAYLOAD,
        keyIdentityRef: KEY_IDENTITY_REF,
        signedAt: SIGNED_AT,
      },
    },
    {
      name: 'blank secret',
      input: {
        kind: 'greenlight',
        payload: GREENLIGHT_PAYLOAD,
        secret: '   ',
        keyIdentityRef: KEY_IDENTITY_REF,
        signedAt: SIGNED_AT,
      },
    },
  ] satisfies Array<{
    name: string
    input: Parameters<typeof signClearanceRecord>[0]
  }>)('fails closed when the signing secret is $name', ({ input }) => {
    const result = signClearanceRecord(input)

    expect(result).toEqual({
      kind: 'proof_gap',
      reason: 'missing_clearance_signing_secret',
      signaturePosture: 'local_hmac',
      keyIdentityRef: KEY_IDENTITY_REF,
    })
    expect(JSON.stringify(result)).not.toContain(SECRET)
  })

  it('fails closed without leaking the secret when key identity is blank', () => {
    const result = signClearanceRecord({
      kind: 'greenlight',
      payload: GREENLIGHT_PAYLOAD,
      secret: SECRET,
      keyIdentityRef: '   ',
      signedAt: SIGNED_AT,
    })

    expect(result).toEqual({
      kind: 'proof_gap',
      reason: 'missing_clearance_key_identity',
      signaturePosture: 'local_hmac',
      keyIdentityRef: '   ',
    })
    expect(JSON.stringify(result)).not.toContain(SECRET)
  })

  it('accepts a matching clearance signature for the same record payload and secret', () => {
    const signed = expectSigned(
      signClearanceRecord({
        kind: 'greenlight',
        payload: GREENLIGHT_PAYLOAD,
        secret: SECRET,
        keyIdentityRef: KEY_IDENTITY_REF,
        signedAt: SIGNED_AT,
      }),
    )

    expect(
      verifyClearanceSignature({
        kind: 'greenlight',
        payload: GREENLIGHT_PAYLOAD,
        secret: SECRET,
        keyIdentityRef: KEY_IDENTITY_REF,
        signedAt: SIGNED_AT,
        signature: signed.signature,
      }),
    ).toEqual({ kind: 'accepted' })
  })

  it.each([
    {
      name: 'payload',
      payload: {
        ...GREENLIGHT_PAYLOAD,
        evidenceRef: 'tampered-after-signing',
      } satisfies ClearanceSigningPayload,
      signatureOverride: undefined,
    },
    {
      name: 'signature',
      payload: GREENLIGHT_PAYLOAD,
      signatureOverride: 'tampered',
    },
  ])('rejects a tampered $name instead of accepting a replayed clearance', ({ payload, signatureOverride }) => {
    const signed = expectSigned(
      signClearanceRecord({
        kind: 'greenlight',
        payload: GREENLIGHT_PAYLOAD,
        secret: SECRET,
        keyIdentityRef: KEY_IDENTITY_REF,
        signedAt: SIGNED_AT,
      }),
    )

    expect(
      verifyClearanceSignature({
        kind: 'greenlight',
        payload,
        secret: SECRET,
        keyIdentityRef: KEY_IDENTITY_REF,
        signedAt: SIGNED_AT,
        signature: signatureOverride ?? signed.signature,
      }),
    ).toEqual({
      kind: 'rejected',
      reason: 'invalid_clearance_signature',
    })
  })

  it.each([
    {
      name: 'missing secret',
      secret: undefined,
    },
    {
      name: 'blank secret',
      secret: '   ',
    },
  ])('rejects verification when the secret is $name', ({ secret }) => {
    const signed = expectSigned(
      signClearanceRecord({
        kind: 'receipt',
        payload: RECEIPT_PAYLOAD,
        secret: SECRET,
        keyIdentityRef: KEY_IDENTITY_REF,
        signedAt: SIGNED_AT,
      }),
    )

    expect(
      verifyClearanceSignature({
        kind: 'receipt',
        payload: RECEIPT_PAYLOAD,
        secret,
        keyIdentityRef: KEY_IDENTITY_REF,
        signedAt: SIGNED_AT,
        signature: signed.signature,
      }),
    ).toEqual({
      kind: 'rejected',
      reason: 'missing_clearance_signing_secret',
    })
  })
})

function expectSigned(result: ClearanceSigningResult): Extract<ClearanceSigningResult, { kind: 'signed' }> {
  if (result.kind !== 'signed') {
    throw new Error(`expected a signed clearance record, received ${JSON.stringify(result)}`)
  }

  return result
}
