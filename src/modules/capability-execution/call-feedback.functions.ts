import { auth } from '@clerk/tanstack-react-start/server'
import { createServerFn } from '@tanstack/react-start'
import { setResponseHeader } from '@tanstack/react-start/server'
import { z } from 'zod'
import { callSourceMutation, callSourceQuery, sourceMutation, sourceQuery } from '@/lib/server/convex-source'
import { sourceWriteAdmissionFromContext, sourceWriteRequestFromAdmission } from '@/lib/server/source-write-admission'
import type { SourceWriteAdmission, SourceWriteAdmissionRequest } from '@/modules/security/source-write-admission'
import { callFeedbackInputSchema, callFeedbackViewSchema, type CallFeedback, type CallFeedbackView } from './call-feedback'

const read = sourceQuery<{ callRef: string }, CallFeedbackView>('capabilityCallFeedback:readOwner')
const write = sourceMutation<{ callRef: string; feedback: CallFeedback; operationKey: string; correlationId: string;
  sourceWrite: SourceWriteAdmission; sourceWriteRequest: SourceWriteAdmissionRequest }, CallFeedbackView>('capabilityCallFeedback:writeOwner')
const ownerRequired = (): CallFeedbackView => ({ kind: 'refused', code: 'owner_required' })

export const readOwnerCallFeedbackServer = createServerFn({ method: 'GET' })
  .validator(data => z.strictObject({ callRef: callFeedbackInputSchema.shape.callRef }).parse(data))
  .handler(async ({ data }): Promise<CallFeedbackView> => {
    setResponseHeader('cache-control', 'private, no-store')
    if (!(await auth()).isAuthenticated) return ownerRequired()
    const view = callFeedbackViewSchema.parse(await callSourceQuery(read, data))
    return view.kind === 'ready' && view.expiresAt !== null && view.expiresAt <= Date.now()
      ? { ...view, feedback: null, expiresAt: null } : view
  })

export const writeOwnerCallFeedbackServer = createServerFn({ method: 'POST' })
  .validator(data => callFeedbackInputSchema.parse(data))
  .handler(async ({ data, context }): Promise<CallFeedbackView> => {
    setResponseHeader('cache-control', 'private, no-store')
    if (!(await auth()).isAuthenticated) return ownerRequired()
    const operationKey = `feedback:${crypto.randomUUID()}`
    const command = { ...data, operationKey, correlationId: operationKey }
    const sourceWrite = await sourceWriteAdmissionFromContext({ context, command, scope: 'protected_action', operationKey, correlationId: operationKey })
    return callFeedbackViewSchema.parse(await callSourceMutation(write, { ...command, sourceWrite, sourceWriteRequest: sourceWriteRequestFromAdmission(sourceWrite) }))
  })
