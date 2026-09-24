import { mutation } from './_generated/server'
import { recoveryAdmissionValue, recoveryApprovalValue } from '../src/modules/authority/recovery/public'
import {
  authorizeRecoveryOperationArgs,
  submitRecoveryApprovalArgs,
} from './lib/authority/breakGlass/contracts'
import { submitRecoveryApprovalMutationHandler } from './lib/authority/breakGlass/approval'
import { authorizeRecoveryOperationHandler } from './lib/authority/breakGlass/authorization'

export const submitRecoveryApproval = mutation({
  args: submitRecoveryApprovalArgs.fields,
  returns: recoveryApprovalValue,
  handler: submitRecoveryApprovalMutationHandler,
})

export const authorizeRecoveryOperation = mutation({
  args: authorizeRecoveryOperationArgs.fields,
  returns: recoveryAdmissionValue,
  handler: authorizeRecoveryOperationHandler,
})
