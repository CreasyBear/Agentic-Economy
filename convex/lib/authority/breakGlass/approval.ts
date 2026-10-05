import type { MutationCtx } from '../../../_generated/server'
import {
  ProductionRecoveryService,
  type RecoveryApprovalIntent,
  type VerifiedBreakGlassApproval,
} from '../../../../src/modules/authority/recovery/public'
import { accountRef } from '../../../../src/modules/principal-account/public'
import { resolveRecoveryAccountFacts } from './accountFacts'
import { resolveRecoveryOperator, trustedRecoveryApprovalAttestation } from './operator'
import { approvalForStorage, createConvexRecoveryPersistence } from './persistence'
import type { SubmitRecoveryApprovalInput } from './contracts'

export async function submitRecoveryApprovalHandler(
  ctx: MutationCtx,
  intent: RecoveryApprovalIntent,
): Promise<VerifiedBreakGlassApproval> {
  const now = Date.now()
  const operator = await resolveRecoveryOperator(ctx, intent.accountRef, now)
  const facts = await resolveRecoveryAccountFacts(ctx, intent.accountRef)
  return await new ProductionRecoveryService({
    persistence: createConvexRecoveryPersistence(ctx),
    accountFacts: { resolve: async () => facts },
    approvalVerifier: {
      verify: async (request) => trustedRecoveryApprovalAttestation(request, operator),
    },
    now: () => now,
  }).recordApproval(intent)
}

export async function submitRecoveryApprovalMutationHandler(
  ctx: MutationCtx,
  args: SubmitRecoveryApprovalInput,
) {
  return approvalForStorage(await submitRecoveryApprovalHandler(ctx, {
    approvalRef: args.approvalRef,
    accountRef: accountRef(args.accountRef),
    action: args.action,
  }))
}
