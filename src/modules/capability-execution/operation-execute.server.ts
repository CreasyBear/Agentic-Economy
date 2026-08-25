import { Agent, fetch as guardedFetch } from 'undici'
import { createGuardedLookup, defaultDnsResolver, isPublicHttpTarget } from '@/modules/network-guard/public'
import {
  convexKeylessExecutableSource,
  type KeylessExecutableSourcePort,
} from './operation-execute.actions'
import {
  executeOperation,
  type OperationExecuteDeps,
  type OperationExecuteInput,
  type OperationExecuteResult,
} from './operation-execute.functions'

const EXECUTION_RETRY_BACKOFF_MS = 250

function isRetryableExecutionFailure(result: OperationExecuteResult): boolean {
  return result.kind === 'error'
    && result.retryable
    && (result.code === 'fetch_failed' || result.code === 'source_unavailable')
}

export async function executeKeylessOperation(
  input: OperationExecuteInput,
  source: KeylessExecutableSourcePort = convexKeylessExecutableSource,
  operationExecuteDeps?: Partial<Pick<OperationExecuteDeps, 'isPublicTarget' | 'fetchImpl' | 'signal'>>,
  expectedExecutionBindingDigest?: string,
): Promise<OperationExecuteResult> {
  const dispatcher = operationExecuteDeps?.fetchImpl === undefined
    ? new Agent({ connect: { lookup: createGuardedLookup(defaultDnsResolver) } })
    : undefined
  const fetchImpl: OperationExecuteDeps['fetchImpl'] = operationExecuteDeps?.fetchImpl
    ?? ((request, init) => guardedFetch(
      request as Parameters<typeof guardedFetch>[0],
      { ...init, dispatcher } as Parameters<typeof guardedFetch>[1],
    ))
  const isPublicTarget = operationExecuteDeps?.isPublicTarget
    ?? ((url: URL) => isPublicHttpTarget(url, defaultDnsResolver))
  try {
    const result = await executeOperation(input, {
      readDescriptor: (operationRef) => source.read(operationRef),
      isPublicTarget,
      fetchImpl,
      ...(operationExecuteDeps?.signal === undefined
        ? {}
        : { signal: operationExecuteDeps.signal }),
    }, expectedExecutionBindingDigest)
    if (!isRetryableExecutionFailure(result)) {
      return reclassifyKnownIneligibleOperation(result, input.operationRef, source)
    }
    operationExecuteDeps?.signal?.throwIfAborted()
    await new Promise<void>((resolve) => setTimeout(resolve, EXECUTION_RETRY_BACKOFF_MS))
    operationExecuteDeps?.signal?.throwIfAborted()
    const retryResult = await executeOperation(input, {
      readDescriptor: (operationRef) => source.read(operationRef),
      isPublicTarget,
      fetchImpl,
      ...(operationExecuteDeps?.signal === undefined
        ? {}
        : { signal: operationExecuteDeps.signal }),
    }, expectedExecutionBindingDigest)
    return reclassifyKnownIneligibleOperation(retryResult, input.operationRef, source)
  } finally {
    if (dispatcher !== undefined) await dispatcher.close().catch(() => undefined)
  }
}

async function reclassifyKnownIneligibleOperation(
  result: OperationExecuteResult,
  operationRef: string,
  source: KeylessExecutableSourcePort,
): Promise<OperationExecuteResult> {
  if (
    result.kind !== 'refused'
    || result.reason !== 'operation_not_found'
    || source.readPublic === undefined
  ) return result

  try {
    const publicOperation = await source.readPublic(operationRef)
    if (publicOperation === null) return result
    return {
      kind: 'refused',
      operationRef,
      reason: publicOperation.authentication.kind === 'keyless'
        ? 'operation_not_executable'
        : 'operation_not_keyless',
    }
  } catch {
    return result
  }
}
