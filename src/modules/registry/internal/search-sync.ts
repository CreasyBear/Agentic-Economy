import type { SourceHash } from '@/modules/common/ids'
import type {
  RegistrySearchSyncAttemptContract,
  RegistrySearchSyncOperation,
} from '@/modules/registry/public'
import type { CatalogSearchTaskReadback } from './catalog-search-port'
import type { RegistrySearchDocument } from './search-documents'

export type QueueRegistrySearchSyncAttemptInput =
  | {
      attemptId: string
      operation: Extract<RegistrySearchSyncOperation, 'upsert'>
      document: RegistrySearchDocument & { sourceHash?: SourceHash }
      meiliTaskUid?: string
      now: number
    }
  | {
      attemptId: string
      operation: Extract<RegistrySearchSyncOperation, 'delete' | 'suppress'>
      documentId: string
      businessSlug: string
      serviceSlug: string
      sourceHash?: SourceHash
      generatedHash?: SourceHash
      meiliTaskUid?: string
      now: number
    }

export function queueRegistrySearchSyncAttempt(
  input: QueueRegistrySearchSyncAttemptInput,
): RegistrySearchSyncAttemptContract {
  const base =
    input.operation === 'upsert'
      ? {
          documentId: input.document.documentId,
          businessSlug: input.document.businessSlug,
          serviceSlug: input.document.serviceSlug,
          sourceHash: input.document.sourceHash,
          generatedHash: input.document.generatedHash,
        }
      : {
          documentId: input.documentId,
          businessSlug: input.businessSlug,
          serviceSlug: input.serviceSlug,
          sourceHash: input.sourceHash,
          generatedHash: input.generatedHash,
        }

  return {
    attemptId: input.attemptId,
    documentId: base.documentId,
    businessSlug: base.businessSlug,
    serviceSlug: base.serviceSlug,
    operation: input.operation,
    status: 'queued',
    ...(input.meiliTaskUid === undefined ? {} : { meiliTaskUid: input.meiliTaskUid }),
    ...(base.sourceHash === undefined ? {} : { sourceHash: base.sourceHash }),
    ...(base.generatedHash === undefined ? {} : { generatedHash: base.generatedHash }),
    retryCount: 0,
    startedAt: input.now,
  }
}

export function applyRegistrySearchTaskReadback(
  attempt: RegistrySearchSyncAttemptContract,
  readback: CatalogSearchTaskReadback,
  now: number,
): RegistrySearchSyncAttemptContract {
  if (readback.status === 'succeeded') {
    const cleared = withoutErrorFields(attempt)
    return {
      ...cleared,
      meiliTaskUid: readback.taskUid,
      status: 'succeeded',
      finishedAt: now,
    }
  }

  if (readback.status === 'failed' || readback.status === 'canceled') {
    return {
      ...attempt,
      meiliTaskUid: readback.taskUid,
      status: 'failed',
      finishedAt: now,
      lastErrorCode: readback.errorCode ?? readback.status,
      lastErrorRedacted: readback.errorMessage ?? 'Search sync task failed.',
    }
  }

  return {
    ...attempt,
    meiliTaskUid: readback.taskUid,
    status: 'queued',
  }
}

export function markRegistrySearchSyncStale(
  attempt: RegistrySearchSyncAttemptContract,
  input: {
    currentSourceHash?: SourceHash
    currentGeneratedHash?: SourceHash
    now: number
  },
): RegistrySearchSyncAttemptContract {
  const sourceChanged =
    attempt.sourceHash !== undefined &&
    input.currentSourceHash !== undefined &&
    attempt.sourceHash !== input.currentSourceHash
  const generatedChanged =
    attempt.generatedHash !== undefined &&
    input.currentGeneratedHash !== undefined &&
    attempt.generatedHash !== input.currentGeneratedHash

  if (!sourceChanged && !generatedChanged) {
    return attempt
  }

  return {
    ...attempt,
    status: 'stale',
    staleReason: sourceChanged ? 'source_hash_changed' : 'generated_hash_changed',
    finishedAt: input.now,
  }
}

export function retryRegistrySearchSyncAttempt(
  attempt: RegistrySearchSyncAttemptContract,
  input: { retryAfter: number; now: number },
): RegistrySearchSyncAttemptContract {
  const cleared = withoutErrorFields(attempt)
  const { finishedAt: _finishedAt, ...withoutFinishedAt } = cleared
  void _finishedAt

  return {
    ...withoutFinishedAt,
    status: 'queued',
    retryCount: attempt.retryCount + 1,
    retryAfter: input.retryAfter,
    startedAt: input.now,
  }
}

function withoutErrorFields(
  attempt: RegistrySearchSyncAttemptContract,
): RegistrySearchSyncAttemptContract {
  const {
    lastErrorCode: _lastErrorCode,
    lastErrorRedacted: _lastErrorRedacted,
    ...rest
  } = attempt
  void _lastErrorCode
  void _lastErrorRedacted
  return rest
}
