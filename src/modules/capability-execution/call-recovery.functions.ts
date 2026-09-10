import { auth } from '@clerk/tanstack-react-start/server'
import { createServerFn } from '@tanstack/react-start'

import { callSourceAction, sourceAction } from '@/lib/server/convex-source'
import {
  callCancelInputSchema,
  callRecoveryResultSchema,
  callStatusResultSchema,
  callReconcileInputSchema,
  callStatusInputSchema,
  type CallCancelActionInput,
  type CallReconcileActionInput,
  type CallStatusActionInput,
} from './call-recovery.actions'
import type {
  CallRecoveryResult,
  CallStatusResult,
} from './call-recovery-contracts'

const owner = async (): Promise<{ userId: string } | undefined> => {
  const identity = await auth()
  return identity.isAuthenticated && identity.userId !== null ? { userId: identity.userId } : undefined
}

const invocationNotFound = (callRef: string) => ({
  kind: 'refused' as const,
  callRef,
  code: 'invocation_not_found' as const,
  retryable: false,
})

const readOwnerCallStatusSourceAction = sourceAction<CallStatusActionInput, CallStatusResult>(
  'capabilityCalls:readOwnerCallStatus',
)
const cancelOwnerCallSourceAction = sourceAction<CallCancelActionInput, CallRecoveryResult>(
  'capabilityCalls:cancelOwnerCall',
)
const reconcileOwnerCallSourceAction = sourceAction<CallReconcileActionInput, CallRecoveryResult>(
  'capabilityCalls:reconcileOwnerCall',
)

export const readOwnerCallStatusServer = createServerFn({ method: 'GET' })
  .validator((data) => callStatusInputSchema.parse(data))
  .handler(async ({ data }): Promise<CallStatusResult> => {
    if (await owner() === undefined) return invocationNotFound(data.callRef)
    return callStatusResultSchema.parse(await callSourceAction(readOwnerCallStatusSourceAction, data))
  })

export const cancelOwnerCallServer = createServerFn({ method: 'POST' })
  .validator((data) => callCancelInputSchema.parse(data))
  .handler(async ({ data }): Promise<CallRecoveryResult> => {
    if (await owner() === undefined) return invocationNotFound(data.callRef)
    return callRecoveryResultSchema.parse(await callSourceAction(cancelOwnerCallSourceAction, data))
  })

export const reconcileOwnerCallServer = createServerFn({ method: 'POST' })
  .validator((data) => callReconcileInputSchema.parse(data))
  .handler(async ({ data }): Promise<CallRecoveryResult> => {
    if (await owner() === undefined) return invocationNotFound(data.callRef)
    return callRecoveryResultSchema.parse(await callSourceAction(reconcileOwnerCallSourceAction, data))
  })
