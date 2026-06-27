import { describe, expect, it } from 'vitest'

import { brandNonEmpty } from '@/modules/common/ids'
import type { OperationKeyRecord } from '@/modules/observability/public'
import { markOperationSucceeded, reserveOperationKey } from '@/modules/observability/internal/operation-keys'

describe('operation key contract', () => {
  it('reserves a new operation key and replays same-key successes', () => {
    const store = new MemoryOperationKeyStore()
    const input = operationInput()
    const first = reserveOperationKey(store, input, store)

    expect(first.kind).toBe('ok')
    expect(first.code).toBe('operation_reserved')

    if (first.kind === 'ok') {
      store.save(markOperationSucceeded(first.record, brandNonEmpty('hash:result', 'SourceHash'), ['audit:1'], 20))
    }

    const replay = reserveOperationKey(store, input, store)

    expect(replay).toMatchObject({
      kind: 'ok',
      code: 'operation_replayed',
      record: { resultHash: 'hash:result', effectRefs: ['audit:1'] },
    })
  })

  it('rejects same key with a different request hash and records the conflict', () => {
    const store = new MemoryOperationKeyStore()
    reserveOperationKey(store, operationInput(), store)

    const conflict = reserveOperationKey(
      store,
      { ...operationInput(), requestHash: brandNonEmpty('hash:changed', 'SourceHash') },
      store
    )

    expect(conflict).toMatchObject({
      kind: 'error',
      code: 'operation_key_conflict',
      retryable: false,
      reason: 'same_key_different_request',
    })
    expect(store.conflictCount).toBe(1)
  })

  it('returns retryable state for in-progress same-key retries', () => {
    const store = new MemoryOperationKeyStore()
    reserveOperationKey(store, operationInput(), store)

    const retry = reserveOperationKey(store, operationInput(), store)

    expect(retry).toMatchObject({
      kind: 'ok',
      code: 'operation_retryable',
      record: { status: 'in_progress', retryAfter: 40_000 },
    })
  })
})

function operationInput() {
  return {
    scope: 'catalog',
    actorKind: 'owner',
    actorRef: 'owner:1',
    operationName: 'publish',
    key: brandNonEmpty('op:publish:1', 'OperationKey'),
    requestHash: brandNonEmpty('hash:request', 'SourceHash'),
    now: 10_000,
  } as const
}

class MemoryOperationKeyStore {
  private record: OperationKeyRecord | undefined
  conflictCount = 0

  find(): OperationKeyRecord | undefined {
    return this.record
  }

  save(record: OperationKeyRecord): OperationKeyRecord {
    this.record = record
    return record
  }

  recordConflict(): void {
    this.conflictCount += 1
  }
}
