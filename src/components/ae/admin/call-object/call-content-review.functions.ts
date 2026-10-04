import { createServerFn } from '@tanstack/react-start'
import { setResponseHeader } from '@tanstack/react-start/server'
import { adminCommandRequestSchema, type AdminCommandRequest } from '../actions/actions.contracts'
import { readClerkMfaConsequenceProof, type ClerkMfaConsequenceProofInput } from '@/lib/server/clerk-consequence-proof'
import { callSourceMutation, sourceMutation } from '@/lib/server/convex-source'
import { sourceWriteAdmissionFromContext, sourceWriteRequestFromAdmission } from '@/lib/server/source-write-admission'
import type { SourceWriteAdmission, SourceWriteAdmissionRequest } from '@/modules/security/source-write-admission'
import type { CallContentReview } from '@/lib/operator/admin-console/call-content-review'

type ReviewRequest = Extract<AdminCommandRequest, { action: 'review_call_content' }>
const review = sourceMutation<ReviewRequest & { proof?: ClerkMfaConsequenceProofInput;
  sourceWrite: SourceWriteAdmission; sourceWriteRequest: SourceWriteAdmissionRequest }, CallContentReview>('adminCallContent:review')

/** The private result stays outside generic command analytics and receipts. */
export const reviewCallContentServer = createServerFn({ method: 'POST' })
  .validator(data => {
    const request = adminCommandRequestSchema.parse(data)
    if (request.action !== 'review_call_content') throw new Error('invalid_content_review')
    return request
  })
  .handler(async ({ data, context }): Promise<CallContentReview> => {
    setResponseHeader('cache-control', 'private, no-store')
    const proof = await readClerkMfaConsequenceProof()
    const command = { ...data, ...(proof === undefined ? {} : { proof }) }
    const sourceWrite = await sourceWriteAdmissionFromContext({ context, command, scope: 'admin_operator',
      operationKey: data.operationKey, correlationId: data.correlationId })
    return await callSourceMutation(review, { ...command, sourceWrite, sourceWriteRequest: sourceWriteRequestFromAdmission(sourceWrite) })
  })
