import { Agent, fetch as guardedFetch } from 'undici'
import { createGuardedLookup, defaultDnsResolver, isPublicHttpTarget } from '@/modules/network-guard/public'
import {
  defaultKeylessExecutableSource,
  type KeylessExecutableSourcePort,
} from './operation-execute.actions'
import {
  executeOperation,
  type OperationExecuteDeps,
  type OperationExecuteInput,
  type OperationExecuteResult,
} from './operation-execute.functions'

export async function executeKeylessOperation(
  input: OperationExecuteInput,
  source: KeylessExecutableSourcePort = defaultKeylessExecutableSource,
  operationExecuteDeps?: Pick<OperationExecuteDeps, 'isPublicTarget' | 'fetchImpl'>,
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
    return await executeOperation(input, {
      readDescriptor: (operationRef) => source.read(operationRef),
      isPublicTarget,
      fetchImpl,
    })
  } finally {
    if (dispatcher !== undefined) await dispatcher.close().catch(() => undefined)
  }
}

