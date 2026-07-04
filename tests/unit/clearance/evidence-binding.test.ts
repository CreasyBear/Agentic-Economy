import { describe, expect, it } from 'vitest'
import type { SourceHash } from '@/modules/common/ids'
import type {
  ClearanceGatewayCheckRecord,
  ClearanceProtocolRecord,
} from '@/modules/clearance/internal/convex-protocol-store'

import {
  boundClearanceEvidenceRefHashes,
  boundClearanceRecordEvidence,
  boundGatewayCheckEvidence,
} from '@/modules/clearance/internal/evidence-binding'

const now = 1_804_150_000

const consumedGreenlight = {
  recordId: 'greenlight:business-action:001',
  recordKind: 'greenlight',
  status: 'consumed',
  principalId: 'principal:wba:agent-one',
  actionClass: 'business_action',
  actionRef: 'business-action:provision-paid-intake-endpoint',
  mandateId: 'buyer_mandate:001',
  requestRef: 'capability_request:001',
  greenlightRef: 'greenlight:business-action:001',
  idempotencyKey: 'operation:greenlight:001',
  payloadHash: 'hash:greenlight-payload-001',
  signaturePosture: 'local_hmac',
  keyIdentityRef: 'clearance-key:local:001',
  createdAt: now - 60,
  expiresAt: now + 600,
  consumedAt: now,
  consumedByRef: 'action_receipt:001',
  signedAt: '2026-07-04T12:00:00.000Z',
  signature: 'raw-local-hmac-signature-secret',
} satisfies ClearanceProtocolRecord

const proofGapReceipt = {
  recordId: 'receipt:business-action:proof-gap',
  recordKind: 'receipt',
  status: 'proof_gap',
  principalId: 'principal:wba:agent-one',
  actionClass: 'business_action',
  actionRef: 'business-action:provision-paid-intake-endpoint',
  mandateId: 'buyer_mandate:001',
  requestRef: 'capability_request:001',
  greenlightRef: 'greenlight:business-action:001',
  idempotencyKey: 'operation:receipt:001',
  payloadHash: 'hash:receipt-payload-001',
  signaturePosture: 'local_hmac',
  keyIdentityRef: 'clearance-key:local:001',
  createdAt: now + 10,
  proofGapReason: 'missing_provider_evidence',
  signedAt: '2026-07-04T12:01:00.000Z',
  signature: 'raw-local-hmac-receipt-signature-secret',
} satisfies ClearanceProtocolRecord

const gatewayCheck = {
  checkId: 'gateway-check:business-action:001',
  principalId: 'principal:wba:agent-one',
  actionClass: 'business_action',
  actionRef: 'business-action:provision-paid-intake-endpoint',
  status: 'accepted',
  sourceHash: 'hash:gateway-check-source-001',
  checkedAt: now + 5,
} satisfies ClearanceGatewayCheckRecord

describe('bound clearance evidence refs', () => {
  it('canonicalizes clearance records without leaking raw signatures or key material', () => {
    const ref = boundClearanceRecordEvidence(consumedGreenlight)
    const serialized = JSON.stringify(ref)

    expect(ref).toMatchObject({
      version: 'ae-bound-evidence:v1',
      source: 'clearance_record',
      recordKind: 'greenlight',
      actionClass: 'business_action',
      actionRef: 'business-action:provision-paid-intake-endpoint',
      principalId: 'principal:wba:agent-one',
      requestRef: 'capability_request:001',
      mandateId: 'buyer_mandate:001',
      status: 'consumed',
      payloadHash: 'hash:greenlight-payload-001',
      consumedByRef: 'action_receipt:001',
    })
    expect(ref.signatureHash).toMatch(/^hash:/)
    expect(serialized).not.toContain('raw-local-hmac-signature-secret')
    expect(serialized).not.toContain('AE_CLEARANCE_SIGNING_SECRET')
    expect(serialized).not.toContain('whsec_')
    expect(serialized).not.toContain('sk_test_')
  })

  it('produces deterministic sorted hash arrays independent of evidence insertion order', () => {
    const firstOrder = boundClearanceEvidenceRefHashes([
      boundClearanceRecordEvidence(consumedGreenlight),
      boundGatewayCheckEvidence(gatewayCheck),
      boundClearanceRecordEvidence(proofGapReceipt),
    ])
    const reversedOrder = boundClearanceEvidenceRefHashes([
      boundClearanceRecordEvidence(proofGapReceipt),
      boundGatewayCheckEvidence(gatewayCheck),
      boundClearanceRecordEvidence(consumedGreenlight),
    ])
    expect(firstOrder).toEqual(reversedOrder)
    expect(firstOrder).toEqual([...firstOrder].sort())
    expect(new Set(firstOrder).size).toBe(3)
    expect(firstOrder.every((hash: SourceHash) => hash.startsWith('hash:'))).toBe(true)
  })

  it('keeps gateway-check evidence in the shared bound-ref lane instead of provider evidence refs', () => {
    expect(boundGatewayCheckEvidence(gatewayCheck)).toMatchObject({
      version: 'ae-bound-evidence:v1',
      source: 'gateway_check',
      checkId: 'gateway-check:business-action:001',
      actionClass: 'business_action',
      actionRef: 'business-action:provision-paid-intake-endpoint',
      status: 'accepted',
      sourceHash: 'hash:gateway-check-source-001',
    })
  })
})
