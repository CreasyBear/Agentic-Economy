import { auth } from '@clerk/tanstack-react-start/server'
import { createServerFn } from '@tanstack/react-start'

import { callSourceAction, sourceAction } from '@/lib/server/convex-source'
import {
  operationCancelInputSchema,
  operationInvokeRecoveryResultSchema,
  operationInvokeStatusResultSchema,
  operationReconcileInputSchema,
  operationStatusInputSchema,
  type OperationCancelActionInput,
  type OperationReconcileActionInput,
  type OperationStatusActionInput,
} from './operation-recovery.actions'
import type {
  OperationInvokeRecoveryResult,
  OperationInvokeStatusResult,
} from './operation-recovery-contracts'

const owner = async (): Promise<{ userId: string } | undefined> => {
  const identity = await auth()
  return identity.isAuthenticated && identity.userId !== null ? { userId: identity.userId } : undefined
}

const invocationNotFound = (invocationRef: string) => ({
  kind: 'refused' as const,
  invocationRef,
  code: 'invocation_not_found' as const,
  retryable: false,
})

const readOwnerInvocationStatusSourceAction = sourceAction<OperationStatusActionInput, OperationInvokeStatusResult>(
  'capabilityOperationInvocations:readOwnerInvocationStatus',
)
const cancelOwnerInvocationSourceAction = sourceAction<OperationCancelActionInput, OperationInvokeRecoveryResult>(
  'capabilityOperationInvocations:cancelOwnerInvocation',
)
const reconcileOwnerInvocationSourceAction = sourceAction<OperationReconcileActionInput, OperationInvokeRecoveryResult>(
  'capabilityOperationInvocations:reconcileOwnerInvocation',
)

export const readOwnerInvocationStatusServer = createServerFn({ method: 'GET' })
  .validator((data) => operationStatusInputSchema.parse(data))
  .handler(async ({ data }): Promise<OperationInvokeStatusResult> => {
    if (await owner() === undefined) return invocationNotFound(data.invocationRef)
    return operationInvokeStatusResultSchema.parse(await callSourceAction(readOwnerInvocationStatusSourceAction, data))
  })

export const cancelOwnerInvocationServer = createServerFn({ method: 'POST' })
  .validator((data) => operationCancelInputSchema.parse(data))
  .handler(async ({ data }): Promise<OperationInvokeRecoveryResult> => {
    if (await owner() === undefined) return invocationNotFound(data.invocationRef)
    return operationInvokeRecoveryResultSchema.parse(await callSourceAction(cancelOwnerInvocationSourceAction, data))
  })

export const reconcileOwnerInvocationServer = createServerFn({ method: 'POST' })
  .validator((data) => operationReconcileInputSchema.parse(data))
  .handler(async ({ data }): Promise<OperationInvokeRecoveryResult> => {
    if (await owner() === undefined) return invocationNotFound(data.invocationRef)
    return operationInvokeRecoveryResultSchema.parse(await callSourceAction(reconcileOwnerInvocationSourceAction, data))
  })
