import { brandNonEmpty } from '@/modules/common/ids'
import type { SourceHash } from '@/modules/common/ids'
import { stableHash, type StableHashValue } from '@/modules/common/stable-hash'

import type { ClearanceActionClass, ClearanceSignaturePosture, ClearanceSignedRecordKind } from './clearance-schema'
import type {
  ClearanceGatewayCheckRecord,
  ClearanceIsolationStateRecord,
  ClearanceProtocolRecord,
  ClearanceProtocolRecordStatus,
} from './convex-protocol-store'

export const BoundClearanceEvidenceVersion = 'ae-bound-evidence:v1' as const
export const BoundClearanceEvidenceSourceValues = ['clearance_record', 'gateway_check', 'isolation_state'] as const
export type BoundClearanceEvidenceSource = (typeof BoundClearanceEvidenceSourceValues)[number]

export type BoundClearanceRecordEvidence = Readonly<{
  version: typeof BoundClearanceEvidenceVersion
  source: 'clearance_record'
  actionClass: ClearanceActionClass
  actionRef: string
  principalId: string
  requestRef: string | null
  mandateId: string | null
  idempotencyKey: string
  payloadHash: SourceHash
  status: ClearanceProtocolRecordStatus
  createdAt: number
  recordKind: ClearanceSignedRecordKind
  recordId: string
  greenlightRef: string | null
  receiptRef: string | null
  signaturePosture: ClearanceSignaturePosture
  keyIdentityRef: string
  expiresAt: number | null
  consumedAt: number | null
  consumedByRef: string | null
  signedAt: string | null
  signatureHash: SourceHash | null
  outcome: string | null
  previousReceiptHash: SourceHash | null
  proofGapReason: string | null
}>

export type BoundClearanceGatewayCheckEvidence = Readonly<{
  version: typeof BoundClearanceEvidenceVersion
  source: 'gateway_check'
  actionClass: ClearanceActionClass
  actionRef: string
  principalId: string
  requestRef: null
  mandateId: null
  idempotencyKey: string
  payloadHash: SourceHash
  status: ClearanceGatewayCheckRecord['status']
  createdAt: number
  checkId: string
  sourceHash: SourceHash
  checkedAt: number
}>

export type BoundClearanceIsolationStateEvidence = Readonly<{
  version: typeof BoundClearanceEvidenceVersion
  source: 'isolation_state'
  actionClass: null
  actionRef: string
  principalId: string
  requestRef: null
  mandateId: null
  idempotencyKey: string
  payloadHash: SourceHash
  status: ClearanceIsolationStateRecord['status']
  createdAt: number
  isolationId: string
  reasonCode: string | null
  updatedAt: number
}>

export type BoundClearanceEvidence =
  | BoundClearanceRecordEvidence
  | BoundClearanceGatewayCheckEvidence
  | BoundClearanceIsolationStateEvidence

export function boundClearanceRecordEvidence(record: ClearanceProtocolRecord): BoundClearanceRecordEvidence {
  const signatureHash = record.signature === undefined
    ? null
    : stableHash({ recordId: record.recordId, signature: record.signature })

  return {
    version: BoundClearanceEvidenceVersion,
    source: 'clearance_record',
    actionClass: record.actionClass,
    actionRef: record.actionRef,
    principalId: record.principalId,
    requestRef: record.requestRef ?? null,
    mandateId: record.mandateId ?? null,
    idempotencyKey: record.idempotencyKey,
    payloadHash: brandNonEmpty(record.payloadHash, 'SourceHash'),
    status: record.status,
    createdAt: record.createdAt,
    recordKind: record.recordKind,
    recordId: record.recordId,
    greenlightRef: record.recordKind === 'greenlight' ? record.recordId : record.greenlightRef ?? null,
    receiptRef: record.recordKind === 'receipt' ? record.recordId : null,
    signaturePosture: record.signaturePosture,
    keyIdentityRef: record.keyIdentityRef,
    expiresAt: record.expiresAt ?? null,
    consumedAt: record.consumedAt ?? null,
    consumedByRef: record.consumedByRef ?? null,
    signedAt: record.signedAt ?? null,
    signatureHash,
    outcome: null,
    previousReceiptHash: null,
    proofGapReason: record.proofGapReason ?? null,
  }
}

export function boundGatewayCheckEvidence(record: ClearanceGatewayCheckRecord): BoundClearanceGatewayCheckEvidence {
  return {
    version: BoundClearanceEvidenceVersion,
    source: 'gateway_check',
    actionClass: record.actionClass,
    actionRef: record.actionRef,
    principalId: record.principalId,
    requestRef: null,
    mandateId: null,
    idempotencyKey: record.checkId,
    payloadHash: brandNonEmpty(record.sourceHash, 'SourceHash'),
    status: record.status,
    createdAt: record.checkedAt,
    checkId: record.checkId,
    sourceHash: brandNonEmpty(record.sourceHash, 'SourceHash'),
    checkedAt: record.checkedAt,
  }
}

export function boundIsolationStateEvidence(record: ClearanceIsolationStateRecord): BoundClearanceIsolationStateEvidence {
  return {
    version: BoundClearanceEvidenceVersion,
    source: 'isolation_state',
    actionClass: null,
    actionRef: record.isolationId,
    principalId: record.principalId,
    requestRef: null,
    mandateId: null,
    idempotencyKey: record.isolationId,
    payloadHash: stableHash({ isolationId: record.isolationId, status: record.status, reasonCode: record.reasonCode ?? null }),
    status: record.status,
    createdAt: record.updatedAt,
    isolationId: record.isolationId,
    reasonCode: record.reasonCode ?? null,
    updatedAt: record.updatedAt,
  }
}

export function boundClearanceEvidenceRefHash(evidence: BoundClearanceEvidence): SourceHash {
  return stableHash(boundClearanceEvidenceHashValue(evidence))
}

export function boundClearanceEvidenceRefHashes(records: readonly BoundClearanceEvidence[]): readonly SourceHash[] {
  return records.map((record) => boundClearanceEvidenceRefHash(record)).sort()
}

function boundClearanceEvidenceHashValue(evidence: BoundClearanceEvidence): StableHashValue {
  return evidence
}
