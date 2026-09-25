import { v, type Infer } from 'convex/values'
import { recoveryActionValue } from '../../../../src/modules/authority/recovery/public'

export const submitRecoveryApprovalArgs = v.object({
  approvalRef: v.string(),
  accountRef: v.string(),
  action: recoveryActionValue,
})
export type SubmitRecoveryApprovalInput = Infer<typeof submitRecoveryApprovalArgs>

export const authorizeRecoveryOperationArgs = v.object({
  action: recoveryActionValue,
  accountRef: v.string(),
  grantRef: v.string(),
  expectedGrantGeneration: v.number(),
  approvalRefs: v.array(v.string()),
  correlationRef: v.string(),
  idempotencyRef: v.string(),
})

export type AuthorizeRecoveryOperationInput = Infer<typeof authorizeRecoveryOperationArgs>
