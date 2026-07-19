import { canonicalDigest } from '@/modules/common/canonical-digest'
import type { StableHashValue } from '@/modules/common/stable-hash'

import {
  assertDynamicPublishedSnapshotShape,
} from './dynamic-published-snapshot-verifier'

export type DevelopmentHostKind = 'request_owned_human' | 'standalone_external_agent'

export type DevelopmentHostSemanticRead = Readonly<{
  action: Readonly<{ id: string; version: string }>
  invocation: Readonly<{ ref: string; version: number }>
  publication: Readonly<{ slot: string; revision: number; materialDigest: string; configDigest: string }>
  payment: Readonly<{ identityDigest: string; amountMinor: number; currency: string }>
  prepared: Readonly<{ inputDigest: string; targetDigest: string }>
  identity: Readonly<{ originDigest: string; principalRef: string; callerRef: string }>
  authority: Readonly<{ mandateKind: string; acceptedDigest: string; generation: number | null }>
  control: Readonly<{
    attemptRef: string | null
    leaseOwner: string | null
    effectGeneration: number | null
    idempotencyDigest: string | null
    state: string
    outcomeDigest: string
  }>
  source: Readonly<{
    semanticOwnerRef: string | null
    semanticStatus: string | null
    releaseDigest: string | null
    evidenceDigest: string
    resultIdentityDigest: string | null
  }>
}>

export type DevelopmentHostReadReceipt = Readonly<{
  format: 'action-invocation-host-read:development:v1'
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
  readRef: string
  readAt: string
  snapshot: unknown
}>): DevelopmentHostReadReceipt {
  assertDynamicPublishedSnapshotShape(input.snapshot)
  const snapshot = input.snapshot
  const source = snapshot.sourceRows[0]!
  const control = snapshot.controls[0]!
  const attempt = snapshot.attempts[0]!.rows.at(-1)
  const claim = snapshot.semanticClaims[0]
  const operation = source.operation as any
  const owner = control.control.owner
  const accepted = control.control.acceptedAuthority
  const semanticRead: DevelopmentHostSemanticRead = Object.freeze({
    action: { id: control.control.action.id, version: control.control.action.contractVersion },
    invocation: { ref: control.invocationRef, version: control.invocationVersion },
    publication: {
      slot: `${operation.identity.publicationRef}:${operation.identity.businessId}:${operation.identity.bindingId}`,
      revision: operation.identity.publicationRevision,
      materialDigest: canonicalDigest(operation as StableHashValue),
      configDigest: canonicalDigest(operation.binding.adapter.config as StableHashValue),
    },
    payment: {
      identityDigest: canonicalDigest(operation.identity.payment as StableHashValue),
      amountMinor: control.authorityBinding?.limits.amountMinor ?? 0,
      currency: operation.identity.payment.currency,
    },
    prepared: {
      inputDigest: source.input.inputDigest,
      targetDigest: canonicalDigest(source.input.target as StableHashValue),
    },
    identity: {
      originDigest: canonicalDigest(control.control.origin as StableHashValue),
      principalRef: owner.principalRef,
      callerRef: owner.callerRef,
    },
    authority: {
      mandateKind: accepted?.kind ?? 'none',
      acceptedDigest: canonicalDigest((accepted ?? null) as StableHashValue),
      generation: accepted?.kind === 'standing_mandate_use' ? accepted.mandateGeneration : null,
    },
    control: {
      attemptRef: attempt?.attemptRef ?? null,
      leaseOwner: attempt?.lease.owner ?? null,
      effectGeneration: attempt?.effectGeneration ?? null,
      idempotencyDigest: attempt === undefined
        ? null
        : canonicalDigest({ attemptRef: attempt.attemptRef, effectGeneration: attempt.effectGeneration }),
      state: control.control.control.state,
      outcomeDigest: canonicalDigest({
        terminalBusinessOutcome: control.terminalBusinessOutcome ?? null,
        sourceResultDigest: control.sourceResultDigest ?? null,
        attemptOutcome: attempt?.outcome ?? null,
      } as StableHashValue),
    },
    source: {
      semanticOwnerRef: claim?.ownerInvocationRef ?? null,
      semanticStatus: claim?.status ?? null,
      releaseDigest: attempt?.release === undefined
        ? null
        : canonicalDigest(attempt.release as StableHashValue),
      evidenceDigest: canonicalDigest(snapshot.history[0]!.rows as unknown as StableHashValue),
      resultIdentityDigest: source.resultIdentity === undefined
        ? null
        : canonicalDigest(source.resultIdentity as StableHashValue),
    },
  })
  const semanticDigest = canonicalDigest(semanticRead as StableHashValue)
  const material = {
    format: 'action-invocation-host-read:development:v1' as const,
    host: input.host,
    readRef: input.readRef,
    readAt: input.readAt,
    snapshotDigest: canonicalDigest(snapshot as unknown as StableHashValue),
    semanticRead,
    semanticDigest,
    provenance: 'LOCAL DEVELOPMENT DIGEST; NO EXTERNAL SIGNATURE OR ROOT' as const,
  }
  return Object.freeze({
    ...material,
    receiptDigest: canonicalDigest(material as StableHashValue),
  })
}

export function verifyDevelopmentHostReadReceipt(receipt: DevelopmentHostReadReceipt): void {
  const { receiptDigest, ...material } = receipt
  if (canonicalDigest(material as StableHashValue) !== receiptDigest) {
    throw new Error('host_read_receipt_digest_invalid')
  }
  if (canonicalDigest(receipt.semanticRead as StableHashValue) !== receipt.semanticDigest) {
    throw new Error('host_read_semantic_digest_invalid')
  }
}
