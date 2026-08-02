import { canonicalDigest } from '@/modules/common/canonical-digest'
import type { StableHashValue } from '@/modules/common/stable-hash'

import {
  assertDynamicPublishedSnapshotShape,
} from './dynamic-published-snapshot-verifier'
import type { ActionInvocationOrigin } from './contracts'
import { reconstructDurableControlRow } from './internal/durable-contracts'

export type DevelopmentHostKind = 'request_owned_human' | 'standalone_external_agent'

export type DevelopmentHostSemanticRead = Readonly<{
  action: Readonly<{ id: string; version: string }>
  operation: Readonly<{
    id: string
    publicationSlot: string
    publicationRevision: number
    materialDigest: string
    transportConfigDigest: string
    paymentIdentity: StableHashValue
    price: StableHashValue
  }>
  prepared: Readonly<{ inputDigest: string; materialDigest: string; targetDigest: string }>
  identity: Readonly<{
    invocationRef: string
    invocationVersion: number
    origin: ActionInvocationOrigin
    principalRef: string
    callerRef: string
  }>
  authority: Readonly<{
    reference: string
    kind: string
    generation: number | null
    bindingDigest: string
    bounds: StableHashValue
  }>
  attempt: Readonly<{
    attemptRef: string
    leaseOwner: string
    effectGeneration: number
    idempotency: StableHashValue
  }> | null
  resolution: Readonly<{
    controlState: string
    semanticOwnerRef: string | null
    semanticStatus: string | null
    semanticOutcomeDigest: string | null
    release: StableHashValue | null
    evidenceDigest: string
    resultIdentity: StableHashValue | null
    sourceResultDigest: string | null
  }>
}>

export type DevelopmentHostReadReceipt = Readonly<{
  format: 'action-invocation-host-read:development:v2'
  host: DevelopmentHostKind
  readRef: string
  readAt: string
  snapshotDigest: string
  semanticRead: DevelopmentHostSemanticRead
  semanticDigest: string
  receiptDigest: string
  provenance: 'LOCAL DEVELOPMENT DIGEST; NO EXTERNAL SIGNATURE OR ROOT'
}>

export function readDevelopmentHostSnapshot(input: Readonly<{
  host: DevelopmentHostKind
  snapshot: unknown
}>): DevelopmentHostReadReceipt {
  assertDynamicPublishedSnapshotShape(input.snapshot)
  const snapshot = input.snapshot
  const source = snapshot.sourceRows[0]
  const rawControl = snapshot.controls[0]
  const attemptGroup = snapshot.attempts[0]
  const historyGroup = snapshot.history[0]
  if (
    source === undefined
    || rawControl === undefined
    || attemptGroup === undefined
    || historyGroup === undefined
  ) {
    throw new Error('dynamic_published_snapshot_schema_invalid')
  }
  const control = reconstructDurableControlRow(rawControl)
  const attempt = attemptGroup.rows.at(-1)
  const claim = snapshot.semanticClaims[0]
  const operation = source.operation
  const accepted = control.control.acceptedAuthority
  if (control.authorityBinding === undefined || accepted === undefined) {
    throw new Error('host_read_authority_missing')
  }
  const semanticRead: DevelopmentHostSemanticRead = Object.freeze({
    action: {
      id: control.control.action.id,
      version: control.control.action.contractVersion,
    },
    operation: {
      id: operation.operationId,
      publicationSlot: [
        operation.identity.publicationRef,
        operation.identity.businessId,
        operation.identity.bindingId,
      ].join(':'),
      publicationRevision: operation.identity.publicationRevision,
      materialDigest: operation.materialDigest,
      transportConfigDigest: operation.identity.transportConfigDigest,
      paymentIdentity: operation.identity.payment,
      price: operation.identity.price,
    },
    prepared: {
      inputDigest: source.input.inputDigest,
      materialDigest: control.preparedMaterialDigest ?? '',
      targetDigest: control.preparedTargetDigest ?? '',
    },
    identity: {
      invocationRef: control.invocationRef,
      invocationVersion: control.invocationVersion,
      origin: control.control.origin,
      principalRef: control.control.owner.principalRef,
      callerRef: control.control.owner.callerRef,
    },
    authority: {
      reference: control.authorityBinding.reference,
      kind: accepted.kind,
      generation: accepted.kind === 'standing_mandate_use' ? accepted.mandateGeneration : null,
      bindingDigest: control.authorityBinding.digest,
      bounds: {
        targetDigest: control.authorityBinding.targetDigest,
        consequence: control.authorityBinding.consequence,
        limits: control.authorityBinding.limits,
        expiresAt: control.authorityBinding.expiresAt,
      },
    },
    attempt: attempt === undefined ? null : {
      attemptRef: attempt.attemptRef,
      leaseOwner: attempt.lease.owner,
      effectGeneration: attempt.effectGeneration,
      idempotency: attempt.idempotency,
    },
    resolution: {
      controlState: control.control.control.state,
      semanticOwnerRef: claim?.ownerInvocationRef ?? null,
      semanticStatus: claim?.status ?? null,
      semanticOutcomeDigest: claim?.outcome === undefined
        ? null
        : canonicalDigest(claim.outcome),
      release: attempt?.release ?? null,
      evidenceDigest: canonicalDigest(historyGroup.rows),
      resultIdentity: source.resultIdentity ?? null,
      sourceResultDigest: control.sourceResultDigest ?? null,
    },
  })
  const snapshotDigest = canonicalDigest(snapshot)
  const semanticDigest = canonicalDigest(semanticRead)
  const readRef = `host-read:${canonicalDigest({
    host: input.host,
    invocationRef: semanticRead.identity.invocationRef,
    snapshotDigest,
    semanticDigest,
  })}`
  const material = {
    format: 'action-invocation-host-read:development:v2' as const,
    host: input.host,
    readRef,
    readAt: control.updatedAt,
    snapshotDigest,
    semanticRead,
    semanticDigest,
    provenance: 'LOCAL DEVELOPMENT DIGEST; NO EXTERNAL SIGNATURE OR ROOT' as const,
  }
  return Object.freeze({
    ...material,
    receiptDigest: canonicalDigest(material),
  })
}

export function verifyDevelopmentHostReadReceipt(receipt: DevelopmentHostReadReceipt): void {
  const { receiptDigest, ...material } = receipt
  if (canonicalDigest(material) !== receiptDigest) {
    throw new Error('host_read_receipt_digest_invalid')
  }
  if (canonicalDigest(receipt.semanticRead) !== receipt.semanticDigest) {
    throw new Error('host_read_semantic_digest_invalid')
  }
  const expectedReadRef = `host-read:${canonicalDigest({
    host: receipt.host,
    invocationRef: receipt.semanticRead.identity.invocationRef,
    snapshotDigest: receipt.snapshotDigest,
    semanticDigest: receipt.semanticDigest,
  })}`
  if (receipt.readRef !== expectedReadRef) throw new Error('host_read_reference_invalid')
}
