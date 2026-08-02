import { z } from 'zod'

import {
  callSourceMutation,
  ConvexSourceError,
  sourceMutation,
} from '@/lib/server/convex-source'

import {
  workTreeApprovalIssueInputSchema,
  workTreeApprovalIssueReceiptSchema,
  type WorkTreeApprovalIssueInput,
  type WorkTreeApprovalIssueReceipt,
} from './internal/approval'

const issueWorkTreeApprovalSourceMutation = sourceMutation<WorkTreeApprovalIssueInput, Record<string, unknown>>('workTreeApprovals:issue')

const workTreeApprovalRefusalSchema = z.strictObject({
  kind: z.literal('refused'),
  code: z.string().trim().min(1),
})
export const workTreeApprovalIssueResultSchema = z.discriminatedUnion('kind', [
  workTreeApprovalIssueReceiptSchema,
  workTreeApprovalRefusalSchema,
])
export type WorkTreeApprovalIssueResult = z.infer<typeof workTreeApprovalIssueResultSchema>

export async function issueWorkTreeApprovalThroughSource(input: WorkTreeApprovalIssueInput): Promise<WorkTreeApprovalIssueResult> {
  const parsedInput = workTreeApprovalIssueInputSchema.parse(input)
  try {
    const result = await callSourceMutation(issueWorkTreeApprovalSourceMutation, parsedInput)
    return workTreeApprovalIssueResultSchema.parse(result)
  } catch (error) {
    if (error instanceof ConvexSourceError && error.code === 'missing_auth') {
      return { kind: 'refused', code: 'authentication_required' }
    }
    return { kind: 'refused', code: 'source_unavailable' }
  }
}
