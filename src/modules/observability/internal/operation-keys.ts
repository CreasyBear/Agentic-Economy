import type { OperationKey, SourceHash } from '@/modules/common/ids'
import type { ModuleResult } from '@/modules/common/result'
import type { ActorKind, OperationKeyRecord } from '@/modules/observability/public'

export type OperationKeyInput = {
  scope: string
  actorKind: ActorKind
  actorRef: string
  operationName: string
  key: OperationKey
  requestHash: SourceHash
  sourceHash?: SourceHash
  now: number
}

export type OperationKeyAuditSink = {
  recordConflict(input: OperationKeyInput, existing: OperationKeyRecord): void
}

export type OperationKeyStore = {
  find(input: Pick<OperationKeyInput, 'actorRef' | 'operationName' | 'key'>): OperationKeyRecord | undefined
  save(record: OperationKeyRecord): OperationKeyRecord
}

export type OperationKeyDecision = ModuleResult<
  'operation_reserved' | 'operation_replayed' | 'operation_retryable',
  'operation_key_conflict',
  { record: OperationKeyRecord },
  { existing: OperationKeyRecord; reason: 'same_key_different_request' }
>

export function reserveOperationKey(
  store: OperationKeyStore,
  input: OperationKeyInput,
  auditSink: OperationKeyAuditSink
): OperationKeyDecision {
  const existing = store.find(input)

  if (existing === undefined) {
    const reservedRecord: OperationKeyRecord =
      input.sourceHash === undefined
        ? {
            actorRef: input.actorRef,
            actorKind: input.actorKind,
            operationName: input.operationName,
            key: input.key,
            requestHash: input.requestHash,
            status: 'in_progress',
            effectRefs: [],
            createdAt: input.now,
            updatedAt: input.now,
          }
        : {
            actorRef: input.actorRef,
            actorKind: input.actorKind,
            operationName: input.operationName,
            key: input.key,
            requestHash: input.requestHash,
            sourceHash: input.sourceHash,
            status: 'in_progress',
            effectRefs: [],
            createdAt: input.now,
            updatedAt: input.now,
          }

    return {
      kind: 'ok',
      code: 'operation_reserved',
      record: store.save(reservedRecord),
    }
  }

  if (existing.requestHash !== input.requestHash) {
    auditSink.recordConflict(input, existing)
    return {
      kind: 'error',
      code: 'operation_key_conflict',
      retryable: false,
      existing,
      reason: 'same_key_different_request',
    }
  }

  if (existing.status === 'succeeded') {
    return { kind: 'ok', code: 'operation_replayed', record: existing }
  }

  return {
    kind: 'ok',
    code: 'operation_retryable',
    record: {
      ...existing,
      retryAfter: existing.retryAfter ?? input.now + 30_000,
    },
  }
}

export function markOperationSucceeded(
  record: OperationKeyRecord,
  resultHash: SourceHash,
  effectRefs: readonly string[],
  now: number
): OperationKeyRecord {
  return {
    ...record,
    status: 'succeeded',
    resultHash,
    effectRefs,
    updatedAt: now,
  }
}
